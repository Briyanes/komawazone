/**
 * Import chapters for ALL empty manga using the manhwaland WP REST API.
 *
 * KEY INSIGHT: The HTML page loads chapters via JS AJAX, so static HTML has an empty <ul>.
 * The WP REST API at /wp-json/apisas/v1/manga/{slug} returns the full chapter list as JSON.
 *
 * This is ~10x faster than HTML scraping AND correctly identifies truly empty manga.
 *
 * Usage:
 *   node scripts/import-chapters-via-api.mjs              # all manga without chapters
 *   node scripts/import-chapters-via-api.mjs --limit 50   # first 50 only
 *   node scripts/import-chapters-via-api.mjs --slug xxx   # specific manga slug
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Load .env.local ──────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGE_SIZE = 1000;

// ── Helpers ──────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Extract slug from source_url.
 * URL format: https://04x.manhwaland.land/manga/{slug}/
 */
function extractSlug(sourceUrl) {
  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    // /manga/{slug} → slug is parts[1]
    const mangaIdx = parts.indexOf('manga');
    if (mangaIdx !== -1 && mangaIdx + 1 < parts.length) {
      return parts[mangaIdx + 1];
    }
    // Fallback: last part
    return parts[parts.length - 1];
  } catch {
    return null;
  }
}

/**
 * Fetch chapters for a manga slug via WP REST API.
 * Returns array of {id, title, number, updated_at} or empty array.
 */
async function fetchChaptersViaApi(slug) {
  const apiUrl = `https://04x.manhwaland.land/wp-json/apisas/v1/manga/${encodeURIComponent(slug)}`;
  const res = await fetch(apiUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    throw new Error(`API HTTP ${res.status}`);
  }

  const json = await res.json();
  if (json.status !== 'success' || !json.data) {
    throw new Error('API returned non-success status');
  }

  return json.data.chapters ?? [];
}

// ── Paginated fetch helpers ─────────────────────────────────────
async function fetchAllMangaIdsWithChapters() {
  const ids = new Set();
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error fetching chapters:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const c of data) ids.add(c.manga_id);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return ids;
}

async function fetchAllMangaWithoutChapters(withoutSet) {
  const results = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('manga')
      .select('id, slug, title, source_url')
      .not('source_url', 'is', null)
      .is('deleted_at', null)
      .order('title', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error fetching manga:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const m of data) {
      if (!withoutSet.has(m.id)) results.push(m);
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const slugIdx = args.indexOf('--slug');
  const specificSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

  console.log('━'.repeat(60));
  console.log('📦 IMPORT CHAPTERS VIA WP REST API — Fast & Accurate');
  console.log('━'.repeat(60));

  // 1. Get all manga IDs with chapters
  console.log('⏳ Fetching all manga IDs with chapters (paginated)...');
  const mangaWithChapters = await fetchAllMangaIdsWithChapters();
  console.log(`📊 Manga WITH chapters: ${mangaWithChapters.size}`);

  // 2. Get all manga without chapters
  console.log('⏳ Fetching all manga WITHOUT chapters (paginated)...');
  let mangaWithoutChapters;
  if (specificSlug) {
    const { data } = await sb.from('manga').select('id, slug, title, source_url').eq('slug', specificSlug).is('deleted_at', null);
    mangaWithoutChapters = (data ?? []).filter(m => !mangaWithChapters.has(m.id));
  } else {
    mangaWithoutChapters = await fetchAllMangaWithoutChapters(mangaWithChapters);
  }
  console.log(`📊 Manga WITHOUT chapters: ${mangaWithoutChapters.length}`);

  if (mangaWithoutChapters.length === 0) {
    console.log('✅ All manga already have chapters!');
    return;
  }

  const targets = limit > 0 ? mangaWithoutChapters.slice(0, limit) : mangaWithoutChapters;
  console.log(`🎯 Will process: ${targets.length} manga`);
  console.log('━'.repeat(60));
  console.log('');

  let processed = 0;
  let totalChaptersAdded = 0;
  let failed = 0;
  let trulyEmpty = 0; // manga with 0 chapters on source
  let importSuccess = 0;

  for (const manga of targets) {
    processed++;
    const prefix = `[${processed}/${targets.length}]`;

    try {
      // Extract slug from source_url
      const slug = extractSlug(manga.source_url);
      if (!slug) {
        console.log(`${prefix} ⚠️  ${manga.title?.slice(0, 40)} — Cannot extract slug from URL`);
        failed++;
        continue;
      }

      // Fetch chapters via API
      const apiChapters = await fetchChaptersViaApi(slug);

      if (apiChapters.length === 0) {
        console.log(`${prefix} ⬜ ${manga.title?.slice(0, 40)} — Truly empty (0 chapters on source)`);
        trulyEmpty++;
        await sleep(200);
        continue;
      }

      // Upsert chapters
      const seen = new Set();
      const rows = [];
      for (const ch of apiChapters) {
        const num = parseFloat(ch.number);
        if (isNaN(num)) continue;
        const key = `${manga.id}:${num}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          manga_id: manga.id,
          number: num,
          title: ch.title || `Chapter ${num}`,
          deleted_at: null,
          ...(ch.updated_at ? { release_date: new Date(ch.updated_at).toISOString() } : {}),
        });
      }

      let insertedCount = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const { data: upsertData, error: upsertErr } = await sb
          .from('chapters')
          .upsert(rows.slice(i, i + 50), { onConflict: 'manga_id,number' })
          .select('id');

        if (upsertErr) {
          console.error(`${prefix}   ❌ Upsert error:`, upsertErr.message);
        } else {
          insertedCount += (upsertData?.length ?? 0);
        }
      }

      totalChaptersAdded += insertedCount;
      importSuccess++;
      console.log(`${prefix} ✅ ${manga.title?.slice(0, 40)} — ${insertedCount}/${apiChapters.length} chapters`);

      await sleep(300 + Math.random() * 200);

    } catch (err) {
      console.error(`${prefix} ❌ ${manga.title?.slice(0, 40)} — ${err.message}`);
      failed++;
      await sleep(1000);
    }

    if (processed % 50 === 0) {
      console.log('');
      console.log(`  📈 Progress: ${processed}/${targets.length} | Added: ${totalChaptersAdded} chapters | Success: ${importSuccess} | Empty: ${trulyEmpty} | Failed: ${failed}`);
      console.log('');
    }
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('━'.repeat(60));
  console.log(`  Processed     : ${processed}`);
  console.log(`  Import Success: ${importSuccess} manga`);
  console.log(`  Chapters Added: ${totalChaptersAdded}`);
  console.log(`  Truly Empty   : ${trulyEmpty} (0 chapters on source)`);
  console.log(`  Failed        : ${failed}`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});