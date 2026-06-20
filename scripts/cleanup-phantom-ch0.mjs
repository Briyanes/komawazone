/**
 * Cleanup Phantom Chapter 0 — Delete chapters with number=0 AND 0 images.
 *
 * These phantom chapters were created during sitemap import but their images
 * were never downloaded. They show up in chapter lists but display
 * "Chapter Belum Tersedia" when clicked.
 *
 * Usage:
 *   node scripts/cleanup-phantom-ch0.mjs              # Dry run (preview)
 *   node scripts/cleanup-phantom-ch0.mjs --execute     # Actually delete
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ── Load .env.local ──────────────────────────────────────────────────────
const txt = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of txt.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);
const DO_EXECUTE = process.argv.includes('--execute');

console.log(`🔍 Manga Zone — Phantom Chapter Cleanup`);
console.log(`   Mode: ${DO_EXECUTE ? '⚠️  EXECUTE (will delete!)' : 'DRY RUN (preview only)'}`);
console.log('='.repeat(60));

// ── Step 1: Get all chapter_ids that HAVE images ─────────────────────────
console.log('\n📖 Step 1: Fetching chapter_ids that have images...');

const chaptersWithImages = new Set();
let offset = 0;
const PAGE = 1000;

while (true) {
  const { data, error } = await sb
    .from('chapter_images')
    .select('chapter_id')
    .range(offset, offset + PAGE - 1);

  if (error) {
    console.error('❌ Error fetching chapter_images:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) break;

  for (const row of data) {
    chaptersWithImages.add(row.chapter_id);
  }

  offset += PAGE;
  process.stdout.write(`\r   → fetched ${offset} image rows, ${chaptersWithImages.size} unique chapters with images`);

  if (data.length < PAGE) break;
}

console.log(`\n   ✅ Found ${chaptersWithImages.size} chapters that HAVE images`);

// ── Step 2: Fetch ALL chapters ───────────────────────────────────────────
console.log('\n📖 Step 2: Fetching all chapters...');

const allChapters = [];
offset = 0;

while (true) {
  const { data, error } = await sb
    .from('chapters')
    .select('id, number, title, manga_id, manga:manga(slug, title)')
    .range(offset, offset + PAGE - 1)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('❌ Error fetching chapters:', error.message);
    process.exit(1);
  }

  if (!data || data.length === 0) break;

  allChapters.push(...data);
  offset += PAGE;
  process.stdout.write(`\r   → fetched ${allChapters.length} chapters`);

  if (data.length < PAGE) break;
}

console.log(`\n   ✅ Total chapters in DB: ${allChapters.length}`);

// ── Step 3: Find phantom chapters (no images) ────────────────────────────
const phantomChapters = allChapters.filter(ch => !chaptersWithImages.has(ch.id));

console.log(`\n📊 Chapters with images:    ${allChapters.length - phantomChapters.length}`);
console.log(`🚨 Phantom chapters (0 img): ${phantomChapters.length}`);

if (phantomChapters.length === 0) {
  console.log('\n✅ No phantom chapters found. Database is clean!');
  process.exit(0);
}

// ── Step 4: Show sample ──────────────────────────────────────────────────
console.log('\n📋 Sample (first 20):');
phantomChapters.slice(0, 20).forEach((ch, i) => {
  const mangaTitle = Array.isArray(ch.manga) ? ch.manga[0]?.title : ch.manga?.title;
  const mangaSlug  = Array.isArray(ch.manga) ? ch.manga[0]?.slug  : ch.manga?.slug;
  console.log(`   ${(i+1).toString().padStart(3)}. [${mangaSlug ?? '?'}] Ch ${ch.number} — "${ch.title ?? 'Untitled'}" (${ch.id.slice(0,8)}…)`);
});

if (phantomChapters.length > 20) {
  console.log(`   … and ${phantomChapters.length - 20} more`);
}

// ── Step 5: Group by manga for summary ───────────────────────────────────
const byManga = {};
for (const ch of phantomChapters) {
  const key = ch.manga_id;
  if (!byManga[key]) byManga[key] = { count: 0, chapters: [] };
  byManga[key].count++;
  byManga[key].chapters.push(ch.id);
}

// Check which manga would become chapterless
const chapterCountByManga = {};
for (const ch of allChapters) {
  chapterCountByManga[ch.manga_id] = (chapterCountByManga[ch.manga_id] || 0) + 1;
}

let chapterlessCount = 0;
for (const [mangaId, info] of Object.entries(byManga)) {
  if (chapterCountByManga[mangaId] === info.count) {
    chapterlessCount++;
  }
}

console.log(`\n📊 Summary:`);
console.log(`   Affected manga:          ${Object.keys(byManga).length}`);
console.log(`   Total phantom to delete:  ${phantomChapters.length}`);
console.log(`   ⚠️  Manga that become chapterless: ${chapterlessCount}`);

// ── Step 6: Execute or dry-run ───────────────────────────────────────────
if (!DO_EXECUTE) {
  console.log('\n💡 This was a DRY RUN. To actually delete these phantom chapters:');
  console.log('   node scripts/cleanup-phantom-ch0.mjs --execute');
  process.exit(0);
}

// ── Execute: Delete in batches ───────────────────────────────────────────
console.log('\n🗑️  Deleting phantom chapters...');
const BATCH = 100;
let deleted = 0;
const allIds = phantomChapters.map(ch => ch.id);

for (let i = 0; i < allIds.length; i += BATCH) {
  const batch = allIds.slice(i, i + BATCH);
  const { error: delError } = await sb.from('chapters').delete().in('id', batch);
  if (delError) {
    console.error(`\n   ❌ Batch ${Math.floor(i/BATCH)+1} error:`, delError.message);
  } else {
    deleted += batch.length;
    process.stdout.write(`\r   Deleted ${deleted}/${allIds.length}...`);
  }
}

console.log(`\n\n✅ Cleanup complete! Deleted ${deleted} phantom chapters.`);
console.log(`   Manga affected: ${Object.keys(byManga).length}`);
console.log(`   Manga now chapterless: ${chapterlessCount} (consider hiding or re-importing these)`);