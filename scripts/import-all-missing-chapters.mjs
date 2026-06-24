#!/usr/bin/env node
/**
 * IMPORT ALL MISSING CHAPTERS
 * 
 * For EVERY manga with a source_url:
 *   1. Fetch full chapter list from WP REST API
 *   2. Compare with DB chapters
 *   3. Insert any missing chapters
 * 
 * Also handles manga with 0 chapters.
 * 
 * Usage:
 *   node scripts/import-all-missing-chapters.mjs              # all manga
 *   node scripts/import-all-missing-chapters.mjs --limit 50   # first 50
 *   node scripts/import-all-missing-chapters.mjs --slug xxx   # specific manga
 *   node scripts/import-all-missing-chapters.mjs --dry-run    # preview only
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

function extractSlug(sourceUrl) {
  try {
    const u = new URL(sourceUrl);
    const parts = u.pathname.replace(/\/$/, '').split('/').filter(Boolean);
    const mangaIdx = parts.indexOf('manga');
    if (mangaIdx !== -1 && mangaIdx + 1 < parts.length) {
      return parts[mangaIdx + 1];
    }
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

// ── Fetch all manga ─────────────────────────────────────────────
async function fetchAllManga(specificSlug) {
  const results = [];
  let offset = 0;
  
  let query = sb
    .from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('title', { ascending: true });
  
  if (specificSlug) {
    query = query.eq('slug', specificSlug);
  }
  
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error fetching manga:', error.message); break; }
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return results;
}

// ── Fetch existing chapter numbers for a manga ──
async function getExistingChapterNumbers(mangaId) {
  const { data, error } = await sb
    .from('chapters')
    .select('number')
    .eq('manga_id', mangaId)
    .is('deleted_at', null);
  
  if (error) {
    console.error('Error fetching existing chapters:', error.message);
    return new Set();
  }
  
  return new Set(data?.map(c => c.number) || []);
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const slugIdx = args.indexOf('--slug');
  const specificSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;
  const dryRun = args.includes('--dry-run');

  console.log('━'.repeat(60));
  console.log('📦 IMPORT ALL MISSING CHAPTERS — Full Sync');
  console.log('━'.repeat(60));

  // 1. Get all manga
  console.log('⏳ Fetching all manga...');
  const allManga = await fetchAllManga(specificSlug);
  console.log(`📊 Total manga to check: ${allManga.length}`);

  if (allManga.length === 0) {
    console.log('✅ No manga found!');
    return;
  }

  const targets = limit > 0 ? allManga.slice(0, limit) : allManga;
  console.log(`🎯 Will process: ${targets.length} manga${dryRun ? ' (DRY RUN)' : ''}`);
  console.log('━'.repeat(60));
  console.log('');

  let processed = 0;
  let totalChaptersAdded = 0;
  let totalMissingFound = 0;
  let failed = 0;
  let trulyEmpty = 0;
  let alreadyComplete = 0;
  let importSuccess = 0;
  const startTime = Date.now();

  for (const manga of targets) {
    processed++;
    const prefix = `[${processed}/${targets.length}]`;

    try {
      const slug = extractSlug(manga.source_url);
      if (!slug) {
        console.log(`${prefix} ⚠️  ${manga.title?.slice(0, 40)} — Cannot extract slug`);
        failed++;
        continue;
      }

      // Fetch chapters via API
      const apiChapters = await fetchChaptersViaApi(slug);

      if (apiChapters.length === 0) {
        trulyEmpty++;
        await sleep(200);
        continue;
      }

      // Get existing chapter numbers
      const existing = await getExistingChapterNumbers(manga.id);
      
      // Find missing chapters
      const missing = [];
      const seen = new Set();
      for (const ch of apiChapters) {
        const num = parseFloat(ch.number);
        if (isNaN(num)) continue;
        if (existing.has(num) || seen.has(num)) continue;
        seen.add(num);
        missing.push({
          manga_id: manga.id,
          number: num,
          title: ch.title || `Chapter ${num}`,
          deleted_at: null,
          ...(ch.updated_at ? { release_date: new Date(ch.updated_at).toISOString() } : {}),
        });
      }

      if (missing.length === 0) {
        alreadyComplete++;
        if (processed % 100 === 0) {
          console.log(`${prefix} ✅ ${manga.title?.slice(0, 40)} — Complete (${apiChapters.length} ch)`);
        }
        await sleep(100);
        continue;
      }

      totalMissingFound += missing.length;

      if (dryRun) {
        console.log(`${prefix} 🔍 ${manga.title?.slice(0, 40)} — Missing ${missing.length}/${apiChapters.length} chapters`);
        await sleep(100);
        continue;
      }

      // Insert missing chapters
      let insertedCount = 0;
      for (let i = 0; i < missing.length; i += 50) {
        const { data: upsertData, error: upsertErr } = await sb
          .from('chapters')
          .upsert(missing.slice(i, i + 50), { onConflict: 'manga_id,number' })
          .select('id');

        if (upsertErr) {
          console.error(`${prefix}   ❌ Upsert error:`, upsertErr.message);
        } else {
          insertedCount += (upsertData?.length ?? 0);
        }
      }

      totalChaptersAdded += insertedCount;
      importSuccess++;
      
      if (missing.length > 5) {
        console.log(`${prefix} ✅ ${manga.title?.slice(0, 40)} — Added ${insertedCount} chapters (was ${existing.size}, now ${existing.size + insertedCount}/${apiChapters.length})`);
      }

      await sleep(300 + Math.random() * 200);

    } catch (err) {
      if (err.message?.includes('404') || err.message?.includes('403')) {
        // Source deleted/blocked — skip silently
        failed++;
        await sleep(500);
      } else {
        console.error(`${prefix} ❌ ${manga.title?.slice(0, 40)} — ${err.message}`);
        failed++;
        await sleep(1000);
      }
    }

    if (processed % 50 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / (elapsed / 60)).toFixed(1);
      const remaining = ((targets.length - processed) / rate).toFixed(0);
      console.log('');
      console.log(`  📈 Progress: ${processed}/${targets.length} (${rate}/min, ~${remaining}min left) | Added: ${totalChaptersAdded} | Missing found: ${totalMissingFound} | Complete: ${alreadyComplete} | Empty: ${trulyEmpty} | Failed: ${failed}`);
      console.log('');
    }
  }

  const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('━'.repeat(60));
  console.log(`  Processed        : ${processed} (${elapsedTotal}s)`);
  console.log(`  Already Complete : ${alreadyComplete}`);
  console.log(`  Import Success   : ${importSuccess} manga`);
  console.log(`  Chapters Added   : ${totalChaptersAdded}`);
  console.log(`  Missing Found    : ${totalMissingFound}`);
  console.log(`  Truly Empty      : ${trulyEmpty} (0 on source)`);
  console.log(`  Failed           : ${failed}`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});