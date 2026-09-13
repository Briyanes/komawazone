#!/usr/bin/env node
/**
 * local-import-utils.mjs
 *
 * Shared utilities for local import CLI tool.
 * Combines battle-tested patterns from:
 *   - scripts/download-to-r2-massive.mjs (env, R2, proxy, download)
 *   - src/lib/scrapers/scraper-utils.ts  (chapter image parsing)
 *   - src/lib/scrapers/manga-scraper.ts  (manga metadata parsing)
 *
 * Exports: loadEnv, initSupabase, initR2, ProxyPool, downloadImage,
 *          uploadToR2, r2ObjectExists, parseChapterImages, scrapeMangaMeta,
 *          scrapeChapterList, ProgressBar, sleep, slugify, buildHeaders
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { ProxyAgent, request as undiciRequest } from 'undici';
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// ─── Parallel Worker Pool ────────────────────────────────────────

/**
 * Run async tasks with bounded concurrency (worker pool pattern).
 *
 * @param {Array} items - Items to process
 * @param {Function} fn - Async function(item, index) → result
 * @param {Object} opts
 * @param {number} opts.concurrency - Max parallel tasks (default: 5)
 * @param {Function} opts.onProgress - Called with (completed, total, result) on each completion
 * @param {Function} opts.onError - Called with (error, item, index) on failure (if not thrown)
 * @param {boolean} opts.stopOnError - Stop all on first error (default: false)
 * @returns {Promise<Array>} Results in same order as items
 *
 * @example
 *   const results = await runParallel(urls, downloadUrl, {
 *     concurrency: 10,
 *     onProgress: (done, total) => console.log(`${done}/${total}`)
 *   });
 */
export async function runParallel(items, fn, opts = {}) {
  const {
    concurrency = 5,
    onProgress = null,
    onError = null,
    stopOnError = false,
  } = opts;

  const results = new Array(items.length);
  let completed = 0;
  let failed = 0;
  let nextIndex = 0;
  let fatalError = null;

  async function worker() {
    while (nextIndex < items.length && !fatalError) {
      const myIndex = nextIndex++;
      const item = items[myIndex];

      try {
        const result = await fn(item, myIndex);
        results[myIndex] = { ok: true, value: result };
      } catch (err) {
        failed++;
        results[myIndex] = { ok: false, error: err };

        if (onError) {
          try { onError(err, item, myIndex); } catch {}
        }

        if (stopOnError) {
          fatalError = err;
          return;
        }
      } finally {
        completed++;
        if (onProgress) {
          try { onProgress(completed, items.length, results[myIndex]); } catch {}
        }
      }
    }
  }

  // Spawn `concurrency` workers
  const workers = [];
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return { results, completed, failed, total: items.length };
}

// ─── Env Loader ──────────────────────────────────────────────────

export function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const key = match[1];
        let val = match[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
    console.log('✅ Loaded .env.local');
  } else {
    console.warn('⚠️  No .env.local found at', envPath);
  }
}

export function getRequiredEnv(keys) {
  const missing = keys.filter(k => !process.env[k]);
  if (missing.length > 0) {
    console.error(`❌ Missing env vars: ${missing.join(', ')}`);
    console.error('   Pastikan semua ada di .env.local');
    process.exit(1);
  }
  return Object.fromEntries(keys.map(k => [k, process.env[k]]));
}

// ─── Supabase ────────────────────────────────────────────────────

export function initSupabase() {
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getRequiredEnv([
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);
  return createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

// ─── R2 ──────────────────────────────────────────────────────────

export function initR2() {
  const env = getRequiredEnv([
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ]);

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });

  return {
    client,
    bucket: env.R2_BUCKET,
    /** Upload buffer to R2 with given key. Returns the public URL path. */
    async upload(buffer, contentType, key) {
      await client.send(new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));
      return `/api/r2/image/${key}`;
    },
    /** Check if object already exists in R2 (for resume/skip). */
    async exists(key) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key }));
        return true;
      } catch {
        return false;
      }
    },
  };
}

// ─── Proxy Pool ──────────────────────────────────────────────────

// Same fallback proxies as src/lib/proxy.ts (Webshare 10-IP plan)
// Updated 2026-07-27: New credentials (nyjltniw) — old ones (ozfcoksy) expired
const FALLBACK_PROXIES = [
  '31.59.20.176:6754:nyjltniw:bmybfkz4plhk',
  '31.56.127.193:7684:nyjltniw:bmybfkz4plhk',
  '45.38.107.97:6014:nyjltniw:bmybfkz4plhk',
  '198.105.121.200:6462:nyjltniw:bmybfkz4plhk',
  '64.137.96.74:6641:nyjltniw:bmybfkz4plhk',
  '198.23.243.226:6361:nyjltniw:bmybfkz4plhk',
  '38.154.185.97:6370:nyjltniw:bmybfkz4plhk',
  '84.247.60.125:6095:nyjltniw:bmybfkz4plhk',
  '142.111.67.146:5611:nyjltniw:bmybfkz4plhk',
  '191.96.254.138:6185:nyjltniw:bmybfkz4plhk',
].join(',');

export class ProxyPool {
  constructor(forceProxy = false) {
    this.pool = [];
    this.rrIndex = 0;
    this.badUntil = new Map();
    this.forceProxy = forceProxy;
    this.enabled = !!process.env.PROXY_LIST || forceProxy;
    this.requestCount = 0;        // Proactive rotation counter
    this.rotateEvery = 20;        // Rotate IP every N requests
    this.lastProxy = null;
  }

  init() {
    if (!this.enabled) {
      console.log('⚠️  DIRECT mode — menggunakan IP MacBook (residential, jarang diblokir)');
      console.log('   Gunakan flag --proxy untuk pakai Webshare rotating IPs');
      return;
    }
    const raw = process.env.PROXY_LIST?.trim() || FALLBACK_PROXIES;
    this.pool = this._parse(raw);
    const source = process.env.PROXY_LIST ? 'PROXY_LIST' : 'fallback (Webshare)';
    console.log(`📡 Proxy pool: ${this.pool.length} proxies loaded (${source})`);
    if (this.pool.length === 0) {
      console.warn('⚠️  Tidak ada proxy valid — fallback ke DIRECT mode');
      this.enabled = false;
    }
  }

  _parse(raw) {
    const entries = [];
    for (const token of raw.split(/[,\n]+/)) {
      const parts = token.trim().split(':');
      if (parts.length < 4) continue;
      const [host, portStr, username, ...rest] = parts;
      const password = rest.join(':');
      const port = parseInt(portStr, 10);
      if (host && Number.isFinite(port) && username && password) {
        entries.push({ host, port, username, password });
      }
    }
    return entries;
  }

  pick() {
    if (!this.enabled || this.pool.length === 0) return null;
    const now = Date.now();

    // Proactive rotation: force switch IP every rotateEvery requests
    this.requestCount++;
    if (this.lastProxy && this.requestCount % this.rotateEvery !== 0) {
      // Check if last proxy is still good (not on cooldown)
      if ((this.badUntil.get(this.lastProxy.host) ?? 0) <= now) {
        return this.lastProxy;
      }
    }

    // Pick a new proxy (different from last if possible)
    for (let i = 0; i < this.pool.length; i++) {
      const candidate = this.pool[this.rrIndex % this.pool.length];
      this.rrIndex++;
      if ((this.badUntil.get(candidate.host) ?? 0) <= now) {
        this.lastProxy = candidate;
        return candidate;
      }
    }
    // All on cooldown — force use oldest expired
    const oldest = [...this.badUntil.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) {
      this.badUntil.delete(oldest[0]);
      return this.pool.find(p => p.host === oldest[0]) ?? this.pool[0];
    }
    return this.pool[0];
  }

  markBad(host) {
    this.badUntil.set(host, Date.now() + 60_000);
  }

  agentFor(proxy) {
    if (!proxy) return undefined;
    return new ProxyAgent(
      `http://${proxy.username}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`
    );
  }
}

// ─── HTTP Helpers ────────────────────────────────────────────────

export function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Sleep with random jitter (±30% variance) to avoid robotic request patterns.
 * Example: sleepWithJitter(2000) → sleeps 1400-2600ms
 */
export async function sleepWithJitter(ms) {
  const jitter = ms * 0.3 * (Math.random() * 2 - 1); // ±30%
  const total = Math.max(100, Math.round(ms + jitter));
  return sleep(total);
}

/**
 * Domain-specific delay mapping.
 * CDN image hosts can handle faster requests; HTML source sites need slower.
 */
const DOMAIN_DELAYS = {
  'gmbr.pro': 800,
  'gmbar.xyz': 800,
  'cdn.scroller': 800,
  'i0.wp.com': 600,
  'manhwaland.land': 2500,
  'manhwaland': 2500,
};

export function getDomainDelay(url, defaultMs = 2000) {
  try {
    const host = new URL(url).hostname;
    for (const [domain, delay] of Object.entries(DOMAIN_DELAYS)) {
      if (host.includes(domain)) return delay;
    }
  } catch {}
  return defaultMs;
}

// ─── Custom Errors ───────────────────────────────────────────────

/**
 * Thrown when a CDN/server returns 5xx errors (500, 502, 503, 504, 522, 524).
 * Carries statusCode so callers can implement smart-skip logic
 * (e.g. skip chapter after N consecutive server errors).
 */
export class ServerError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ServerError';
    this.statusCode = statusCode;
    this.isServerError = true;
  }
}

/** HTTP status codes that indicate server-side problems (not our fault). */
export const SERVER_ERROR_CODES = new Set([500, 502, 503, 504, 520, 521, 522, 523, 524]);

// ─── Rate Limiter + Circuit Breaker ──────────────────────────────

export class RateLimiter {
  constructor() {
    this.consecutiveErrors = 0;
    this.maxConsecutive = 10;       // Circuit breaker threshold
    this.rateLimitErrors = 0;        // 429/503 counter
    this.rateLimitThreshold = 3;     // Pause threshold
    this.tripped = false;
    this.totalRequests = 0;
    this.totalErrors = 0;
  }

  /** Record a successful request — resets error counters. */
  ok() {
    this.consecutiveErrors = 0;
    this.rateLimitErrors = 0;
    this.totalRequests++;
  }

  /**
   * Record an error. Returns action to take.
   * @returns {{ pause: number, circuitBreak: boolean }}
   *   pause: ms to wait (0 if none)
   *   circuitBreak: true if circuit breaker tripped
   */
  err(statusCode) {
    this.consecutiveErrors++;
    this.totalErrors++;
    this.totalRequests++;

    // 429 Too Many Requests or 503 Service Unavailable
    if (statusCode === 429 || statusCode === 503) {
      this.rateLimitErrors++;
      if (this.rateLimitErrors >= this.rateLimitThreshold) {
        return { pause: 60_000, circuitBreak: false }; // Pause 60s
      }
      return { pause: 5_000, circuitBreak: false };
    }

    // Circuit breaker
    if (this.consecutiveErrors >= this.maxConsecutive) {
      this.tripped = true;
      return { pause: 0, circuitBreak: true };
    }

    return { pause: 0, circuitBreak: false };
  }

  /** Check if circuit breaker is tripped. */
  isTripped() {
    return this.tripped;
  }

  /** Reset circuit breaker (manual override). */
  reset() {
    this.tripped = false;
    this.consecutiveErrors = 0;
    this.rateLimitErrors = 0;
  }

  /** Get stats summary. */
  stats() {
    return {
      total: this.totalRequests,
      errors: this.totalErrors,
      errorRate: this.totalRequests > 0 ? (this.totalErrors / this.totalRequests * 100).toFixed(1) + '%' : '0%',
      consecutive: this.consecutiveErrors,
      tripped: this.tripped,
    };
  }
}

/** Follow redirects manually (undici request() doesn't auto-follow). */
const REDIRECT_CODES = new Set([301, 302, 303, 307, 308]);

function resolveRedirect(base, location) {
  try {
    return new URL(location, base).toString();
  } catch {
    return location;
  }
}

export function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Known domain redirects — source sites that change subdomains frequently
// When a URL matches an OLD domain, rewrite to the NEW one
const SOURCE_DOMAIN_REDIRECTS = {
  '04x.manhwaland.land': '04x-1s.manhwaland.land',
  '04x-1.manhwaland.land': '04x-1s.manhwaland.land',
  '04x-2.manhwaland.land': '04x-1s.manhwaland.land',
};

/**
 * Rewrite a source URL if its domain is known to be dead/migrated.
 * Can be overridden by --source-domain flag or SOURCE_DOMAIN_OVERRIDE env.
 */
export function rewriteSourceUrl(url) {
  try {
    const parsed = new URL(url);

    // Check env override first
    const envOverride = process.env.SOURCE_DOMAIN_OVERRIDE;
    if (envOverride) {
      parsed.host = envOverride;
      return parsed.toString();
    }

    // Check known redirects
    const newHost = SOURCE_DOMAIN_REDIRECTS[parsed.host];
    if (newHost) {
      parsed.host = newHost;
      return parsed.toString();
    }

    return url;
  } catch {
    return url;
  }
}

// ─── Domain Rotator (DB-backed multi-domain rotation) ───────────
// Reads from `sources` + `source_domains` tables.
// Auto-rotates to next healthy domain when current one fails repeatedly.

/**
 * DomainRotator: Automatically rotates across mirror domains when one goes down.
 * 
 * Usage:
 *   const rotator = new DomainRotator(supabase);
 *   await rotator.init();
 *   const url = rotator.rewrite(url);       // Replace domain with best one
 *   rotator.markFailure(domain);             // Track failure
 *   rotator.markSuccess(domain);             // Track success
 */
export class DomainRotator {
  constructor(supabase) {
    this.supabase = supabase;
    this.sources = new Map();       // sourceSlug → { id, name, theme, domains: [] }
    this.initialized = false;
    this.failThreshold = 3;         // Auto-disable after 3 consecutive failures
    this._refreshInterval = 300_000; // Refresh from DB every 5 min
    this._lastRefresh = 0;
  }

  /** Load all active sources + domains from DB. */
  async init() {
    await this._refresh();
    this.initialized = true;
    const domainCount = [...this.sources.values()].reduce((sum, s) => sum + s.domains.length, 0);
    console.log(`🔀 DomainRotator: ${this.sources.size} sources, ${domainCount} domains loaded`);
  }

  /** Refresh from DB (called automatically every 5 min). */
  async _refresh() {
    try {
      const { data: sources } = await this.supabase
        .from('sources')
        .select('id, name, slug, theme, delay_ms')
        .eq('is_active', true);

      if (!sources) return;

      const { data: domains } = await this.supabase
        .from('source_domains')
        .select('source_id, domain, priority, status, fail_count, auto_disabled_at, requires_cf_bypass')
        .is('auto_disabled_at', null)
        .order('priority', { ascending: true });

      // Group domains by source
      const domainsBySource = new Map();
      for (const d of domains || []) {
        if (!domainsBySource.has(d.source_id)) domainsBySource.set(d.source_id, []);
        domainsBySource.get(d.source_id).push(d);
      }

      this.sources.clear();
      for (const src of sources) {
        this.sources.set(src.slug, {
          ...src,
          domains: domainsBySource.get(src.id) || [],
        });
      }

      this._lastRefresh = Date.now();
    } catch (err) {
      console.warn(`⚠️  DomainRotator refresh failed: ${err.message}`);
    }
  }

  /** Check if refresh needed, then refresh. */
  async _maybeRefresh() {
    if (Date.now() - this._lastRefresh > this._refreshInterval) {
      await this._refresh();
    }
  }

  /**
   * Find which source a URL belongs to, and rewrite to best domain.
   * Returns rewritten URL (or original if no match).
   */
  async rewrite(url) {
    if (!this.initialized) return url;
    await this._maybeRefresh();

    try {
      const parsed = new URL(url);
      const source = this._findSourceByDomain(parsed.host);
      if (!source) return url;

      // Get best domain (first active one by priority)
      const bestDomain = source.domains[0];
      if (!bestDomain || bestDomain.domain === parsed.host) return url;

      parsed.host = bestDomain.domain;
      return parsed.toString();
    } catch {
      return url;
    }
  }

  /** Find source by domain name match. */
  _findSourceByDomain(host) {
    for (const source of this.sources.values()) {
      for (const d of source.domains) {
        // Match if host contains the domain or vice versa
        if (host === d.domain || host.endsWith(`.${d.domain}`) || d.domain.includes(host)) {
          return source;
        }
      }
    }
    return null;
  }

  /**
   * Mark a domain as failed. After threshold, auto-disable in DB.
   */
  async markFailure(domain) {
    try {
      // Find the source_domain record
      for (const source of this.sources.values()) {
        const dm = source.domains.find(d => d.domain === domain || domain.includes(d.domain));
        if (dm) {
          dm.fail_count = (dm.fail_count || 0) + 1;

          // Update DB
          await this.supabase
            .from('source_domains')
            .update({
              fail_count: dm.fail_count,
              last_fail: new Date().toISOString(),
              status: dm.fail_count >= this.failThreshold ? 'down' : 'degraded',
              ...(dm.fail_count >= this.failThreshold ? { auto_disabled_at: new Date().toISOString() } : {}),
            })
            .eq('source_id', source.id)
            .eq('domain', dm.domain);

          if (dm.fail_count >= this.failThreshold) {
            console.warn(`🚨 Domain ${dm.domain} auto-disabled after ${dm.fail_count} failures`);
            // Remove from in-memory list so next rewrite picks a different domain
            source.domains = source.domains.filter(d => d.domain !== dm.domain);
          }
          return;
        }
      }
    } catch (err) {
      // Non-fatal — domain rotation is best-effort
    }
  }

  /**
   * Mark a domain as healthy.
   */
  async markSuccess(domain) {
    try {
      for (const source of this.sources.values()) {
        const dm = source.domains.find(d => d.domain === domain || domain.includes(d.domain));
        if (dm && (dm.fail_count > 0 || dm.status !== 'healthy')) {
          dm.fail_count = 0;
          dm.status = 'healthy';
          await this.supabase
            .from('source_domains')
            .update({
              fail_count: 0,
              status: 'healthy',
              last_ok: new Date().toISOString(),
            })
            .eq('source_id', source.id)
            .eq('domain', dm.domain);
          return;
        }
      }
    } catch {}
  }
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
];

export function buildHeaders(url, isImage = false, refererUrl = null) {
  // For image downloads from CDN (gmbr.pro etc.), use the SOURCE SITE as Referer
  // instead of the CDN origin — this bypasses anti-hotlink protection.
  // For HTML page fetches, use the URL's own origin.
  let origin = 'https://04x-1s.manhwaland.land/';
  if (refererUrl) {
    // Explicit Referer override (e.g., chapter page URL)
    try { origin = new URL(refererUrl).origin + '/'; } catch {}
  } else if (isImage) {
    // For images: use source site domain, not CDN domain
    try {
      const parsed = new URL(url);
      const host = parsed.hostname;
      if (host.includes('gmbr.pro') || host.includes('gmbar.xyz') || host.includes('cdn.scroller') || host.includes('i0.wp.com')) {
        // CDN image — Referer must be the source site
        origin = 'https://04x-1s.manhwaland.land/';
      } else {
        origin = parsed.origin + '/';
      }
    } catch {}
  } else {
    try { origin = new URL(url).origin + '/'; } catch {}
  }

  const ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  return {
    'User-Agent': ua,
    'Accept': isImage
      ? 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    'Referer': origin,
    'sec-fetch-dest': isImage ? 'image' : 'document',
    'sec-fetch-mode': 'no-cors',
    'sec-fetch-site': 'cross-site',
  };
}

/**
 * Fetch HTML text from URL with proxy + retry.
 * Returns { html, statusCode }.
 */
export async function fetchHtml(url, proxyPool, { maxRetries = 3, timeoutMs = 30_000, delayMs = 2000, maxRedirects = 5 } = {}) {
  let currentUrl = url.replace(/^http:\/\//, 'https://');
  let redirects = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = proxyPool?.pick();
    const dispatcher = proxyPool?.agentFor(proxy);
    const headers = buildHeaders(currentUrl, false);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await undiciRequest(currentUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      });

      clearTimeout(timer);

      // Handle redirects manually (undici doesn't auto-follow)
      if (REDIRECT_CODES.has(res.statusCode)) {
        const loc = res.headers['location'];
        try { await res.body.dump(); } catch {}
        if (loc && redirects < maxRedirects) {
          redirects++;
          const next = resolveRedirect(currentUrl, Array.isArray(loc) ? loc[0] : loc);
          currentUrl = next.replace(/^http:\/\//, 'https://');
          attempt--; // Don't count redirect as an attempt
          continue;
        }
      }

      if (res.statusCode === 403 || res.statusCode === 429 || res.statusCode === 503) {
        if (proxy) proxyPool.markBad(proxy.host);
        try { await res.body.dump(); } catch {}
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`  ⚠️  ${res.statusCode} — retry in ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(wait);
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (proxy) proxyPool.markBad(proxy.host);
        try { await res.body.dump(); } catch {}
        throw new Error(`HTTP ${res.statusCode}`);
      }

      const html = await res.body.text();
      return { html, statusCode: res.statusCode, finalUrl: currentUrl };
    } catch (err) {
      if (proxy) proxyPool.markBad(proxy.host);
      if (attempt < maxRetries - 1) {
        const wait = delayMs * Math.pow(2, attempt);
        await sleep(wait);
      } else {
        throw new Error(`Failed after ${maxRetries} retries: ${err.message}`);
      }
    }
  }

  throw new Error(`Failed after ${maxRetries} retries`);
}

/**
 * Download an image buffer from URL with proxy + retry.
 * Returns { buffer, contentType }.
 * Options:
 *   refererUrl — Chapter page URL to use as Referer (bypass anti-hotlink)
 */
export async function downloadImage(url, proxyPool, { maxRetries = 3, timeoutMs = 30_000, delayMs = 2000, maxRedirects = 5, refererUrl = null, useBrowserFallback = true } = {}) {
  let currentUrl = url.replace(/^http:\/\//, 'https://');
  let redirects = 0;
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = proxyPool?.pick();
    const dispatcher = proxyPool?.agentFor(proxy);
    const headers = buildHeaders(currentUrl, true, refererUrl);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const res = await undiciRequest(currentUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
        ...(dispatcher ? { dispatcher } : {}),
      });

      clearTimeout(timer);

      // Handle redirects manually (undici doesn't auto-follow)
      if (REDIRECT_CODES.has(res.statusCode)) {
        const loc = res.headers['location'];
        try { await res.body.dump(); } catch {}
        if (loc && redirects < maxRedirects) {
          redirects++;
          const next = resolveRedirect(currentUrl, Array.isArray(loc) ? loc[0] : loc);
          currentUrl = next.replace(/^http:\/\//, 'https://');
          attempt--; // Don't count redirect as an attempt
          continue;
        }
      }

      lastStatus = res.statusCode;

      // Rate-limit / anti-hotlink errors: retry with exponential backoff
      if (res.statusCode === 403 || res.statusCode === 429 || res.statusCode === 503) {
        if (proxy) proxyPool.markBad(proxy.host);
        try { await res.body.dump(); } catch {}
        const wait = delayMs * Math.pow(2, attempt);
        await sleep(wait);
        continue;
      }

      // Server errors (5xx: 500, 502, 522, 524, etc.) — retry with exponential backoff
      // These indicate CDN/server is down, NOT our fault
      if (SERVER_ERROR_CODES.has(res.statusCode)) {
        if (proxy) proxyPool.markBad(proxy.host);
        try { await res.body.dump(); } catch {}
        const wait = Math.min(delayMs * Math.pow(2, attempt), 16_000); // Cap at 16s
        console.warn(`  ⚠️  Server ${res.statusCode} — exponential backoff ${wait / 1000}s (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(wait);
        continue;
      }

      // Other non-2xx: skip (don't waste retries)
      if (res.statusCode < 200 || res.statusCode >= 300) {
        if (proxy) proxyPool.markBad(proxy.host);
        try { await res.body.dump(); } catch {}
        continue;
      }

      const chunks = [];
      for await (const chunk of res.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      if (buffer.length === 0) throw new Error('Empty response');

      const ct = res.headers['content-type'];
      const contentType = Array.isArray(ct) ? ct[0] : (ct || 'image/jpeg');

      return { buffer, contentType };
    } catch (err) {
      if (proxy) proxyPool.markBad(proxy.host);
      if (attempt < maxRetries - 1) {
        await sleep(delayMs * (attempt + 1));
      } else {
        const statusInfo = lastStatus > 0 ? ` (last HTTP ${lastStatus})` : '';

        // Detect DNS-level failures (domain doesn't resolve in system DNS).
        // Chromium uses DoH (DNS over HTTPS) built-in, so it can resolve domains
        // that the system resolver can't (e.g. gmbr.pro returns ENODATA).
        const isDnsError = err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'EAI_AGAIN';

        // Browser fallback for 403 (anti-hotlink) OR DNS errors.
        // Browser won't help if the server is genuinely down (522/503/502 etc.)
        if ((lastStatus === 403 || isDnsError) && useBrowserFallback) {
          const reason = isDnsError ? `DNS fail (${err.code})` : '403 anti-hotlink';
          console.log(`  🔄 undici ${reason} — falling back to browser download...`);
          const browserResult = await downloadImageViaBrowser(currentUrl, { timeoutMs: 15_000, retries: 2, refererUrl });
          if (browserResult) {
            console.log(`  ✅ Browser download succeeded!`);
            return browserResult;
          }
        }

        // Throw typed ServerError for 5xx so callers can smart-skip
        if (SERVER_ERROR_CODES.has(lastStatus)) {
          throw new ServerError(`Failed after ${maxRetries} retries (last HTTP ${lastStatus})`, lastStatus);
        }

        throw new Error(`Failed after ${maxRetries} retries${statusInfo}: ${err.message}`);
      }
    }
  }

  // After loop exhaustion — only reach here if all retries `continue`d (5xx/403/429)
  // Browser fallback ONLY for 403 (anti-hotlink), NOT for 5xx (server down — browser can't help)
  if (useBrowserFallback && lastStatus === 403) {
    console.log(`  🔄 undici exhausted — falling back to browser download...`);
    const browserResult = await downloadImageViaBrowser(currentUrl, { timeoutMs: 15_000, retries: 2, refererUrl });
    if (browserResult) {
      console.log(`  ✅ Browser download succeeded!`);
      return browserResult;
    }
  }

  // Throw typed ServerError for 5xx so callers can implement smart-skip logic
  if (SERVER_ERROR_CODES.has(lastStatus)) {
    throw new ServerError(`Failed after ${maxRetries} retries (last HTTP ${lastStatus})`, lastStatus);
  }

  throw new Error(`Failed after ${maxRetries} retries (last HTTP ${lastStatus})`);
}

// ─── Browser-based Image Downloader (Playwright) ─────────────────
// For CDNs that block node-fetch/undici (403 Forbidden) despite correct
// Referer headers — e.g. gmbr.pro uses TLS fingerprinting or Cloudflare
// challenge. A real browser (Chromium) bypasses these protections.
//
// CRITICAL: Chromium has memory leaks when opening hundreds of pages.
// We use auto-rotation: restart browser every BROWSER_MAX_PAGES pages
// (≈25 chapters × 10 images) to prevent crash after ~35 chapters.

let _browserInstance = null;
let _browserContext = null;
let _browserPageCount = 0;       // Total pages opened since browser start
const BROWSER_MAX_PAGES = 250;   // Restart browser after this many pages

async function _launchBrowser() {
  console.log('🌐 Launching headless browser for image downloads...');
  const instance = await chromium.launch({
    headless: true,
    args: [
      '--ignore-certificate-errors',
      '--disable-web-security',
      '--disable-dev-shm-usage',       // Fix for low /dev/shm in containers
      '--disable-gpu',                  // Reduce memory in headless
      '--no-sandbox',                   // Compatibility
      '--disable-setuid-sandbox',
    ],
  });
  const context = await instance.newContext({
    userAgent: USER_AGENTS[1], // Chrome macOS
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    },
  });
  console.log('✅ Browser ready');
  return { instance, context };
}

export async function getBrowserContext() {
  // Auto-rotation: restart browser if page count exceeds limit
  if (_browserContext && _browserPageCount >= BROWSER_MAX_PAGES) {
    console.log(`\n🔄 Browser rotation: ${_browserPageCount} pages reached — restarting browser...`);
    await closeBrowser();
    _browserPageCount = 0;
  }

  if (!_browserContext) {
    const { instance, context } = await _launchBrowser();
    _browserInstance = instance;
    _browserContext = context;
  }

  return _browserContext;
}

/**
 * Tracked page creation — increments the global counter for auto-rotation.
 * Always use this instead of ctx.newPage() directly in download functions.
 */
export async function newTrackedPage() {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();
  _browserPageCount++;
  return page;
}

/**
 * Get current page count (for diagnostics/logging).
 */
export function getBrowserPageCount() {
  return _browserPageCount;
}

export async function closeBrowser() {
  if (_browserContext) {
    try { await _browserContext.close(); } catch {}
    _browserContext = null;
  }
  if (_browserInstance) {
    try { await _browserInstance.close(); } catch {}
    _browserInstance = null;
  }
}

/**
 * Fetch a fully-rendered HTML page via Playwright browser.
 * Use this when the page loads content via JavaScript (e.g. chapter lists
 * rendered by jQuery/AJAX). Unlike undici, a real browser executes JS.
 *
 * Waits for chapter list selectors to appear before extracting HTML.
 * Returns { html, statusCode, finalUrl }.
 */
export async function fetchHtmlViaBrowser(url, { timeoutMs = 30_000, waitForSelector = null } = {}) {
  const page = await newTrackedPage();

  try {
    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    const statusCode = resp ? resp.status() : 0;
    const finalUrl = page.url();

    if (statusCode !== 0 && (statusCode < 200 || statusCode >= 400)) {
      return { html: '', statusCode, finalUrl };
    }

    // Wait for network to settle (JS AJAX calls to complete)
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 15_000) });
    } catch {
      // networkidle timeout is OK — page may have long-polling connections
    }

    // If a specific selector is provided, wait for it
    if (waitForSelector) {
      try {
        await page.waitForSelector(waitForSelector, { timeout: Math.min(timeoutMs, 15_000) });
      } catch {
        // Selector not found — continue anyway, we'll check chapters count later
      }
    } else {
      // Auto-detect manhwaland eplister / chapterlist selectors
      const selectors = [
        '#chapterlist li',
        '.eplister li',
        'li[data-num]',
        'li.wp-manga-chapter',
        '.listing-chapters li',
        '.version-chap',
      ];
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { timeout: 5_000 });
          break;
        } catch {
          // try next selector
        }
      }
    }

    const html = await page.content();
    return { html, statusCode: statusCode || 200, finalUrl };
  } finally {
    await page.close();
  }
}

/**
 * Fetch HTML with automatic browser fallback for JS-rendered chapter lists.
 *
 * Flow:
 *   1. Try undici (fast, lightweight)
 *   2. Run scrapeChapterList(html) to check if chapters exist
 *   3. If 0 chapters found → fall back to Playwright (renders JS)
 *   4. Return whichever HTML yielded chapters
 *
 * Returns { html, statusCode, finalUrl, usedBrowser }
 */
export async function fetchHtmlWithChapterFallback(url, proxyPool, opts = {}) {
  const { delayMs = 2000, ...rest } = opts;

  // Anti-bot domains: skip undici entirely (saves 10-15s of wasted retries)
  // These domains return 404/403 to non-browser clients (TLS fingerprint detection)
  const isAntiBotDomain = /manhwaland|manhwain|manhwa|ikifeng|komikav|westmanga|komikcast/i.test(url);

  let html = '';
  let statusCode = 0;
  let finalUrl = url;

  if (!isAntiBotDomain) {
    // Step 1: Try undici first (for non-anti-bot domains)
    try {
      const result = await fetchHtml(url, proxyPool, { delayMs, ...rest });
      html = result.html;
      statusCode = result.statusCode;
      finalUrl = result.finalUrl || url;
    } catch (err) {
      console.warn(`  ⚠️  fetchHtml failed: ${err.message} — will try browser directly`);
    }

    // Step 2: Check if chapters OR images exist in static HTML
    const chapters = scrapeChapterList(html);
    const images = parseChapterImages(html);
    if (chapters.length > 0 || images.length > 0) {
      return { html, statusCode, finalUrl, usedBrowser: false };
    }
  } else {
    console.log(`  🌐 Anti-bot domain — skipping undici, using browser directly`);
  }

  // Step 3: Fall back to Playwright (JS rendering)
  console.log(`  🔄 Falling back to browser (JS render)...`);
  try {
    const browserResult = await fetchHtmlViaBrowser(finalUrl, { timeoutMs: 30_000 });
    if (browserResult.html) {
      const browserChapters = scrapeChapterList(browserResult.html);
      if (browserChapters.length > 0) {
        console.log(`  ✅ Browser rendered ${browserChapters.length} chapters!`);
      }
      // Return browser HTML regardless — chapter pages have images, not chapter lists
      return {
        html: browserResult.html,
        statusCode: browserResult.statusCode,
        finalUrl: browserResult.finalUrl,
        usedBrowser: true,
      };
    }
  } catch (err) {
    console.warn(`  ⚠️  Browser fallback failed: ${err.message}`);
  }

  return { html, statusCode, finalUrl, usedBrowser: false };
}

/**
 * Download an image via Playwright browser page.goto().
 * This bypasses TLS fingerprinting and Cloudflare challenges.
 * Returns { buffer, contentType } or null on failure.
 */
export async function downloadImageViaBrowser(url, { timeoutMs = 15_000, retries = 2, refererUrl = null } = {}) {
  const page = await newTrackedPage();

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await sleep(1000 * attempt);
        // Set Referer header — critical for bypassing anti-hotlink protection
        const gotoOpts = { waitUntil: 'commit', timeout: timeoutMs };
        if (refererUrl) gotoOpts.referer = refererUrl;
        const resp = await page.goto(url, gotoOpts);
        if (!resp || resp.status() !== 200) continue;
        const ct = resp.headers()['content-type'] || '';
        if (!ct.startsWith('image/')) continue;
        const body = await resp.body();
        if (body.length < 1024) continue;
        return { buffer: Buffer.from(body), contentType: ct };
      } catch {
        if (attempt === retries) return null;
      }
    }
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Download ALL images from a chapter page using a single browser session.
 *
 * CRITICAL FIX for Cloudflare-protected CDNs (cdn-okto.gmbr.pro):
 * The old approach (downloadImageViaBrowser → page.goto(imageUrl)) fails
 * because Cloudflare challenges the navigation to the image URL itself.
 *
 * NEW APPROACH:
 *   1. Navigate to the chapter page (solves CF challenge → gets cf_clearance cookie)
 *   2. Use page.evaluate(() => fetch(imageUrl)) for each image — the request
 *      originates FROM the chapter page, so CF allows it (same session cookies)
 *   3. Return buffers with proper content types
 *
 * This is exactly how a real browser loads images in <img> tags.
 *
 * @param {string} chapterUrl - The chapter page URL (e.g. manhwaland.land/...chapter-1/)
 * @param {string[]} imageUrls - Array of image URLs to download
 * @param {object} opts - { timeoutMs, maxParallel, onProgress }
 * @returns {Promise<Array<{buffer: Buffer, contentType: string, url: string} | null>>}
 */
export async function downloadImagesFromChapterPage(chapterUrl, imageUrls, opts = {}) {
  const { timeoutMs = 120_000, onProgress = null } = opts;

  if (imageUrls.length === 0) return [];

  const page = await newTrackedPage();

  // Create a lookup set for fast matching
  const urlSet = new Set(imageUrls);
  // Also store basename matches (URLs may have query params or slight variations)
  const urlBasenameMap = new Map();
  for (const u of imageUrls) {
    try {
      const basename = new URL(u).pathname.split('/').pop();
      if (basename) urlBasenameMap.set(basename, u);
    } catch {}
  }

  const results = new Array(imageUrls.length).fill(null);
  const captured = new Set();

  // Intercept ALL responses — capture image downloads naturally loaded by <img> tags
  // This bypasses CORS entirely because the browser's rendering engine handles the request
  let errorStatuses = {}; // Track error codes for reporting

  page.on('response', async (response) => {
    try {
      const url = response.url();
      const status = response.status();

      // Match by full URL or basename FIRST (before checking content type)
      let targetIdx = -1;
      if (urlSet.has(url)) {
        targetIdx = imageUrls.indexOf(url);
      } else {
        try {
          const basename = new URL(url).pathname.split('/').pop();
          if (basename && urlBasenameMap.has(basename)) {
            const originalUrl = urlBasenameMap.get(basename);
            targetIdx = imageUrls.indexOf(originalUrl);
          }
        } catch {}
      }

      // Not one of our target images — skip
      if (targetIdx === -1 || captured.has(targetIdx)) return;

      // Track error statuses for reporting
      if (status !== 200) {
        errorStatuses[status] = (errorStatuses[status] || 0) + 1;
        return;
      }

      const ct = response.headers()['content-type'] || '';
      if (!ct.startsWith('image/')) return;

      const body = await response.body();
      if (body.length < 1024) return;

      results[targetIdx] = {
        buffer: Buffer.from(body),
        contentType: ct,
        url,
      };
      captured.add(targetIdx);
      if (onProgress) onProgress(captured.size, imageUrls.length);
    } catch {
      // Response body already consumed or error — skip
    }
  });

  // Expose error summary via closure
  page._errorStatuses = errorStatuses;

  try {
    // Step 1: Navigate to chapter page — browser gets CF cookies + cookies
    console.log(`  🌐 Navigating to chapter page: ${chapterUrl.substring(0, 80)}...`);
    const resp = await page.goto(chapterUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    if (!resp || resp.status() !== 200) {
      console.warn(`  ⚠️  Chapter page returned status ${resp?.status() || 'unknown'}`);
    }

    // Wait a bit for page to stabilize
    try {
      await page.waitForLoadState('networkidle', { timeout: Math.min(timeoutMs, 20_000) });
    } catch {
      // networkidle timeout is OK
    }

    // Step 2: INJECT real <img> tags to FORCE the browser to load every image URL.
    // This is the critical fix: manhwaland uses <noscript> + data-src lazy-load,
    // so the browser never actually fetches the images. We create real img tags
    // with the actual URLs → browser fetches them → response intercept captures them.
    await page.evaluate((urls) => {
      // Remove existing images in readerarea (they may have wrong src / lazy-load)
      const readerarea = document.getElementById('readerarea') || document.querySelector('.reading-content');
      if (readerarea) readerarea.innerHTML = '';

      // Create a container for our injected images
      const container = document.getElementById('readerarea') || document.body;

      // Inject one real <img> per URL — browser will fetch each one
      for (let i = 0; i < urls.length; i++) {
        const img = document.createElement('img');
        img.src = urls[i];           // Set REAL src (not data-src) → forces load
        img.style.display = 'block';  // Must be visible for browser to load
        img.style.width = '100%';
        img.setAttribute('data-injected', 'true');
        img.setAttribute('data-idx', String(i));
        container.appendChild(img);
      }
    }, imageUrls);

    // Step 3: Wait for injected images to load (they fire HTTP requests → intercept captures)
    console.log(`  ⏳ Waiting for ${imageUrls.length} injected images to load...`);

    // Poll for completion — check every 2s, timeout after remaining timeoutMs
    const pollStart = Date.now();
    const maxWait = Math.min(80_000, timeoutMs - 10_000);
    while (captured.size < imageUrls.length && Date.now() - pollStart < maxWait) {
      await sleep(2000);
    }

    const successCount = results.filter(r => r !== null).length;
    console.log(`  📊 Response intercept: ${successCount}/${imageUrls.length} images captured`);

    // Step 4: If some images still not captured, try page.evaluate(() => fetch(url)) approach
    // This uses the browser's fetch() from within the page context (same cookies/CF session)
    if (successCount < imageUrls.length) {
      const missing = [];
      for (let i = 0; i < results.length; i++) {
        if (!results[i]) missing.push({ idx: i, url: imageUrls[i] });
      }

      if (missing.length > 0 && missing.length <= imageUrls.length) {
        console.log(`  🔄 Trying in-page fetch() for ${missing.length} missing images...`);

        for (const { idx, url } of missing) {
          if (results[idx]) continue; // Already captured
          try {
            const base64 = await page.evaluate(async (imgUrl) => {
              const resp = await fetch(imgUrl, { credentials: 'include' });
              if (!resp.ok) return null;
              const blob = await resp.blob();
              return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve({ data: reader.result, type: blob.type });
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
              });
            }, url);

            if (base64 && base64.data) {
              const base64Data = base64.data.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              if (buffer.length > 1024) {
                results[idx] = {
                  buffer,
                  contentType: base64.type || 'image/jpeg',
                  url,
                };
                captured.add(idx);
                if (onProgress) onProgress(captured.size, imageUrls.length);
              }
            }
          } catch {
            // fetch() failed — image remains null
          }
        }

        const finalCount = results.filter(r => r !== null).length;
        if (finalCount > successCount) {
          console.log(`  ✅ In-page fetch() recovered ${finalCount - successCount} more images`);
        }
      }
    }

    return results;
  } catch (err) {
    console.error(`  ❌ Chapter page intercept failed: ${err.message}`);
    return results;
  } finally {
    await page.close();
  }
}

// ─── Scraper: Chapter Images ─────────────────────────────────────
// Ported from src/lib/scrapers/scraper-utils.ts → parseChapterImages()

export function parseChapterImages(html) {
  const urls = [];

  const readerareaIdx = html.indexOf('id="readerarea"');
  const section =
    readerareaIdx !== -1
      ? html.slice(readerareaIdx, readerareaIdx + 80_000)
      : html;

  // Primary: noscript lazy-load fallback
  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m;
  while ((m = noscriptRe.exec(section)) !== null) {
    const srcRe = /src=['"]([^'"]+)['"]/g;
    let s;
    while ((s = srcRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }

  // Fallback: data-src
  if (urls.length === 0) {
    const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dataSrcRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  // Last resort: plain img src matching known CDN paths
  if (urls.length === 0) {
    const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = imgSrcRe.exec(section)) !== null) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /chapter|manga[-_.]images|upload/i.test(u)) {
        urls.push(u);
      }
    }
  }

  // Filter out GIF images
  const filtered = urls.filter(u => {
    const lower = u.toLowerCase();
    if (lower.match(/\.gif(\?|#|$)/)) return false;
    return true;
  });

  // Upgrade HTTP → HTTPS for gmbr.pro
  return filtered.map(u => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' && parsed.hostname.includes('gmbr.pro')) {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
      return u;
    } catch {
      return u;
    }
  });
}

// ─── Scraper: Manga Metadata ─────────────────────────────────────
// Ported from src/lib/scrapers/manga-scraper.ts

export function scrapeMangaMeta(html, sourceUrl) {
  const $ = (sel) => {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const idx = html.search(re);
    return idx !== -1 ? html.slice(idx) : '';
  };

  // Title: <h1 class="entry-title">...</h1> or og:title
  let title = '';
  const titleMatch = html.match(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
  if (titleMatch) {
    title = titleMatch[1].replace(/<[^>]+>/g, '').trim();
  }
  if (!title) {
    const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogMatch) title = ogMatch[1].trim();
  }

  // Cover: data-src or src from .thumb img or .summary_image
  let coverUrl = '';
  const coverMatch = html.match(/class="[^"]*(?:summary_image|thumb)[^"]*"[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/i);
  if (coverMatch) coverUrl = coverMatch[1];

  // Description: .summary p or .desc
  let description = '';
  const descMatch = html.match(/class="[^"]*summary[^"]*"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i)
    || html.match(/class="[^"]*desc[^"]*"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  if (descMatch) description = descMatch[1].replace(/<[^>]+>/g, '').trim();

  // Genres: .genres-content a
  const genres = [];
  const genreRe = /class="[^"]*genres-content[^"]*"[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi;
  let g;
  while ((g = genreRe.exec(html)) !== null) {
    genres.push(g[1].trim());
  }

  // Author
  let author = '';
  const authorMatch = html.match(/class="[^"]*author-content[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (authorMatch) author = authorMatch[1].trim();

  // Artist
  let artist = '';
  const artistMatch = html.match(/class="[^"]*artist-content[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/i);
  if (artistMatch) artist = artistMatch[1].trim();

  // Status
  let status = 'ONGOING';
  const statusMatch = html.match(/class="[^"]*summary-content[^"]*"[^>]*>\s*(Ongoing|Completed|Hiatus|Dropped)/i);
  if (statusMatch) {
    const s = statusMatch[1].toLowerCase();
    status = s === 'completed' ? 'COMPLETED' : s === 'hiatus' ? 'HIATUS' : s === 'dropped' ? 'DROPPED' : 'ONGOING';
  }

  // Type (manga/manhwa/manhua)
  let type = 'MANHWA';
  const typeMatch = html.match(/class="[^"]*summary-content[^"]*"[^>]*>\s*(Manga|Manhwa|Manhua|Webtoon)/i);
  if (typeMatch) {
    type = typeMatch[1].toUpperCase();
  }

  return { title, cover_url: coverUrl, description, genres, author, artist, status, type, source_url: sourceUrl };
}

// ─── Scraper: Chapter List ───────────────────────────────────────

export function scrapeChapterList(html) {
  const chapters = [];

  // ─── Theme: Mangareader (eplister) ────────────────────────────
  // Structure:
  //   <div class="eplister" id="chapterlist">
  //     <ul>
  //       <li data-num="5">
  //         <div class="chbox"><div class="eph-num">
  //           <a href="https://.../slug-chapter-4-5-3/">
  //             <span class="chapternum">Chapter 5</span>
  //             <span class="chapterdate">Mei 10, 2026</span>
  //           </a>
  //         </div></div>
  //       </li>
  const eplisterIdx = html.indexOf('eplister');
  if (eplisterIdx !== -1) {
    // Extract the eplister section
    const sectionEnd = html.indexOf('</ul>', eplisterIdx + 80_000);
    const section = sectionEnd !== -1
      ? html.slice(eplisterIdx, sectionEnd + 10)
      : html.slice(eplisterIdx, eplisterIdx + 100_000);

    // Match: <li data-num="..."> ... <a href="URL"> ... <span class="chapternum">...</span> ... <span class="chapterdate">DATE</span>
    // NOTE: data-num can be numeric ("5") OR text ("a fluffy thief cat – one piece")
    //       so we accept any value and extract number from chapternum text instead.
    const eplRe = /<li[^>]*data-num="([^"]*)"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*chapternum[^"]*"[^>]*>([^<]*)<\/span>(?:[\s\S]*?<span[^>]*class="[^"]*chapterdate[^"]*"[^>]*>([^<]*)<\/span>)?/gi;
    let m;
    while ((m = eplRe.exec(section)) !== null) {
      const dataNum = m[1];   // Can be "5" or "a fluffy thief cat – one piece"
      const url = m[2];
      const titleText = m[3]?.trim() || '';
      const dateStr = m[4]?.trim() || '';

      // Extract number from data-num if numeric, otherwise from chapternum text
      let number = parseFloat(dataNum);
      if (isNaN(number)) {
        // data-num is text — try extracting number from chapternum text
        const numMatch = titleText.match(/chapter\s*([\d.]+)/i);
        number = numMatch ? parseFloat(numMatch[1]) : 0;
      }

      // Parse Indonesian date like "Mei 10, 2026" or "Jul 23, 2026"
      let releaseDate = null;
      if (dateStr) {
        // Map Indonesian month names
        const indoMonths = { 'jan': 'Jan', 'feb': 'Feb', 'mar': 'Mar', 'apr': 'Apr', 'mei': 'May', 'jun': 'Jun', 'jul': 'Jul', 'agu': 'Aug', 'sep': 'Sep', 'okt': 'Oct', 'nov': 'Nov', 'des': 'Dec' };
        let normalizedDate = dateStr;
        for (const [indo, eng] of Object.entries(indoMonths)) {
          if (normalizedDate.toLowerCase().startsWith(indo)) {
            normalizedDate = eng + normalizedDate.slice(3);
            break;
          }
        }
        const parsed = Date.parse(normalizedDate);
        if (!isNaN(parsed)) releaseDate = new Date(parsed).toISOString();
      }

      // Clean title (remove "Chapter N" prefix if present)
      const title = titleText.replace(/^chapter\s*[\d.]+/i, '').trim() || '';

      chapters.push({ url, number, title, releaseDate });
    }
  }

  // ─── Theme: Madara (wp-manga-chapter) ─────────────────────────
  if (chapters.length === 0) {
    // Pattern 1: <li class="wp-manga-chapter">  <a href="URL">Chapter N</a>
    const chapterRe = /<li[^>]*class="[^"]*wp-manga-chapter[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = chapterRe.exec(html)) !== null) {
      const url = m[1];
      const text = m[2].replace(/<[^>]+>/g, '').trim();
      const numMatch = text.match(/chapter\s*([\d.]+)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : 0;
      const title = text.replace(/chapter\s*[\d.]+/i, '').trim() || '';

      const dateMatch = m[0].match(/<span[^>]*class="[^"]*chapter-release-date[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      let releaseDate = null;
      if (dateMatch) {
        const dateStr = dateMatch[1].replace(/<[^>]+>/g, '').trim();
        const parsed = Date.parse(dateStr);
        if (!isNaN(parsed)) releaseDate = new Date(parsed).toISOString();
      }

      chapters.push({ url, number, title, releaseDate });
    }
  }

  // ─── Fallback: generic chapter link detection ─────────────────
  if (chapters.length === 0) {
    const altRe = /<a[^>]+(?:href|data-href)="([^"]+)"[^>]*>\s*Chapter\s*([\d.]+)/gi;
    let m;
    while ((m = altRe.exec(html)) !== null) {
      chapters.push({
        url: m[1],
        number: parseFloat(m[2]),
        title: '',
        releaseDate: null,
      });
    }
  }

  // Sort by chapter number descending (newest first)
  chapters.sort((a, b) => b.number - a.number);

  return chapters;
}

// ─── Scraper: Sitemap Parser ─────────────────────────────────────

export async function parseSitemapIndex(sitemapIndexUrl, proxyPool) {
  console.log(`📋 Fetching sitemap index: ${sitemapIndexUrl}`);
  const { html } = await fetchHtml(sitemapIndexUrl, proxyPool);

  const urls = [];
  // <sitemap><loc>https://...</loc></sitemap>
  const locRe = /<loc>([^<]+)<\/loc>/gi;
  let m;
  while ((m = locRe.exec(html)) !== null) {
    if (m[1].includes('post-sitemap') || m[1].includes('manga-sitemap')) {
      urls.push(m[1].trim());
    }
  }

  console.log(`   Found ${urls.length} child sitemaps`);
  return urls;
}

export async function parseSitemapUrls(sitemapUrl, proxyPool) {
  const { html } = await fetchHtml(sitemapUrl, proxyPool);

  const urls = [];
  const locRe = /<loc>([^<]+)<\/loc>/gi;
  let m;
  while ((m = locRe.exec(html)) !== null) {
    const url = m[1].trim();
    // Filter for manga pages (not home, category, etc.)
    if (url.match(/\/manga\/[^/]+\/?$/)) {
      urls.push(url);
    }
  }

  return urls;
}

// ─── Progress Bar ────────────────────────────────────────────────

/**
 * Format seconds into human-readable duration string.
 * Examples: 45 → "45s", 90 → "1m 30s", 3700 → "1h 1m"
 */
export function formatDuration(seconds) {
  seconds = Math.max(0, Math.floor(seconds));
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0 && s > 0) return `${m}m ${s}s`;
  return `${m}m`;
}

export class ProgressBar {
  constructor(total, label = 'Processing') {
    this.total = total;
    this.label = label;
    this.current = 0;
    this.startTime = Date.now();
    this.successCount = 0;
    this.failCount = 0;
    this.skipCount = 0;
    // Sliding window for accurate recent rate (last 30 completions)
    this._recentTimes = [];
    this._lastTickTime = Date.now();
  }

  tick(success = true, skipped = false) {
    const now = Date.now();
    this.current++;
    if (skipped) this.skipCount++;
    else if (success) this.successCount++;
    else this.failCount++;

    // Track time between ticks (sliding window of 30 items)
    const delta = now - this._lastTickTime;
    this._lastTickTime = now;
    this._recentTimes.push(delta);
    if (this._recentTimes.length > 30) this._recentTimes.shift();

    if (this.current % 5 === 0 || this.current === this.total) {
      const elapsed = (now - this.startTime) / 1000;
      const overallRate = this.current / Math.max(elapsed, 1);

      // Recent rate: average ms per item from sliding window → items/sec
      const avgMs = this._recentTimes.length > 0
        ? this._recentTimes.reduce((a, b) => a + b, 0) / this._recentTimes.length
        : 1000;
      const recentRate = Math.min(1000 / Math.max(avgMs, 1), overallRate * 3); // Cap at 3x overall

      // ETA based on recent rate (more accurate for changing conditions)
      const remaining = (this.total - this.current) / Math.max(recentRate, 0.01);
      const pct = this.total > 0 ? (this.current / this.total * 100).toFixed(1) : '0.0';

      // Format ETA as Hh Mm Ss (handles long batches)
      const etaStr = formatDuration(remaining);

      process.stdout.write(
        `\r  ${this.label}: ${this.current}/${this.total} (${pct}%) | ` +
        `✅${this.successCount} ❌${this.failCount} ⏭️${this.skipCount} | ` +
        `⚡${recentRate.toFixed(1)}/s | ETA: ${etaStr}  `
      );
    }
  }

  done() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const min = Math.floor(elapsed / 60);
    const sec = Math.floor(elapsed % 60);
    console.log(''); // newline
    console.log(`  ✅ Done in ${min}m${sec}s — Success: ${this.successCount}, Skip: ${this.skipCount}, Failed: ${this.failCount}`);
  }
}