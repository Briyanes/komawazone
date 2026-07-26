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
const FALLBACK_PROXIES = [
  '31.59.20.176:6754:ozfcoksy:862ttfhg7gcb',
  '92.113.242.158:6742:ozfcoksy:862ttfhg7gcb',
  '23.95.150.145:6114:ozfcoksy:862ttfhg7gcb',
  '38.154.203.95:5863:ozfcoksy:862ttfhg7gcb',
  '198.105.121.200:6462:ozfcoksy:862ttfhg7gcb',
  '64.137.96.74:6641:ozfcoksy:862ttfhg7gcb',
  '38.154.185.97:6370:ozfcoksy:862ttfhg7gcb',
  '142.111.67.146:5611:ozfcoksy:862ttfhg7gcb',
  '191.96.254.138:6185:ozfcoksy:862ttfhg7gcb',
  '2.57.20.2:6983:ozfcoksy:862ttfhg7gcb',
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

        // Browser fallback ONLY for 403 (anti-hotlink) — browser won't help
        // if the server is genuinely down (522/503/502 etc.)
        if (lastStatus === 403 && useBrowserFallback) {
          console.log(`  🔄 undici got 403 — falling back to browser download...`);
          const browserResult = await downloadImageViaBrowser(currentUrl, { timeoutMs: 15_000, retries: 2 });
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
    const browserResult = await downloadImageViaBrowser(currentUrl, { timeoutMs: 15_000, retries: 2 });
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

let _browserInstance = null;
let _browserContext = null;

export async function getBrowserContext() {
  if (_browserContext) return _browserContext;

  console.log('🌐 Launching headless browser for image downloads...');
  _browserInstance = await chromium.launch({ headless: true });
  _browserContext = await _browserInstance.newContext({
    userAgent: USER_AGENTS[1], // Chrome macOS
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    },
  });
  console.log('✅ Browser ready');
  return _browserContext;
}

export async function closeBrowser() {
  if (_browserContext) { await _browserContext.close(); _browserContext = null; }
  if (_browserInstance) { await _browserInstance.close(); _browserInstance = null; }
}

/**
 * Download an image via Playwright browser page.goto().
 * This bypasses TLS fingerprinting and Cloudflare challenges.
 * Returns { buffer, contentType } or null on failure.
 */
export async function downloadImageViaBrowser(url, { timeoutMs = 15_000, retries = 2 } = {}) {
  const ctx = await getBrowserContext();
  const page = await ctx.newPage();

  try {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        if (attempt > 0) await sleep(1000 * attempt);
        const resp = await page.goto(url, { waitUntil: 'commit', timeout: timeoutMs });
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

    // Match: <li data-num="5"> ... <a href="URL"> ... <span class="chapternum">Chapter 5</span> ... <span class="chapterdate">DATE</span>
    const eplRe = /<li[^>]*data-num="([\d.]+)"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>[\s\S]*?<span[^>]*class="[^"]*chapternum[^"]*"[^>]*>([^<]*)<\/span>(?:[\s\S]*?<span[^>]*class="[^"]*chapterdate[^"]*"[^>]*>([^<]*)<\/span>)?/gi;
    let m;
    while ((m = eplRe.exec(section)) !== null) {
      const number = parseFloat(m[1]);
      const url = m[2];
      const titleText = m[3]?.trim() || '';
      const dateStr = m[4]?.trim() || '';

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

export class ProgressBar {
  constructor(total, label = 'Processing') {
    this.total = total;
    this.label = label;
    this.current = 0;
    this.startTime = Date.now();
    this.successCount = 0;
    this.failCount = 0;
    this.skipCount = 0;
  }

  tick(success = true, skipped = false) {
    this.current++;
    if (skipped) this.skipCount++;
    else if (success) this.successCount++;
    else this.failCount++;

    if (this.current % 10 === 0 || this.current === this.total) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      const rate = this.current / Math.max(elapsed, 1);
      const remaining = (this.total - this.current) / Math.max(rate, 0.01);
      const remainingMin = Math.floor(remaining / 60);
      const remainingSec = Math.floor(remaining % 60);
      const pct = this.total > 0 ? (this.current / this.total * 100).toFixed(1) : '0.0';

      process.stdout.write(
        `\r  ${this.label}: ${this.current}/${this.total} (${pct}%) | ` +
        `✅${this.successCount} ❌${this.failCount} ⏭️${this.skipCount} | ` +
        `⚡${rate.toFixed(1)}/s | ETA: ${remainingMin}m${remainingSec}s  `
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