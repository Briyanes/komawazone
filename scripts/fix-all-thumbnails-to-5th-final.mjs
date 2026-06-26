#!/usr/bin/env node
/**
 * Fix ALL chapter thumbnails to use the 5th image (or fallback)
 * OPTIMIZED: Batch queries instead of per-chapter queries
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const STATS = {
  totalProcessed: 0,
  fixedTo5th: 0,
  fixedFallback: 0,
  skippedNoImages: 0,
  alreadyCorrect: 0,
  errors: 0,
};

async function main() {
  console.log('🔧 Fix ALL Chapter Thumbnails to 5th Image');
  console.log('='.repeat(50));

  // Step 1: Get chapters that need fixing (NOT already /5.jpg or /5.webp)
  console.log('\n📋 Step 1: Finding chapters that need fixing...');

  // Fetch all chapters in batches
  let allChaptersToFix = [];
  let offset = 0;
  const CHAPTER_BATCH = 1000;

  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('id, thumbnail_url')
      .order('id', { ascending: true })
      .range(offset, offset + CHAPTER_BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    // Filter: keep chapters that are NOT correct
    const needsFix = data.filter((ch) => {
      const thumb = ch.thumbnail_url || '';
      return !/\/5\.(jpg|webp|png)$/.test(thumb);
    });

    allChaptersToFix.push(...needsFix);
    offset += CHAPTER_BATCH;
    process.stdout.write(`\r  Fetched ${offset} chapters, ${allChaptersToFix.length} need fix...`);
    if (data.length < CHAPTER_BATCH) break;
  }

  console.log(`\n  ✅ Found ${allChaptersToFix.length} chapters to fix`);

  // Step 2: For each chapter that needs fixing, get its images
  console.log('\n📋 Step 2: Fixing thumbnails...');

  const CONCURRENCY = 20; // Process 20 chapters at a time
  const UPDATE_BATCH = 50; // Batch DB updates

  for (let i = 0; i < allChaptersToFix.length; i += CONCURRENCY) {
    const batch = allChaptersToFix.slice(i, i + CONCURRENCY);
    const chapterIds = batch.map((c) => c.id);

    // Get all images for these chapters in ONE query
    const { data: images, error } = await sb
      .from('chapter_images')
      .select('chapter_id, number, image_url')
      .in('chapter_id', chapterIds)
      .order('number', { ascending: true });

    if (error) {
      console.error('Query error:', error.message);
      continue;
    }

    // Group images by chapter_id
    const imagesByChapter = {};
    for (const img of images || []) {
      if (!imagesByChapter[img.chapter_id]) {
        imagesByChapter[img.chapter_id] = [];
      }
      imagesByChapter[img.chapter_id].push(img);
    }

    // Process each chapter
    const updates = [];

    for (const ch of batch) {
      STATS.totalProcessed++;

      const chImages = imagesByChapter[ch.id] || [];

      if (chImages.length === 0) {
        STATS.skippedNoImages++;
        continue;
      }

      // Find the 5th image
      let newThumb = chImages.find((img) => img.number === 5);

      if (!newThumb) {
        // Fallback chain: closest to 5
        newThumb =
          chImages.find((img) => img.number === 4) ||
          chImages.find((img) => img.number === 6) ||
          chImages.find((img) => img.number === 3) ||
          chImages.find((img) => img.number === 7) ||
          chImages.find((img) => img.number === 8) ||
          chImages.find((img) => img.number === 2) ||
          chImages.find((img) => img.number === 1) ||
          chImages.find((img) => img.number === 9) ||
          chImages[0];

        STATS.fixedFallback++;
      } else {
        STATS.fixedTo5th++;
      }

      if (newThumb && newThumb.image_url !== ch.thumbnail_url) {
        updates.push({
          id: ch.id,
          thumbnail_url: newThumb.image_url,
        });
      }
    }

    // Parallel batch update — all updates in this concurrency batch run simultaneously
    await Promise.all(
      updates.map(async (update) => {
        const { error: updateError } = await sb
          .from('chapters')
          .update({ thumbnail_url: update.thumbnail_url })
          .eq('id', update.id);

        if (updateError) {
          STATS.errors++;
        }
      })
    );

    const pct = ((STATS.totalProcessed / allChaptersToFix.length) * 100).toFixed(1);
    process.stdout.write(
      `\r📊 ${pct}% (${STATS.totalProcessed}/${allChaptersToFix.length}) | Fixed 5th: ${STATS.fixedTo5th} | Fallback: ${STATS.fixedFallback} | NoImg: ${STATS.skippedNoImages} | Err: ${STATS.errors}`
    );

    await new Promise((r) => setTimeout(r, 10)); // Minimal rate limit (updates are parallel now)
  }

  console.log('\n');
  console.log('='.repeat(50));
  console.log('✅ DONE!');
  console.log('='.repeat(50));
  console.log(`Total processed:    ${STATS.totalProcessed.toLocaleString()}`);
  console.log(`Fixed to 5th:       ${STATS.fixedTo5th.toLocaleString()}`);
  console.log(`Fixed (fallback):   ${STATS.fixedFallback.toLocaleString()}`);
  console.log(`Skipped (no img):   ${STATS.skippedNoImages.toLocaleString()}`);
  console.log(`Errors:             ${STATS.errors}`);

  // Final verification
  console.log('\n=== FINAL VERIFICATION ===');
  const { count: gifCount } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%.gif');
  const { count: nullCount } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('thumbnail_url', null);
  const { count: fifthCount } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%/5.%');
  const { count: total } = await sb.from('chapters').select('*', { count: 'exact', head: true });

  console.log(`Total chapters:     ${total?.toLocaleString()}`);
  console.log(`Thumbnail .gif:     ${gifCount || 0}`);
  console.log(`Thumbnail NULL:     ${nullCount || 0}`);
  console.log(`Thumbnail 5th img:  ${fifthCount?.toLocaleString()}`);
}

main().catch(console.error);