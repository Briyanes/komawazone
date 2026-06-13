#!/usr/bin/env node
/**
 * Database Diagnostics — Cek kondisi manga, chapters, covers, thumbnails.
 *
 * Usage:
 *   node --env-file=.env.local scripts/db-diagnostics.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// R2 URL pattern — covers on R2 start with the R2 public URL
const R2_PATTERN = /^https:\/\/pub-[a-z0-9]+\.r2\.dev|^https:\/\/[a-z0-9-]+\.r2\.dev/i;

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  MANGA ZONE — DATABASE DIAGNOSTICS');
  console.log('═══════════════════════════════════════════════\n');

  // ── 1. TOTAL MANGA ─────────────────────────────────────────────
  const { count: totalManga } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);
  console.log(`📚 Total Manga:          ${totalManga ?? 0}`);

  // ── 2. MANGA WITHOUT COVER ─────────────────────────────────────
  const { count: nullCover } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .is('cover_url', null)
    .is('deleted_at', null);
  console.log(`   ├─ Tanpa cover (NULL): ${nullCover ?? 0}`);

  // Manga with non-R2 cover (broken/dead URL) — paginate to get ALL rows
  let nonR2Manga = [];
  for (let offset = 0; ; offset += 1000) {
    const { data } = await sb.from('manga')
      .select('id, title, cover_url')
      .not('cover_url', 'is', null)
      .is('deleted_at', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    nonR2Manga = nonR2Manga.concat(data);
    if (data.length < 1000) break;
  }
  const brokenCovers = nonR2Manga.filter(m => !R2_PATTERN.test(m.cover_url));
  console.log(`   └─ Cover non-R2:       ${brokenCovers.length} (kemungkinan mati)\n`);

  // ── 3. TOTAL CHAPTERS ──────────────────────────────────────────
  const { count: totalChapters } = await sb.from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);
  console.log(`📖 Total Chapters:       ${totalChapters ?? 0}`);

  // ── 4. MANGA WITHOUT CHAPTERS ──────────────────────────────────
  const { data: allMangaIds } = await sb.from('manga')
    .select('id, title, slug, source_url')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });

  const mangaIds = (allMangaIds ?? []).map(m => m.id);
  const mangaWithSource = (allMangaIds ?? []).filter(m => m.source_url);

  // Find manga IDs that have at least one chapter
  const mangaWithChapterIds = new Set();
  for (let i = 0; i < mangaIds.length; i += 200) {
    const chunk = mangaIds.slice(i, i + 200);
    const { data } = await sb.from('chapters')
      .select('manga_id')
      .in('manga_id', chunk)
      .is('deleted_at', null);
    (data ?? []).forEach(c => mangaWithChapterIds.add(c.manga_id));
  }

  const mangaWithoutChapters = (allMangaIds ?? []).filter(m => !mangaWithChapterIds.has(m.id));
  console.log(`   ├─ Manga tanpa chapter: ${mangaWithoutChapters.length}`);
  console.log(`   │  └─ Punya source_url: ${mangaWithoutChapters.filter(m => m.source_url).length}`);
  console.log(`   └─ Manga punya chapter: ${mangaWithChapterIds.size}\n`);

  // ── 5. CHAPTER THUMBNAILS ──────────────────────────────────────
  const { count: nullThumb } = await sb.from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null)
    .is('deleted_at', null);
  console.log(`🖼️  Chapter tanpa thumbnail: ${nullThumb ?? 0} dari ${totalChapters ?? 0}`);

  // ── 6. CHAPTER IMAGES ─────────────────────────────────────────
  const { count: totalChapterImages } = await sb.from('chapter_images')
    .select('*', { count: 'exact', head: true });
  console.log(`🖼️  Total Chapter Images:  ${totalChapterImages ?? 0}`);

  // Chapters with at least one image
  const { data: chaptersWithImages } = await sb.from('chapter_images')
    .select('chapter_id')
    .limit(50000);
  const chaptersWithImagesSet = new Set((chaptersWithImages ?? []).map(ci => ci.chapter_id));
  console.log(`   └─ Chapter dgn images:   ${chaptersWithImagesSet.size}\n`);

  // ── 7. CONTENT RATING BREAKDOWN ────────────────────────────────
  const { count: generalManga } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .eq('content_rating', 'general')
    .is('deleted_at', null);
  const { count: matureManga } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .eq('content_rating', 'mature')
    .is('deleted_at', null);
  const { count: nullRating } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .is('content_rating', null)
    .is('deleted_at', null);
  console.log(`🔞 Content Rating:`);
  console.log(`   ├─ General:  ${generalManga ?? 0}`);
  console.log(`   ├─ Mature:   ${matureManga ?? 0}`);
  console.log(`   └─ NULL:     ${nullRating ?? 0}\n`);

  // ── 8. SOURCE BREAKDOWN ────────────────────────────────────────
  const { data: sources } = await sb.from('manga_sources')
    .select('id, name, base_url, content_rating, is_active');
  if (sources && sources.length > 0) {
    console.log(`🌐 Manga Sources:`);
    for (const s of sources) {
      const { count } = await sb.from('manga')
        .select('*', { count: 'exact', head: true })
        .eq('source_id', s.id)
        .is('deleted_at', null);
      console.log(`   ${s.is_active ? '✅' : '❌'} ${s.name} [${s.content_rating}]: ${count ?? 0} manga`);
    }
    console.log('');
  }

  // ── SUMMARY ────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total manga:            ${totalManga ?? 0}`);
  console.log(`  Manga tanpa cover:      ${nullCover ?? 0} + ${brokenCovers.length} broken = ${(nullCover ?? 0) + brokenCovers.length}`);
  console.log(`  Manga tanpa chapter:    ${mangaWithoutChapters.length}`);
  console.log(`  Total chapters:         ${totalChapters ?? 0}`);
  console.log(`  Chapter tanpa thumb:    ${nullThumb ?? 0}`);
  console.log(`  Chapter dgn images:     ${chaptersWithImagesSet.size}`);
  console.log('');

  // List first 20 manga without chapters (for manual import)
  if (mangaWithoutChapters.length > 0) {
    console.log('── Manga tanpa chapter (first 20) ──');
    for (const m of mangaWithoutChapters.slice(0, 20)) {
      console.log(`  • ${m.title} — ${m.slug} — ${m.source_url ?? 'no source'}`);
    }
    if (mangaWithoutChapters.length > 20) {
      console.log(`  ... dan ${mangaWithoutChapters.length - 20} lainnya`);
    }
  }

  // List first 10 manga without covers
  if (brokenCovers.length > 0) {
    console.log('\n── Manga dgn cover non-R2 (first 10) ──');
    for (const m of brokenCovers.slice(0, 10)) {
      console.log(`  • ${m.title} — ${m.cover_url}`);
    }
    if (brokenCovers.length > 10) {
      console.log(`  ... dan ${brokenCovers.length - 10} lainnya`);
    }
  }

  console.log('\n═══════════════════════════════════════════════');
  console.log('  Done.');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});