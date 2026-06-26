#!/usr/bin/env node
/**
 * Fix ALL chapter thumbnails → 5th image FROM LAST (BULK OPTIMIZED)
 *
 * Key optimization: Instead of 43,000+ individual UPDATE requests,
 * we batch chapters by their target thumbnail URL and do bulk updates
 * using .in('id', [...]) — reducing HTTP requests by ~95%.
 *
 * Usage:
 *   node scripts/fix-thumbnails-5th-bulk.mjs
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const OFFSET_FROM_LAST = 5;
const STATS = {
  totalProcessed: 0,
  totalUpdated: 0,
  batchUpdates: 0,
  skippedNoImages: 0,
  alreadyCorrect: 0,
  errors: 0,
};

async function main() {
  console.log('🔧 Fix ALL Chapter Thumbnails → 5th Image FROM LAST (BULK)');
  console.log('='.repeat(60));
  console.log('');

  // Step 1: Fetch ALL chapters
  console.log('📋 Step 1: Fetching all chapters...');
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

  // Step 2: Fetch ALL chapter_images in batches and build a lookup map
  console.log('\n📋 Step 2: Fetching all chapter images...');
  const imagesByChapter = {};
  offset = 0;
  const IMG_BATCH = 1000;
  let totalImages = 0;

  while (true) {
    const { data, error } = await sb
      .from('chapter_images')
      .select('chapter_id, number, image_url')
      .order('chapter_id', { ascending: true })
      .order('number', { ascending: true })
      .range(offset, offset + IMG_BATCH - 1);

    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const img of data) {
      if (!imagesByChapter[img.chapter_id]) {
        imagesByChapter[img.chapter_id] = [];
      }
      imagesByChapter[img.chapter_id].push(img);
    }

    totalImages += data.length;
    offset += IMG_BATCH;
    process.stdout.write(`\r  Fetched ${totalImages.toLocaleString()} images...`);
    if (data.length < IMG_BATCH) break;
  }
  console.log(`\n  ✅ Total: ${totalImages.toLocaleString()} images`);

  // Step 3: Calculate target thumbnail for each chapter
  console.log('\n📋 Step 3: Calculating target thumbnails...');

  // Map: thumbnailUrl → array of chapter IDs that need this URL
  const updatesByUrl = new Map();
  // Also track chapter_id → target_url for verification
  const targetMap = new Map();

  for (const ch of allChapters) {
    STATS.totalProcessed++;

    const chImages = imagesByChapter[ch.id] || [];

    if (chImages.length === 0) {
      STATS.skippedNoImages++;
      continue;
    }

    let targetUrl;
    if (chImages.length >= OFFSET_FROM_LAST) {
      targetUrl = chImages[chImages.length - OFFSET_FROM_LAST].image_url;
    } else {
      targetUrl = chImages[0].image_url;
    }

    if (targetUrl === ch.thumbnail_url) {
      STATS.alreadyCorrect++;
      continue;
    }

    targetMap.set(ch.id, targetUrl);
    if (!updatesByUrl.has(targetUrl)) {
      updatesByUrl.set(targetUrl, []);
    }
    updatesByUrl.get(targetUrl).push(ch.id);
  }

  const totalToUpdate = targetMap.size;
  console.log(`  📊 Chapters to update: ${totalToUpdate.toLocaleString()}`);
  console.log(`  📊 Unique thumbnail URLs: ${updatesByUrl.size.toLocaleString()}`);
  console.log(`  📊 Already correct: ${STATS.alreadyCorrect.toLocaleString()}`);
  console.log(`  📊 Skipped (no images): ${STATS.skippedNoImages.toLocaleString()}`);

  if (totalToUpdate === 0) {
    console.log('\n✅ All thumbnails are already correct!');
    return;
  }

  // Step 4: Bulk update — for each unique URL, update all chapters at once
  // Supabase .in() supports up to ~500 IDs efficiently, so we chunk them
  console.log('\n📋 Step 4: Bulk updating thumbnails...');
  const CHUNK_SIZE = 200; // Safe batch size for .in() filter
  let updateCount = 0;

  for (const [targetUrl, chapterIds] of updatesByUrl) {
    // Chunk the chapter IDs for this URL
    for (let i = 0; i < chapterIds.length; i += CHUNK_SIZE) {
      const chunk = chapterIds.slice(i, i + CHUNK_SIZE);

      const { error: updateError } = await sb
        .from('chapters')
        .update({ thumbnail_url: targetUrl })
        .in('id', chunk);

      if (updateError) {
        console.error(`\nUpdate error for batch:`, updateError.message);
        STATS.errors += chunk.length;
      } else {
        updateCount += chunk.length;
        STATS.batchUpdates++;
      }

      const pct = ((updateCount / totalToUpdate) * 100).toFixed(1);
      process.stdout.write(
        `\r  📊 ${pct}% (${updateCount.toLocaleString()}/${totalToUpdate.toLocaleString()}) | Batch updates: ${STATS.batchUpdates} | Errors: ${STATS.errors}`
      );
    }
  }

  STATS.totalUpdated = updateCount;

  // Summary
  console.log('\n');
  console.log('='.repeat(60));
  console.log('✅ DONE!');
  console.log('='.repeat(60));
  console.log(`Total processed:       ${STATS.totalProcessed.toLocaleString()}`);
  console.log(`Total updated:         ${STATS.totalUpdated.toLocaleString()}`);
  console.log(`Already correct:       ${STATS.alreadyCorrect.toLocaleString()}`);
  console.log(`Skipped (no images):   ${STATS.skippedNoImages.toLocaleString()}`);
  console.log(`Batch update calls:    ${STATS.batchUpdates.toLocaleString()}`);
  console.log(`Errors:                ${STATS.errors}`);
  console.log('\n💡 ISR cache (10 min) will auto-refresh on next visit.');
}

main().catch(console.error);