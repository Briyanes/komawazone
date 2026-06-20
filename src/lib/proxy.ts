/**
 * Webshare Proxy Pool — Production Proxy Manager
 *
 * Context:
 * Manga CDNs (gmbr.pro, manhwaland.land, kambingjantan.cc) aggressively block
 * requests from Vercel/datacenter IPs (403/429). The app subscribes to Webshare's
 * 10-residential-IP plan specifically to avoid these blocks.
 *
 * Without this module, ALL image downloads in production hit CDNs directly from
 * Vercel's egress IP → many chapters end up with 0 images or partial images.
 *
 * Consumed by:
 *   - src/lib/storage/image-downloader.ts (downloadImageWithRetry)
 *   - src/app/api/proxy/image/route.ts (runtime image proxy)
 *   - src/app/api/v1/admin/storage/backfill/route.ts (bulk backfill)
 *
 * Env:
 *   PROXY_LIST=host1:port1:user1:pass1,host2:port2:user2:pass2,...
 *   (comma-separated. falls back to a built-in default list when unset.)
 */

import { ProxyAgent, request as undiciRequest, type Dispatcher } from 'undici';

/** A single proxy definition parsed from PROXY_LIST. */
export interface ProxyEntry {
  host: string;
  port: number;
  username: string;
  password: string;
}

// --- Internal state --------------------------------------------------------

let proxyPool: ProxyEntry[] | null = null;
let rrIndex = 0;
const badUntil = new Map<string, number>();
const COOLDOWN_MS = 60_000;

// --- Parsing ---------------------------------------------------------------

function parseProxyList(raw: string): ProxyEntry[] {
  const entries: ProxyEntry[] = [];
  for (const token of raw.split(/[,\n]+/)) {
    const parts = token.trim().split(':');
    if (parts.length < 4) continue;
    const [host, portStr, username, ...rest] = parts;
    const password = rest.join(':');
    const port = parseInt(portStr, 10);
    if (!host || !Number.isFinite(port) || !username || !password) continue;
    entries.push({ host, port, username, password });
  }
  return entries;
}

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

export function getProxyPool(): ProxyEntry[] {
  if (proxyPool) return proxyPool;
  const raw = process.env.PROXY_LIST?.trim() || FALLBACK_PROXIES;
  const parsed = parseProxyList(raw);
  if (parsed.length === 0) {
    console.warn('[proxy] PROXY_LIST parsed to 0 entries — proxy disabled');
  }
  proxyPool = parsed;
  return parsed;
}

export function getHealthyProxyCount(): number {
  const now = Date.now();
  return getProxyPool().filter(p => (badUntil.get(p.host) ?? 0) <= now).length;
}

// --- Selection -------------------------------------------------------------

export function pickProxy(): ProxyEntry | null {
  const pool = getProxyPool();
  if (pool.length === 0) return null;
  const now = Date.now();
  for (let i = 0; i < pool.length; i++) {
    const candidate = pool[rrIndex % pool.length];
    rrIndex++;
    if ((badUntil.get(candidate.host) ?? 0) <= now) {
      return candidate;
    }
  }
  const oldestHost = [...badUntil.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
  if (oldestHost) {
    badUntil.delete(oldestHost);
    return pool.find(p => p.host === oldestHost) ?? null;
  }
  return null;
}

export function markProxyBad(host: string): void {
  badUntil.set(host, Date.now() + COOLDOWN_MS);
}

export function createProxyDispatcher(proxy: ProxyEntry): Dispatcher {
  const proxyUrl = `http://${proxy.username}:${encodeURIComponent(proxy.password)}@${proxy.host}:${proxy.port}`;
  return new ProxyAgent(proxyUrl);
}

// --- Fetch helpers ---------------------------------------------------------

export interface ProxyFetchResult {
  buffer: Buffer;
  contentType: string;
  status: number;
  viaProxy: string | null;
}

export interface ProxyFetchOptions {
  headers?: Record<string, string>;
  maxAttempts?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * Download a URL through the proxy pool, rotating proxies on failure.
 * Returns { buffer, contentType, status } on success (status 2xx).
 * Throws on exhaustion or non-2xx after all attempts.
 */
export async function fetchBufferWithProxy(
  url: string,
  opts: ProxyFetchOptions = {},
): Promise<ProxyFetchResult> {
  const pool = getProxyPool();
  const maxAttempts = opts.maxAttempts ?? Math.min(Math.max(pool.length, 3), 6);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let lastError: Error | null = null;
  let lastStatus = 0;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const proxy = pickProxy();

    if (!proxy) {
      console.warn('[proxy] pool exhausted — falling back to direct fetch');
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

        const response = await fetch(url, {
          headers: opts.headers,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!response.ok) {
          lastStatus = response.status;
          lastError = new Error(`Direct HTTP ${response.status}`);
          if (response.status !== 403 && response.status !== 429 && response.status !== 503) {
            throw lastError;
          }
          continue;
        }

        const ct = response.headers.get('content-type') || 'image/jpeg';
        const ab = await response.arrayBuffer();
        return { buffer: Buffer.from(ab), contentType: ct, status: response.status, viaProxy: null };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        break;
      }
    }

    const dispatcher = createProxyDispatcher(proxy);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      if (opts.signal) opts.signal.addEventListener('abort', () => controller.abort(), { once: true });

      const res = await undiciRequest(url, {
        method: 'GET',
        headers: opts.headers,
        signal: controller.signal,
        dispatcher,
      });

      clearTimeout(timer);
      lastStatus = res.statusCode;

      if (res.statusCode === 403 || res.statusCode === 429 || res.statusCode === 503) {
        markProxyBad(proxy.host);
        lastError = new Error(`HTTP ${res.statusCode} via ${proxy.host}`);
        try { await res.body.dump(); } catch { /* ignore */ }
        continue;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        lastError = new Error(`HTTP ${res.statusCode} via ${proxy.host}`);
        try { await res.body.dump(); } catch { /* ignore */ }
        markProxyBad(proxy.host);
        continue;
      }

      const chunks: Buffer[] = [];
      for await (const chunk of res.body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const buffer = Buffer.concat(chunks);

      const ct = res.headers['content-type'];
      const contentType = Array.isArray(ct) ? ct[0] : ct || 'image/jpeg';

      return { buffer, contentType, status: res.statusCode, viaProxy: proxy.host };
    } catch (err) {
      markProxyBad(proxy.host);
      lastError = err instanceof Error ? err : new Error(String(err));
      continue;
    }
  }

  throw lastError ?? new Error(`fetchBufferWithProxy failed (last status ${lastStatus})`);
}