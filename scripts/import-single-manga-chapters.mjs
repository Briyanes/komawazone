/**
 * Import ALL missing chapters for a SINGLE manga (by slug).
 *
 * Strategy:
 *   1. Fetch manga record from Supabase (get id + source_url)
 *   2. Fetch manga page from source, parse chapter list
 *   3. Query existing chapters from DB
 *   4. Insert MISSING chapters (metadata only — no image scraping)
 *      Images will lazy-load on first read via getChapterWithImages()
 *
 * Usage:
 *   node scripts/import-single-manga-chapters.mjs --slug im-the-only-man-on-the-military-base
 *   node scripts/import-single-manga-chapters.mjs --slug xxx --source https://other.source/manga/slug/
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Load .env.local ──────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local tidak ditemukan');
  process.exit(1);
}
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
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Parse args ───────────────────────────────────────────────────
const slugArg = process.argv[process.argv.indexOf('--slug') + 1];
const sourceArgIdx = process.argv.indexOf('--source');
const sourceOverride = sourceArgIdx !== -1 ? process.argv[sourceArgIdx + 1] : null;

if (!slugArg) {
  console.error('❌ Usage: node scripts/import-single-manga-chapters.mjs --slug <manga-slug>');
  process.exit(1);
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📚 Import chapters for manga: ${slugArg}\n`);

  // 1. Get manga from DB
  const { data: manga, error: mangaErr } = await sb
    .from('manga')
    .select('id, slug, title, source_url')
    .eq('slug', slugArg)
    .single();

  if (mangaErr || !manga) {
    console.error(`❌ Manga tidak ditemukan: ${slugArg}`, mangaErr?.message);
    process.exit(1);
  }

  console.log(`  ✓ Manga: ${manga.title}`);
  console.log(`  ✓ ID: ${manga.id}`);
  console.log(`  ✓ Source: ${sourceOverride || manga.source_url || '(none)'}\n`);

  // 2. Get existing chapters
  const { data: existing } = await sb
    .from('chapters')
    .select('id, number')
    .eq('manga_id', manga.id)
    .is('deleted_at', null);

  const existingNums = new Set((existing ?? []).map(c => c.number));
  console.log(`  ✓ Existing chapters in DB: ${existingNums.size}`);
  if (existingNums.size > 0) {
    console.log(`    → ${[...existingNums].sort((a, b) => a - b).join(', ')}\n`);
  }

  // 3. Fetch source page and parse chapter list
  let sourceUrl = sourceOverride || manga.source_url;
  if (!sourceUrl) {
    console.error('❌ Tidak ada source_url di DB dan tidak ada --source arg');
    process.exit(1);
  }

  console.log(`  ⏳ Fetching chapter list from: ${sourceUrl}`);
  const res = await fetch(sourceUrl, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'id,en;q=0.9' },
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    console.error(`❌ Source returned HTTP ${res.status}`);
    process.exit(1);
  }

  const html = await res.text();

  // Parse chapters: manhwaland uses data-num + href in <li> elements
  // Pattern: <li data-num="62"><a href="...chapter-62/">...</a></li>
  const chapterRegex = /data-num="([^"]+)"[\s\S]{0,300}?href="([^"]*?)"/g;
  const chapters = [];
  let match;
  while ((match = chapterRegex.exec(html)) !== null) {
    const num = parseFloat(match[1]);
    const url = match[2];
    if (!isNaN(num) && url) {
      chapters.push({ number: num, url: url.startsWith('http') ? url : new URL(url, sourceUrl).href });
    }
  }

  // Deduplicate by chapter number
  const seen = new Set();
  const uniqueChapters = chapters.filter(c => {
    if (seen.has(c.number)) return false;
    seen.add(c.number);
    return true;
  });

  console.log(`  ✓ Found ${uniqueChapters.length} chapters in source\n`);

  // 4. Filter to only MISSING chapters
  const toImport = uniqueChapters.filter(c => !existingNums.has(c.number));
  console.log(`  📋 Missing chapters to import: ${toImport.length}`);

  if (toImport.length === 0) {
    console.log('\n✅ Semua chapter sudah ada di DB. Tidak perlu import.\n');
    return;
  }

  // Sort ascending by chapter number
  toImport.sort((a, b) => a.number - b.number);

  // 5. Insert missing chapters (metadata only — images lazy-load on read)
  console.log(`  ⏳ Inserting ${toImport.length} chapter records...\n`);

  let inserted = 0;
  let failed = 0;

  // Batch insert in groups of 25
  for (let i = 0; i < toImport.length; i += 25) {
    const batch = toImport.slice(i, i + 25);
    const rows = batch.map(ch => ({
      manga_id: manga.id,
      number: ch.number,
      title: `Chapter ${ch.number}`,
      source_url: ch.url,
    }));

    const { error: insertErr } = await sb
      .from('chapters')
      .upsert(rows, { onConflict: 'manga_id,number', ignoreDuplicates: true });

    if (insertErr) {
      console.error(`  ✗ Batch ${i}-${i + batch.length}: ${insertErr.message}`);
      failed += batch.length;
    } else {
      inserted += batch.length;
      console.log(`  ✓ Inserted batch: ch ${batch[0].number}-${batch[batch.length - 1].number} (${batch.length} chapters)`);
    }
  }

  console.log(`\n✅ Done! Inserted: ${inserted}, Failed: ${failed}\n`);

  // 6. Verify
  const { count } = await sb
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .eq('manga_id', manga.id)
    .is('deleted_at', null);

  console.log(`📊 Total chapters in DB now: ${count}\n`);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});