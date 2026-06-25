/**
 * Delete all .gif chapter images from DB + R2
 * 
 * Usage:
 *   node scripts/delete-gif-images.mjs              # dry-run (preview only)
 *   node scripts/delete-gif-images.mjs --execute    # actually delete
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID || process.env.CLOUDFLARE_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY || process.env.CLOUDFLARE_SECRET_ACCESS_KEY_KEY;
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'manga-images';

const EXECUTE = process.argv.includes('--execute');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars. Check .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function deleteR2Object(key) {
  if (!EXECUTE) return { dryRun: true };

  try {
    const url = `https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${R2_ACCESS_KEY}:${R2_SECRET_KEY}`,
      },
    });
    return { ok: res.ok };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 DELETE .GIF CHAPTER IMAGES`);
  console.log(`   Mode: ${EXECUTE ? '🔴 EXECUTE' : '⚪ DRY RUN (preview only)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Find all .gif chapter images (paginated)
  const allGifs = [];
  let offset = 0;
  const PAGE = 1000;

  console.log('📊 Step 1: Finding all .gif chapter images...');
  while (true) {
    const { data, error } = await sb
      .from('chapter_images')
      .select('id, chapter_id, image_url')
      .filter('image_url', 'ilike', '%.gif%')
      .range(offset, offset + PAGE - 1);

    if (error) {
      console.error('Query error:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allGifs.push(...data);
    process.stdout.write(`  Found ${allGifs.length} .gif images...\r`);
    offset += PAGE;

    if (data.length < PAGE) break;
  }

  console.log(`\n  ✅ Total .gif images found: ${allGifs.length.toLocaleString()}\n`);

  if (allGifs.length === 0) {
    console.log('✅ No .gif images found. Nothing to do.');
    return;
  }

  // Step 2: Group by chapter to check which chapters will become empty
  console.log('📊 Step 2: Checking chapter safety...');
  const chapterIds = [...new Set(allGifs.map((g) => g.chapter_id))];

  // For each chapter, check if ALL images are .gif
  const unsafeChapters = new Set();
  for (const chId of chapterIds) {
    const { count: totalInChapter } = await sb
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chId);

    const gifsInChapter = allGifs.filter((g) => g.chapter_id === chId).length;

    if (totalInChapter === gifsInChapter) {
      unsafeChapters.add(chId);
    }
  }

  console.log(`  ⚠️  Chapters where ALL images are .gif (will skip): ${unsafeChapters.size}`);

  // Filter: only delete .gif images from chapters that have other non-gif images
  const safeToDelete = allGifs.filter((g) => !unsafeChapters.has(g.chapter_id));
  const skipped = allGifs.filter((g) => unsafeChapters.has(g.chapter_id));

  console.log(`  ✅ Safe to delete: ${safeToDelete.length.toLocaleString()}`);
  console.log(`  ⏭️  Skipped (would make chapter empty): ${skipped.length.toLocaleString()}\n`);

  if (safeToDelete.length === 0) {
    console.log('Nothing safe to delete. Exiting.');
    return;
  }

  // Step 3: Delete from R2 + DB
  if (!EXECUTE) {
    console.log(`\n💡 This was a DRY RUN. To actually delete, run:`);
    console.log(`   node scripts/delete-gif-images.mjs --execute\n`);
    return;
  }

  console.log('🗑️  Step 3: Deleting from R2 + DB...\n');

  let deleted = 0;
  let errors = 0;
  const BATCH = 50;

  for (let i = 0; i < safeToDelete.length; i += BATCH) {
    const batch = safeToDelete.slice(i, i + BATCH);

    // Delete from R2 (extract key from URL)
    await Promise.all(
      batch.map(async (img) => {
        // URL format: /api/r2/image/chapters/{chapterId}/{filename}
        const match = img.image_url.match(/\/api\/r2\/image\/(.+)$/);
        if (match) {
          const r2Key = match[1];
          await deleteR2Object(r2Key);
        }
      })
    );

    // Delete from DB
    const idsToDelete = batch.map((b) => b.id);
    const { error: dbError } = await sb
      .from('chapter_images')
      .delete()
      .in('id', idsToDelete);

    if (dbError) {
      console.error(`  DB delete error:`, dbError.message);
      errors += batch.length;
    } else {
      deleted += batch.length;
    }

    process.stdout.write(
      `  Progress: ${deleted.toLocaleString()} deleted | ${((i + BATCH) / safeToDelete.length * 100).toFixed(1)}%\r`
    );
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`✅ DONE`);
  console.log(`   Deleted: ${deleted.toLocaleString()}`);
  console.log(`   Errors:  ${errors.toLocaleString()}`);
  console.log(`   Skipped (chapter safety): ${skipped.length.toLocaleString()}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});