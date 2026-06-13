#!/usr/bin/env node
/**
 * Cleanup: Hard-delete all manga with NULL cover_url.
 *
 * These 428 entries are ghost/empty manga — no valid cover, no chapter images.
 * Deleting them cleans up the DB so only manga with real content remain.
 *
 * Deletes in order: chapter_images → chapters → manga (FK-safe).
 *
 * Usage:
 *   node --env-file=.env.local scripts/cleanup-null-covers.mjs
 *   node --env-file=.env.local scripts/cleanup-null-covers.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';

const DRY_RUN = process.argv.includes('--dry-run');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no data will be deleted\n' : '🗑️  LIVE DELETE — data WILL be removed\n');

  // 1. Get all NULL-cover manga (include soft-deleted too for full cleanup)
  const { data: nullManga, error } = await sb.from('manga')
    .select('id, title, slug')
    .is('cover_url', null);

  if (error) {
    console.error('❌ Failed to fetch manga:', error.message);
    process.exit(1);
  }

  console.log(`📊 Found ${nullManga.length} manga with NULL cover_url\n`);

  if (nullManga.length === 0) {
    console.log('✅ Nothing to clean up.');
    return;
  }

  const ids = nullManga.map(m => m.id);

  // 2. Count related data
  let totalChapterImages = 0;
  let totalChapters = 0;
  let totalReadingProgress = 0;
  let totalBookmarks = 0;

  // Check chapters in chunks
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);

    // Count chapter_images
    const { count: ci } = await sb.from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .in('chapter_id', (
        await sb.from('chapters').select('id').in('manga_id', chunk)
      ).data?.map(c => c.id) || []);

    // Count chapters
    const { count: ch } = await sb.from('chapters')
      .select('*', { count: 'exact', head: true })
      .in('manga_id', chunk);
    totalChapters += ch || 0;

    // Count reading_progress
    const { count: rp } = await sb.from('reading_progress')
      .select('*', { count: 'exact', head: true })
      .in('manga_id', chunk);
    totalReadingProgress += rp || 0;

    // Count bookmarks
    const { count: bm } = await sb.from('bookmarks')
      .select('*', { count: 'exact', head: true })
      .in('manga_id', chunk);
    totalBookmarks += bm || 0;
  }

  // Get chapter IDs for chapter_images count
  const { data: chapterIds } = await sb.from('chapters')
    .select('id').in('manga_id', ids);
  if (chapterIds?.length) {
    const cIds = chapterIds.map(c => c.id);
    for (let i = 0; i < cIds.length; i += 200) {
      const chunk = cIds.slice(i, i + 200);
      const { count } = await sb.from('chapter_images')
        .select('*', { count: 'exact', head: true })
        .in('chapter_id', chunk);
      totalChapterImages += count || 0;
    }
  }

  console.log('📋 Data to be deleted:');
  console.log(`   Manga:              ${ids.length}`);
  console.log(`   Chapters:           ${totalChapters}`);
  console.log(`   Chapter Images:     ${totalChapterImages}`);
  console.log(`   Reading Progress:   ${totalReadingProgress}`);
  console.log(`   Bookmarks:          ${totalBookmarks}`);
  console.log('');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN complete. Run without --dry-run to actually delete.');
    return;
  }

  // 3. Delete chapter_images (need chapter IDs first)
  if (chapterIds?.length) {
    const cIds = chapterIds.map(c => c.id);
    console.log('🗑️  Deleting chapter_images...');
    for (let i = 0; i < cIds.length; i += 200) {
      const chunk = cIds.slice(i, i + 200);
      const { error } = await sb.from('chapter_images').delete().in('chapter_id', chunk);
      if (error) console.warn('  ⚠️ chapter_images delete error:', error.message);
    }
    console.log('   ✅ Done');
  }

  // 4. Delete reading_progress
  if (totalReadingProgress > 0) {
    console.log('🗑️  Deleting reading_progress...');
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await sb.from('reading_progress').delete().in('manga_id', chunk);
    }
    console.log('   ✅ Done');
  }

  // 5. Delete bookmarks
  if (totalBookmarks > 0) {
    console.log('🗑️  Deleting bookmarks...');
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      await sb.from('bookmarks').delete().in('manga_id', chunk);
    }
    console.log('   ✅ Done');
  }

  // 6. Delete chapters
  console.log('🗑️  Deleting chapters...');
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { error } = await sb.from('chapters').delete().in('manga_id', chunk);
    if (error) console.warn('  ⚠️ chapters delete error:', error.message);
  }
  console.log('   ✅ Done');

  // 7. Delete manga
  console.log('🗑️  Deleting manga...');
  let deletedCount = 0;
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data, error } = await sb.from('manga').delete().in('id', chunk).select('id');
    if (error) console.warn('  ⚠️ manga delete error:', error.message);
    deletedCount += data?.length || 0;
  }
  console.log(`   ✅ Deleted ${deletedCount} manga`);

  // 8. Verify
  const { count: remaining } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .is('cover_url', null);

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ Cleanup complete!`);
  console.log(`   Deleted:            ${deletedCount} manga`);
  console.log(`   Remaining NULL cov: ${remaining}`);
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});