#!/usr/bin/env node
/**
 * Fix ALL chapter thumbnails to use the 5th image FROM THE LAST
 *
 * Example: Chapter with 30 images → thumbnail = image #26 (30 - 5 + 1)
 * Fallback for chapters with < 5 images → use first image
 *
 * Adapted from fix-all-thumbnails-to-5th-final.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OFFSET_FROM_LAST = 5; // 5th from last

const STATS = {
  totalProcessed: 0,
  updatedTo5thFromLast: 0,
  fallbackShort: 0, // chapter has < 5 images → use first/only image
  skippedNoImages: 0,
  alreadyCorrect: 0,
  errors: 0,
};

async function main() {
  console.log('🔧 Fix ALL Chapter Thumbnails → 5th Image FROM LAST');
  console.log('='.repeat(55));

  // Step 1: Fetch ALL chapters (we need to recalculate every thumbnail)
  console.log('\n📋 Step 1: Fetching all chapters...');

  const allChapters = [];
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

    allChapters.push(...data);
    offset += CHAPTER_BATCH;
    process.stdout.write(`\r  Fetched ${allChapters.length} chapters...`);
    if (data.length < CHAPTER_BATCH) break;
  }

  console.log(`\n  ✅ Total: ${allChapters.length.toLocaleString()} chapters`);

  // Step 2: Process in concurrency batches
  console.log('\n📋 Step 2: Updating thumbnails to 5th-from-last...');

  const CONCURRENCY = 20;

  for (let i = 0; i < allChapters.length; i += CONCURRENCY) {
    const batch = allChapters.slice(i, i + CONCURRENCY);
    const chapterIds = batch.map((c) => c.id);

    // Get all images for these chapters in ONE query (batch optimization)
    const { data: images, error } = await sb
      .from('chapter_images')
      .select('chapter_id, number, image_url')
      .in('chapter_id', chapterIds)
      .order('number', { ascending: true });

    if (error) {
      console.error('\nQuery error:', error.message);
      STATS.errors += batch.length;
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

    // Determine new thumbnail for each chapter
    const updates = [];

    for (const ch of batch) {
      STATS.totalProcessed++;

      const chImages = imagesByChapter[ch.id] || [];

      if (chImages.length === 0) {
        STATS.skippedNoImages++;
        continue;
      }

      let newThumb;

      if (chImages.length >= OFFSET_FROM_LAST) {
        // 5th from last: images[len-5]
        // Example: 30 images → index 25 (0-based) = 26th image
        newThumb = chImages[chImages.length - OFFSET_FROM_LAST];
        STATS.updatedTo5thFromLast++;
      } else {
        // Chapter has < 5 images → use first image as fallback
        newThumb = chImages[0];
        STATS.fallbackShort++;
      }

      if (newThumb && newThumb.image_url !== ch.thumbnail_url) {
        updates.push({
          id: ch.id,
          thumbnail_url: newThumb.image_url,
        });
      } else {
        STATS.alreadyCorrect++;
      }
    }

    // Parallel batch update
    await Promise.all(
      updates.map(async (update) => {
        const { error: updateError } = await sb
          .from('chapters')
          .update({ thumbnail_url: update.thumbnail_url })
          .eq('id', update.id);

        if (updateError) {
          console.error(`\nUpdate error for ${update.id}:`, updateError.message);
          STATS.errors++;
        }
      })
    );

    const pct = ((STATS.totalProcessed / allChapters.length) * 100).toFixed(1);
    process.stdout.write(
      `\r📊 ${pct}% (${STATS.totalProcessed.toLocaleString()}/${allChapters.length.toLocaleString()}) | 5thLast: ${STATS.updatedTo5thFromLast.toLocaleString()} | Fallback: ${STATS.fallbackShort} | Same: ${STATS.alreadyCorrect} | NoImg: ${STATS.skippedNoImages} | Err: ${STATS.errors}`
    );

    await new Promise((r) => setTimeout(r, 10)); // minimal rate limit
  }

  // Summary
  console.log('\n');
  console.log('='.repeat(55));
  console.log('✅ DONE!');
  console.log('='.repeat(55));
  console.log(`Total processed:       ${STATS.totalProcessed.toLocaleString()}`);
  console.log(`Updated to 5th-last:   ${STATS.updatedTo5thFromLast.toLocaleString()}`);
  console.log(`Fallback (<5 imgs):    ${STATS.fallbackShort.toLocaleString()}`);
  console.log(`Already correct:       ${STATS.alreadyCorrect.toLocaleString()}`);
  console.log(`Skipped (no images):   ${STATS.skippedNoImages.toLocaleString()}`);
  console.log(`Errors:                ${STATS.errors}`);

  // Sample verification — show 5 random chapters
  console.log('\n=== SAMPLE VERIFICATION (5 random chapters) ===');
  const { data: samples } = await sb
    .from('chapters')
    .select('id, number, thumbnail_url')
    .not('thumbnail_url', 'is', null)
    .limit(5);

  for (const ch of samples || []) {
    // Get image count for this chapter
    const { count } = await sb
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', ch.id);

    console.log(`  Chapter ${ch.number} (${count} imgs): ${ch.thumbnail_url?.split('/').pop()}`);
  }

  console.log('\n💡 Note: ISR cache (10 min) will auto-refresh on next visit.');
}

main().catch(console.error);