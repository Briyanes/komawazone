/**
 * Import chapters for manga that have NO chapters at all.
 *
 * This script runs locally with the SERVICE ROLE key, bypassing RLS.
 * It fixes the problem where the dashboard "Import Chapter Semua Manga"
 * button creates jobs that look successful ("50 manga diperbarui") but
 * actually insert 0 chapters (because after() loses auth context on Vercel).
 *
 * Usage:
 *   node scripts/import-missing-chapters.mjs              # all manga without chapters
 *   node scripts/import-missing-chapters.mjs --limit 50   # first 50 only
 *   node scripts/import-missing-chapters.mjs --slug xxx   # specific manga slug
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

// ── Helpers ──────────────────────────────────────────────────────
function normalizeIndonesianDate(raw) {
  return raw
    .replace(/Januari/i, 'January')
    .replace(/Februari/i, 'February')
    .replace(/Maret/i, 'March')
    .replace(/Mei/i, 'May')
    .replace(/Juni/i, 'June')
    .replace(/Juli/i, 'July')
    .replace(/Agustus/i, 'August')
    .replace(/Oktober/i, 'October')
    .replace(/Desember/i, 'December');
}

/**
 * Parse chapter list from manhwaland.land HTML.
 * Ported from src/lib/scrapers/manga-scraper.ts → parseChapterListFromHtml
 */
function parseChapterListFromHtml(html) {
  const chapters = [];

  if (html.includes('id="chapterlist"') || html.includes('class="eplister"')) {
    const liRe = /<li[^>]+data-num="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(html)) !== null) {
      const dataNum = parseFloat(liMatch[1]);
      const block = liMatch[2];

      const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (!aMatch) continue;
      const url = aMatch[1].trim();

      const numMatch = block.match(/<span[^>]+class="chapternum"[^>]*>\s*(?:Chapter\s*)?(\d+(?:\.\d+)?)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : dataNum;

      const titleMatch = block.match(/<span[^>]+class="chapternum"[^>]*>([^<]+)/i);
      const title = titleMatch ? titleMatch[1].trim() : `Chapter ${number}`;

      const dateRaw = block.match(/<span[^>]+class="chapterdate"[^>]*>([^<]+)/i)?.[1]?.trim() ?? null;
      let releasedAt = null;
      if (dateRaw) {
        try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
      }

      chapters.push({ number, title, url, releasedAt });
    }
    if (chapters.length > 0) return chapters.sort((a, b) => a.number - b.number);
  }

  // Fallback: Madara wp-manga-chapter
  const liRe = /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch;
  while ((liMatch = liRe.exec(html)) !== null) {
    const block = liMatch[1];
    const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (!aMatch) continue;
    const url = aMatch[1].trim();
    const rawTitle = aMatch[2].replace(/<[^>]+>/g, '').trim();
    const numFromUrl = url.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i) ?? rawTitle.match(/^(\d+(?:\.\d+)?)/);
    const numStr = numFromUrl?.[1] ?? numFromTitle?.[1];
    const number = numStr ? parseFloat(numStr) : null;
    if (number === null) continue;
    const dateRaw = block.match(/<i[^>]*>([^<]+)<\/i>/i)?.[1]?.trim() ?? null;
    let releasedAt = null;
    if (dateRaw) {
      try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
    }
    chapters.push({ number, title: rawTitle, url, releasedAt });
  }

  return chapters.sort((a, b) => a.number - b.number);
}

function isBlockedPage(html) {
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_opt') ||
    html.includes('Just a moment') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('Checking if the site connection is secure') ||
    html.includes('DDoS protection by') ||
    html.includes('_cf_chl_tk') ||
    html.length < 2000
  );
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const slugIdx = args.indexOf('--slug');
  const specificSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

  console.log('━'.repeat(60));
  console.log('📦 IMPORT MISSING CHAPTERS — Local Script');
  console.log('━'.repeat(60));

  // 1. Get all manga IDs that already have chapters
  const { data: existingChapters } = await sb
    .from('chapters')
    .select('manga_id')
    .is('deleted_at', null);

  const mangaWithChapters = new Set((existingChapters ?? []).map(c => c.manga_id));
  console.log(`📊 Manga WITH chapters: ${mangaWithChapters.size}`);

  // 2. Get all manga with source_url
  let query = sb
    .from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('title', { ascending: true });

  if (specificSlug) {
    query = query.eq('slug', specificSlug);
  }

  const { data: allManga, error: mangaErr } = await query;
  if (mangaErr) {
    console.error('❌ Error fetching manga:', mangaErr.message);
    process.exit(1);
  }

  // 3. Filter manga without chapters
  const mangaWithoutChapters = (allManga ?? []).filter(m => !mangaWithChapters.has(m.id));
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
  let skipped = 0;

  for (const manga of targets) {
    processed++;
    const prefix = `[${processed}/${targets.length}]`;

    try {
      // Fetch manga page
      const res = await fetch(manga.source_url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
          'Referer': manga.source_url,
        },
        signal: AbortSignal.timeout(20_000),
      });

      if (!res.ok) {
        console.log(`${prefix} ❌ ${manga.title?.slice(0, 40)} — HTTP ${res.status}`);
        failed++;
        await sleep(500);
        continue;
      }

      const html = await res.text();

      if (isBlockedPage(html)) {
        console.log(`${prefix} 🚫 ${manga.title?.slice(0, 40)} — CloudFlare blocked`);
        failed++;
        await sleep(2000 + Math.random() * 1000);
        continue;
      }

      const chapters = parseChapterListFromHtml(html);

      if (chapters.length === 0) {
        console.log(`${prefix} ⚠️  ${manga.title?.slice(0, 40)} — No chapters found`);
        skipped++;
        await sleep(300);
        continue;
      }

      // Upsert chapters (metadata only — images fetched lazily later)
      // Include deleted_at: null to "un-delete" any soft-deleted chapters
      // Deduplicate by number to avoid "affect row a second time" error
      const seen = new Set();
      const rows = [];
      for (const ch of chapters) {
        const key = `${manga.id}:${ch.number}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          manga_id: manga.id,
          number: ch.number,
          title: ch.title || `Chapter ${ch.number}`,
          deleted_at: null,
          ...(ch.releasedAt ? { release_date: ch.releasedAt } : {}),
        });
      }

      let insertedCount = 0;
      // Batch upsert in groups of 50
      // Use merge (NOT ignoreDuplicates) to "un-delete" soft-deleted chapters
      for (let i = 0; i < rows.length; i += 50) {
        const { data: upsertData, error: upsertErr } = await sb
          .from('chapters')
          .upsert(rows.slice(i, i + 50), {
            onConflict: 'manga_id,number',
          })
          .select('id');

        if (upsertErr) {
          console.error(`${prefix}   ❌ Upsert error:`, upsertErr.message);
        } else {
          insertedCount += (upsertData?.length ?? 0);
        }
      }

      totalChaptersAdded += insertedCount;
      console.log(`${prefix} ✅ ${manga.title?.slice(0, 40)} — ${insertedCount}/${chapters.length} chapters`);

      // Rate limit: wait between manga
      await sleep(800 + Math.random() * 500);

    } catch (err) {
      console.error(`${prefix} ❌ ${manga.title?.slice(0, 40)} — ${err.message}`);
      failed++;
      await sleep(1000);
    }

    // Progress update every 10 manga
    if (processed % 10 === 0) {
      console.log('');
      console.log(`  📈 Progress: ${processed}/${targets.length} | Added: ${totalChaptersAdded} chapters | Failed: ${failed}`);
      console.log('');
    }
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('━'.repeat(60));
  console.log(`  Processed   : ${processed}`);
  console.log(`  Chapters    : ${totalChaptersAdded} added`);
  console.log(`  Skipped     : ${skipped} (no chapters on source)`);
  console.log(`  Failed      : ${failed}`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});