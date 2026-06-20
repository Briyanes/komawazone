#!/usr/bin/env node
/**
 * Migrate all `pub-*.r2.dev` URLs in the database to `/api/r2/image/` proxy URLs.
 *
 * Background:
 *   Cloudflare disabled the pub-*.r2.dev subdomain, so every URL pointing to it
 *   now returns 404. The app already has an internal proxy at /api/r2/image/[...key]
 *   that reads directly from the R2 bucket via S3 API. This script rewrites all
 *   stale `pub-*.r2.dev/...` URLs across every image column to `/api/r2/image/...`.
 *
 * Affected columns:
 *   - manga.cover_url
 *   - manga.banner_url
 *   - chapters.thumbnail_url
 *   - chapter_images.image_url
 *
 * Usage:
 *   node --env-file=.env.local scripts/migrate-r2-dev-urls.mjs              # dry-run
 *   node --env-file=.env.local scripts/migrate-r2-dev-urls.mjs --apply      # apply
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const APPLY = process.argv.includes('--apply');

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

/** Extract the R2 object key from any r2.dev / cloudflarestorage URL */
function r2KeyFromUrl(url) {
  try {
    const u = new URL(url);
    let path = u.pathname.replace(/^\//, '');
    if (u.hostname.includes('r2.cloudflarestorage.com')) {
      const parts = path.split('/');
      parts.shift();
      path = parts.join('/');
    }
    return path;
  } catch {
    return null;
  }
}

function toProxyUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (!url.includes('.r2.dev/') && !url.includes('.r2.cloudflarestorage.com/')) return url;
  if (url.startsWith('/api/r2/image/')) return url;
  const key = r2KeyFromUrl(url);
  if (!key) return url;
  return `/api/r2/image/${key}`;
}

function log(scope, msg) {
  const tag = APPLY ? 'APPLY' : 'DRY-RUN';
  console.log(`[${tag}] ${scope}: ${msg}`);
}

async function fetchAllRows(table, column, idCol) {
  const PAGE_SIZE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(`${idCol}, ${column}`)
      .not(column, 'is', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return all;
}

function needsMigration(val) {
  return typeof val === 'string' && (
    val.includes('.r2.dev/') ||
    val.includes('.r2.cloudflarestorage.com/')
  ) && !val.startsWith('/api/r2/image/');
}

async function migrateTable(table, column, idCol = 'id') {
  let allData;
  try {
    allData = await fetchAllRows(table, column, idCol);
  } catch (err) {
    console.error(`Error fetching ${table}.${column}:`, err.message);
    return 0;
  }

  const toMigrate = allData.filter(row => needsMigration(row[column]));

  if (toMigrate.length === 0) {
    log(`${table}.${column}`, `0 rows to migrate (${allData.length} scanned)`);
    return 0;
  }

  log(`${table}.${column}`, `${toMigrate.length} rows need migration (${allData.length} scanned)`);

  if (!APPLY) {
    for (const row of toMigrate.slice(0, 3)) {
      console.log(`  ${row[idCol]}:\n    ${row[column]}\n    → ${toProxyUrl(row[column])}`);
    }
    return toMigrate.length;
  }

  // Apply
  let updated = 0;
  for (let i = 0; i < toMigrate.length; i++) {
    const row = toMigrate[i];
    const newVal = toProxyUrl(row[column]);
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

async function main() {
  console.log('=========================================');
  console.log(`  R2 URL Migration  (${APPLY ? 'APPLY MODE' : 'DRY-RUN'})`);
  console.log('=========================================\n');

  let total = 0;
  total += await migrateTable('manga', 'cover_url', 'id');
  total += await migrateTable('manga', 'banner_url', 'id');
  total += await migrateTable('chapters', 'thumbnail_url', 'id');
  total += await migrateTable('chapter_images', 'image_url', 'id');

  console.log('\n=========================================');
  if (APPLY) {
    console.log(`  DONE — ${total} rows updated.`);
  } else {
    console.log(`  DRY-RUN — ${total} rows would be updated.`);
    console.log('  Run with --apply to execute.');
  }
  console.log('=========================================');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});