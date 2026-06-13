#!/usr/bin/env node
/**
 * Cleanup orphaned chapters from soft-deleted manga.
 *
 * When a manga is soft-deleted, its chapters should also be soft-deleted.
 * This script finds and cleans up:
 *   - Chapters that are still active but belong to soft-deleted manga
 *   - chapter_images records for those chapters
 *   - Optionally: R2 objects for those images
 *
 * Usage:
 *   node --env-file=.env.local scripts/cleanup-orphaned-chapters.mjs --dry-run   # preview
 *   node --env-file=.env.local scripts/cleanup-orphaned-chapters.mjs             # soft-delete chapters
 *   node --env-file=.env.local scripts/cleanup-orphaned-chapters.mjs --hard      # also delete images + R2
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, DeleteObjectsCommand } from '@aws-sdk/client-s3';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hardDelete = args.includes('--hard');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// R2 client (only needed for --hard)
const r2 = hardDelete ? new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
}) : null;

const BUCKET = process.env.R2_BUCKET_NAME || 'olluq-manga';

async function getDeletedMangaIds() {
  const ids = [];
  let page = 0;
  while (true) {
    const { data } = await supabase
      .from('manga')
      .select('id')
      .not('deleted_at', 'is', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    ids.push(...data.map(m => m.id));
    if (data.length < 1000) break;
    page++;
  }
  return ids;
}

async function getOrphanedChapters(deletedMangaIds) {
  const orphanedChapters = [];
  let cpage = 0;
  while (true) {
    const { data: chs } = await supabase
      .from('chapters')
      .select('id, manga_id, number')
      .is('deleted_at', null)
      .range(cpage * 1000, (cpage + 1) * 1000 - 1);
    if (!chs || chs.length === 0) break;
    for (const ch of chs) {
      if (deletedMangaIds.includes(ch.manga_id)) {
        orphanedChapters.push(ch);
      }
    }
    if (chs.length < 1000) break;
    cpage++;
  }
  return orphanedChapters;
}

async function deleteR2Objects(keys) {
  if (!r2 || keys.length === 0) return 0;

  let deleted = 0;
  // R2/S3 allows max 1000 objects per request
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    try {
      const command = new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: {
          Objects: batch.map(key => ({ Key: key })),
        },
      });
      const result = await r2.send(command);
      deleted += result.Deleted?.length || 0;
      if (result.Errors?.length > 0) {
        console.error(`  R2 delete errors: ${result.Errors.length}`);
      }
    } catch (err) {
      console.error(`  R2 batch delete error: ${err.message}`);
    }
  }
  return deleted;
}

function extractR2Key(url) {
  try {
    const u = new URL(url);
    // R2 URLs: https://pub-xxx.r2.dev/pages/manga-slug-ch1/001.jpg
    //          https://bucket.r2.cloudflarestorage.com/olluq-manga/pages/...
    const parts = u.pathname.split('/').filter(Boolean);
    // Remove bucket name if present in path
    if (parts[0] === BUCKET) parts.shift();
    return parts.join('/');
  } catch {
    return null;
  }
}

async function main() {
  console.log('=== Orphaned Chapters Cleanup ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : hardDelete ? 'HARD DELETE' : 'SOFT DELETE'}`);
  console.log();

  // Step 1: Get all soft-deleted manga IDs
  console.log('1. Fetching soft-deleted manga...');
  const deletedMangaIds = await getDeletedMangaIds();
  console.log(`   Found ${deletedMangaIds.length} soft-deleted manga`);

  // Step 2: Get orphaned chapters (active chapters of deleted manga)
  console.log('\n2. Finding orphaned chapters...');
  const orphanedChapters = await getOrphanedChapters(deletedMangaIds);
  console.log(`   Found ${orphanedChapters.length} orphaned chapters`);

  if (orphanedChapters.length === 0) {
    console.log('\n✅ Nothing to clean!');
    return;
  }

  // Step 3: Get chapter_images for these chapters
  console.log('\n3. Fetching chapter images...');
  const chapterIds = orphanedChapters.map(c => c.id);
  let allImages = [];
  for (let i = 0; i < chapterIds.length; i += 100) {
    const batch = chapterIds.slice(i, i + 100);
    const { data: imgs } = await supabase
      .from('chapter_images')
      .select('id, image_url')
      .in('chapter_id', batch);
    if (imgs) allImages.push(...imgs);
  }
  console.log(`   Found ${allImages.length} chapter images`);
  const r2Images = allImages.filter(img =>
    img.image_url && (img.image_url.includes('.r2.dev') || img.image_url.includes('cloudflarestorage'))
  );
  console.log(`   - R2 images: ${r2Images.length}`);
  console.log(`   - External images: ${allImages.length - r2Images.length}`);

  if (dryRun) {
    console.log('\n[DRY RUN] Would perform:');
    console.log(`  - Soft-delete ${orphanedChapters.length} chapters`);
    console.log(`  - Delete ${allImages.length} chapter_images records`);
    if (hardDelete) {
      console.log(`  - Delete ${r2Images.length} R2 objects`);
    }
    return;
  }

  // Step 4: Soft-delete chapters
  console.log('\n4. Soft-deleting orphaned chapters...');
  let chaptersDeleted = 0;
  for (let i = 0; i < chapterIds.length; i += 100) {
    const batch = chapterIds.slice(i, i + 100);
    const { error } = await supabase
      .from('chapters')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', batch);
    if (error) {
      console.error(`   Error: ${error.message}`);
    } else {
      chaptersDeleted += batch.length;
    }
  }
  console.log(`   ✅ Soft-deleted ${chaptersDeleted} chapters`);

  // Step 5: Delete chapter_images
  console.log('\n5. Deleting chapter_images records...');
  let imagesDeleted = 0;
  for (let i = 0; i < chapterIds.length; i += 100) {
    const batch = chapterIds.slice(i, i + 100);
    const { error } = await supabase
      .from('chapter_images')
      .delete()
      .in('chapter_id', batch);
    if (error) {
      console.error(`   Error: ${error.message}`);
    } else {
      imagesDeleted += allImages.filter(img => batch.includes(img.id?.split('-')[0]) || true).length;
    }
  }
  console.log(`   ✅ Deleted chapter_images records`);

  // Step 6: Delete R2 objects (only with --hard)
  if (hardDelete && r2Images.length > 0) {
    console.log('\n6. Deleting R2 objects...');
    const r2Keys = r2Images
      .map(img => extractR2Key(img.image_url))
      .filter(Boolean);
    const uniqueKeys = [...new Set(r2Keys)];
    console.log(`   ${uniqueKeys.length} unique R2 keys to delete`);
    const deleted = await deleteR2Objects(uniqueKeys);
    console.log(`   ✅ Deleted ${deleted} R2 objects`);
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('=== CLEANUP SUMMARY ===');
  console.log('═'.repeat(50));
  console.log(`Chapters soft-deleted: ${chaptersDeleted}`);
  console.log(`Chapter images deleted: ${allImages.length}`);
  if (hardDelete) {
    console.log(`R2 objects deleted: ${r2Images.length}`);
  }
  console.log('\n✅ Cleanup complete!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});