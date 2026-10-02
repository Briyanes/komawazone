#!/usr/bin/env node
/**
 * Migrate R2 image URLs to the custom CDN domain (default: https://cdn.olluq.xyz).
 *
 * Rewrites (default scope):
 *   1. https://pub-*.r2.dev/<key>                    → https://cdn.olluq.xyz/<key>
 *   2. https://<acct>.r2.cloudflarestorage.com/<bucket>/<key>
 *                                                    → https://cdn.olluq.xyz/<key>
 * Optional (--include-proxy):
 *   3. /api/r2/image/<key>                           → https://cdn.olluq.xyz/<key>
 *
 * Targets: manga.cover_url, manga.banner_url, chapters.thumbnail_url,
 *          chapter_images.image_url
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-r2-to-cdn-domain.mjs                  # dry-run
 *   node --env-file=.env.local scripts/migrate-r2-to-cdn-domain.mjs --apply          # apply (default scope)
 *   node --env-file=.env.local scripts/migrate-r2-to-cdn-domain.mjs --apply --include-proxy
 *   node --env-file=.env.local scripts/migrate-r2-to-cdn-domain.mjs --report         # counts only
 *
 * Safety:
 *   - --apply aborts if the CDN host does not resolve (DNS check) or the
 *     R2 edge does not answer — prevents rewriting rows to a dead domain.
 *   - For very large scopes (100k+ rows, e.g. --include-proxy on
 *     chapter_images) prefer supabase/migrations/057_migrate_r2_to_cdn_domain.sql
 *     in the Supabase SQL Editor — set-based UPDATEs finish in seconds.
 */

import { createClient } from '@supabase/supabase-js';
import { promises as dns } from 'node:dns';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const argv = process.argv.slice(2);
const cdnArg        = argv.find(a => a.startsWith('--cdn='));
const APPLY         = argv.includes('--apply');
const INCLUDE_PROXY = argv.includes('--include-proxy');
const REPORT_ONLY   = argv.includes('--report');
const CDN_BASE      = (cdnArg ? cdnArg.slice('--cdn='.length) : 'https://cdn.olluq.xyz').replace(/\/+$/, '');
const CDN_HOST      = new URL(CDN_BASE).hostname;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const PROXY_PREFIX = '/api/r2/image/';

/** Rewrite a single URL to its CDN form (returns input unchanged if N/A) */
function toCdn(url) {
  if (!url || typeof url !== 'string') return url;
  if (url === CDN_BASE || url.startsWith(`${CDN_BASE}/`)) return url; // already migrated
  if (INCLUDE_PROXY && url.startsWith(PROXY_PREFIX)) {
    return `${CDN_BASE}/${url.slice(PROXY_PREFIX.length)}`;
  }
  let m = url.match(/^https?:\/\/[^/]+\.r2\.dev\/(.+)$/);
  if (m) return `${CDN_BASE}/${m[1]}`;
  m = url.match(/^https?:\/\/[^/]+\.r2\.cloudflarestorage\.com\/[^/]+\/(.+)$/);
  if (m) return `${CDN_BASE}/${m[1]}`;
  return url;
}

function needsChange(url) {
  return typeof url === 'string' && toCdn(url) !== url;
}

function log(scope, msg) {
  const tag = REPORT_ONLY ? 'REPORT' : APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`[${tag}] ${scope}: ${msg}`);
}

/** Guard: CDN must be live before --apply */
async function guardCdnLive() {
  if (!APPLY) return;
  try {
    const addrs = await dns.resolve4(CDN_HOST);
    console.log(`Guard: DNS OK — ${CDN_HOST} → ${addrs[0]}`);
  } catch {
    console.error(`❌ Guard: ${CDN_HOST} does not resolve. Connect the R2 custom domain first. Aborting.`);
    process.exit(1);
  }
  try {
    const r = await fetch(`${CDN_BASE}/`, { method: 'HEAD' });
    if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
    console.log(`Guard: CDN edge answers (HTTP ${r.status} at root is expected)`);
  } catch (e) {
    console.error(`❌ Guard: CDN fetch failed: ${e.message}. Aborting.`);
    process.exit(1);
  }
}

async function fetchMatching(table, column, idCol) {
  const PAGE_SIZE = 1000;
  const orPatterns = [
    `${column}.like.https://*.r2.dev/*`,
    `${column}.like.https://*.r2.cloudflarestorage.com/*`,
  ];
  if (INCLUDE_PROXY) orPatterns.push(`${column}.like.${PROXY_PREFIX}*`);

  let all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idCol}, ${column}`)
      .or(orPatterns.join(','))
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

async function migrateTable(table, column, idCol = 'id') {
  let rows;
  try {
    rows = await fetchMatching(table, column, idCol);
  } catch (err) {
    console.error(`Error fetching ${table}.${column}:`, err.message);
    return 0;
  }

  const toMigrate = rows.filter(row => needsChange(row[column]));

  if (toMigrate.length === 0) {
    log(`${table}.${column}`, `0 rows to migrate (${rows.length} matched scan)`);
    return 0;
  }

  log(`${table}.${column}`, `${toMigrate.length} rows need migration`);

  if (REPORT_ONLY) return toMigrate.length;

  if (!APPLY) {
    for (const row of toMigrate.slice(0, 3)) {
      console.log(`  ${row[idCol]}:\n    ${row[column]}\n    → ${toCdn(row[column])}`);
    }
    return toMigrate.length;
  }

  let updated = 0;
  for (let i = 0; i < toMigrate.length; i++) {
    const row = toMigrate[i];
    const newVal = toCdn(row[column]);
    const { error } = await supabase
      .from(table)
      .update({ [column]: newVal })
      .eq(idCol, row[idCol]);
    if (error) {
      console.error(`  Failed ${table} ${row[idCol]}:`, error.message);
    } else {
      updated++;
    }
    if ((i + 1) % 200 === 0) {
      process.stdout.write(`  ${i + 1}/${toMigrate.length}...\r`);
    }
  }
  console.log('');
  log(`${table}.${column}`, `${updated}/${toMigrate.length} updated`);
  return updated;
}

async function countRemaining() {
  const checks = [
    ['manga', 'cover_url'],
    ['manga', 'banner_url'],
    ['chapters', 'thumbnail_url'],
    ['chapter_images', 'image_url'],
  ];
  const cdnHostPath = `${CDN_HOST.replace(/https?:\/\//, '')}/*`;
  for (const [t, c] of checks) {
    const { count: devCount } = await supabase
      .from(t).select('*', { count: 'exact', head: true })
      .or(`${c}.like.https://*.r2.dev/*,${c}.like.https://*.r2.cloudflarestorage.com/*`);
    const { count: proxyCount } = await supabase
      .from(t).select('*', { count: 'exact', head: true })
      .like(c, `${PROXY_PREFIX}*`);
    const { count: cdnCount } = await supabase
      .from(t).select('*', { count: 'exact', head: true })
      .like(c, cdnHostPath);
    console.log(`  ${t}.${c}: r2.dev=${devCount ?? '?'}  proxy=${proxyCount ?? '?'}  cdn=${cdnCount ?? '?'}`);
  }
}

async function main() {
  console.log('=========================================');
  console.log(`  R2 → CDN Migration (${CDN_BASE})`);
  console.log(`  mode: ${REPORT_ONLY ? 'REPORT' : APPLY ? `APPLY${INCLUDE_PROXY ? ' +PROXY' : ''}` : `DRY-RUN${INCLUDE_PROXY ? ' +PROXY' : ''}`}`);
  console.log('=========================================\n');

  await guardCdnLive();

  let total = 0;
  total += await migrateTable('manga', 'cover_url', 'id');
  total += await migrateTable('manga', 'banner_url', 'id');
  total += await migrateTable('chapters', 'thumbnail_url', 'id');
  total += await migrateTable('chapter_images', 'image_url', 'id');

  console.log('\n── Distribution after run ──');
  await countRemaining();

  console.log('\n=========================================');
  if (APPLY) {
    console.log(`  DONE — ${total} rows updated.`);
  } else {
    console.log(`  ${REPORT_ONLY ? 'REPORT' : 'DRY-RUN'} — ${total} rows ${REPORT_ONLY ? 'need' : 'would be'} updated.`);
    if (!REPORT_ONLY) console.log('  Run with --apply to execute.');
  }
  console.log('=========================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

