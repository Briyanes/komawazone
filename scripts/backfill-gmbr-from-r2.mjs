#!/usr/bin/env node
/**
 * backfill-gmbr-from-r2.mjs
 *
 * Problem: 628,887 chapter_images still point to gmbr.pro (host is DEAD - 403 Forbidden).
 *          But many of these images were ALREADY downloaded to R2 in previous migration runs.
 *          The DB just wasn't updated.
 *
 * Strategy:
 * 1. List ALL objects in R2 under `chapters/` prefix (build a Set of existing keys)
 * 2. Query DB for all gmbr.pro images
 * 3. For each gmbr.pro image, check if chapters/{chapter_id}/{number}.jpg exists in R2
 * 4. If yes → batch update DB to point to R2 URL
 * 5. Also fix chapter thumbnails from R2 images
 *
 * Usage:
 *   node scripts/backfill-gmbr-from-r2.mjs               # Full run
 *   node scripts/backfill-gmbr-from-r2.mjs --dry-run      # Check only, no DB updates
 *   node scripts/backfill-gmbr-from-r2.mjs --thumbs-only   # Only fix thumbnails
 */

import { createClient } from '@supabase/supabase-js';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import { writeFileSync, appendFileSync, existsSync } from 'fs';

dotenv.config({ path: '.env.local' });

// ─── Config ─────────────────────────────────────────────────────────────────

const DRY_RUN    = process.argv.includes('--dry-run');
const THUMBS_ONLY = process.argv.includes('--thumbs-only');
const LOG_FILE   = 'scripts/backfill-r2-log.txt';

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET     = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET     = process.env.R2_BUCKET;

if (!SUPABASE_URL || !SUPABASE_KEY || !R2_ACCOUNT_ID || !R2_BUCKET) {
  console.error('❌ Missing env vars. Check .env.local');
  process.exit(1);
}

// ─── Clients ────────────────────────────────────────────────────────────────

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET },
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  const line = `[${ts}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + '\n');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Step 1: List ALL R2 objects under chapters/ ────────────────────────────

async function listAllR2ChapterObjects() {
  const existingKeys = new Set();
  // Map: chapter_id → Set of image numbers (as strings like "001", "01", "1")
  const chapterImages = new Map();

  log('📁 Step 1: Listing ALL R2 objects under chapters/ ...');
  let continuationToken = undefined;
  let totalListed = 0;

  while (true) {
    const command = new ListObjectsV2Command({
      Bucket: R2_BUCKET,
      Prefix: 'chapters/',
      MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });

    let response;
    try {
      response = await s3.send(command);
    } catch (e) {
      log(`⚠️ ListObjects error: ${e.message}, retrying in 3s...`);
      await sleep(3000);
      continue;
    }

    if (response.Contents) {
      for (const obj of response.Contents) {
        existingKeys.add(obj.Key);
        totalListed++;

        // Parse: chapters/{chapter_id}/{number}.jpg
        const match = obj.Key?.match(/^chapters\/([^/]+)\/(.+)\.(jpg|png|webp|gif|avif)$/i);
        if (match) {
          const [, chId, number] = match;
          if (!chapterImages.has(chId)) {
            chapterImages.set(chId, new Set());
          }
          chapterImages.get(chId).add(number);
        }
      }
    }

    if (totalListed % 10000 === 0) {
      log(`  📄 Listed ${totalListed.toLocaleString()} objects...`);
    }

    if (response.IsTruncated) {
      continuationToken = response.NextContinuationToken;
    } else {
      break;
    }
  }

  log(`✅ Found ${totalListed.toLocaleString()} objects in R2 under chapters/`);
  log(`  📦 ${chapterImages.size.toLocaleString()} unique chapters with images`);

  return { existingKeys, chapterImages };
}

// ─── Step 2: Check if specific R2 key exists (HEAD) ─────────────────────────

async function checkR2KeyExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Step 3: Update chapter_images from gmbr.pro → R2 ───────────────────────

async function backfillChapterImages(chapterImagesMap) {
  log('\n🔄 Step 2: Updating chapter_images (gmbr.pro → R2)...');

  const stats = { total: 0, updated: 0, notInR2: 0, alreadyR2: 0 };
  const startTime = Date.now();

  // Process in chapter batches
  const chapterIds = [...chapterImagesMap.keys()];
  log(`  Processing ${chapterIds.length.toLocaleString()} chapters...`);

  const BATCH_SIZE = 100;
  for (let batchStart = 0; batchStart < chapterIds.length; batchStart += BATCH_SIZE) {
    const batchChIds = chapterIds.slice(batchStart, batchStart + BATCH_SIZE);

    // Get gmbr.pro images for these chapters
    const { data: images, error } = await sb.from('chapter_images')
      .select('id, chapter_id, number, image_url')
      .in('chapter_id', batchChIds)
      .like('image_url', '%gmbr.pro%');

    if (error) {
      log(`⚠️ DB error at batch ${batchStart}: ${error.message}`);
      continue;
    }

    if (!images?.length) continue;

    const updates = [];
    for (const img of images) {
      stats.total++;
      const r2Images = chapterImagesMap.get(img.chapter_id);
      if (!r2Images) {
        stats.notInR2++;
        continue;
      }

      // Try different number formats (001, 01, 1, etc.)
      const numStr = String(img.number);
      const numPadded3 = String(img.number).padStart(3, '0');
      const numPadded2 = String(img.number).padStart(2, '0');

      let foundKey = null;
      for (const numFormat of [numStr, numPadded3, numPadded2]) {
        const key = `chapters/${img.chapter_id}/${numFormat}.jpg`;
        if (r2Images.has(numFormat)) {
          foundKey = key;
          break;
        }
        // Also check without extension in the set (the set stores just the number part)
        if (r2Images.has(numFormat + '.jpg')) {
          foundKey = key;
          break;
        }
      }

      if (foundKey) {
        updates.push({
          id: img.id,
          url: `/api/r2/image/${foundKey}`,
        });
        stats.updated++;
      } else {
        stats.notInR2++;
      }
    }

    // Batch update DB
    if (!DRY_RUN && updates.length > 0) {
      for (const u of updates) {
        await sb.from('chapter_images').update({ image_url: u.url }).eq('id', u.id);
      }
    }

    if ((batchStart / BATCH_SIZE) % 10 === 0) {
      const pct = ((batchStart + BATCH_SIZE) / chapterIds.length * 100).toFixed(0);
      log(`  📊 ${pct}% | ✅${stats.updated.toLocaleString()} updated | ❌${stats.notInR2.toLocaleString()} not in R2`);
    }
  }

  const mins = ((Date.now() - startTime) / 60000).toFixed(1);
  log(`\n✅ chapter_images done in ${mins} min`);
  log(`   Total checked: ${stats.total.toLocaleString()}`);
  log(`   ✅ Updated to R2: ${stats.updated.toLocaleString()}`);
  log(`   ❌ Not in R2: ${stats.notInR2.toLocaleString()}`);

  return stats;
}

// ─── Step 4: Fix chapter thumbnails ─────────────────────────────────────────

async function fixChapterThumbnails(chapterImagesMap) {
  log('\n🖼️ Step 3: Fixing chapter thumbnails...');

  const stats = { total: 0, updated: 0, skipped: 0 };
  const startTime = Date.now();

  // Get chapters with gmbr.pro thumbnail
  let offset = 0;
  const PAGE = 500;

  while (true) {
    const { data: chapters, error } = await sb.from('chapters')
      .select('id, number')
      .like('thumbnail_url', '%gmbr.pro%')
      .range(offset, offset + PAGE - 1);

    if (error) {
      log(`⚠️ DB error at offset ${offset}: ${error.message}`);
      break;
    }
    if (!chapters?.length) break;

    for (const ch of chapters) {
      stats.total++;
      const r2Images = chapterImagesMap.get(ch.id);
      if (!r2Images || r2Images.size === 0) {
        stats.skipped++;
        continue;
      }

      // Try 005 (5th page) first, then 001, then first available
      const candidates = ['005', '001', '01', '1', '0001'];
      let foundKey = null;
      for (const c of candidates) {
        if (r2Images.has(c)) {
          foundKey = `chapters/${ch.id}/${c}.jpg`;
          break;
        }
      }
      // If none of the candidates, take the first one alphabetically
      if (!foundKey && r2Images.size > 0) {
        const sorted = [...r2Images].sort();
        const first = sorted[0];
        foundKey = `chapters/${ch.id}/${first.includes('.') ? first : first + '.jpg'}`;
      }

      if (foundKey) {
        if (!DRY_RUN) {
          await sb.from('chapters').update({ thumbnail_url: `/api/r2/image/${foundKey}` }).eq('id', ch.id);
        }
        stats.updated++;
      } else {
        stats.skipped++;
      }
    }

    offset += PAGE;
    if (chapters.length < PAGE) break;
    if (stats.total % 1000 === 0) log(`  📊 ${stats.total} thumbnails checked...`);
  }

  const mins = ((Date.now() - startTime) / 60000).toFixed(1);
  log(`\n✅ Thumbnails done in ${mins} min`);
  log(`   Total: ${stats.total.toLocaleString()}`);
  log(`   ✅ Updated: ${stats.updated.toLocaleString()}`);
  log(`   ⏭️ Skipped (no R2 images): ${stats.skipped.toLocaleString()}`);

  return stats;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  🔄 Backfill gmbr.pro → R2 (from existing storage)  ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (no DB changes)' : 'LIVE'} | ThumbsOnly: ${THUMBS_ONLY}`);
  console.log('');

  if (!existsSync(LOG_FILE)) writeFileSync(LOG_FILE, '');

  // Step 1: List R2 objects
  const { existingKeys, chapterImages: chapterImagesMap } = await listAllR2ChapterObjects();

  if (!THUMBS_ONLY) {
    // Step 2: Update chapter_images
    await backfillChapterImages(chapterImagesMap);
  }

  // Step 3: Fix thumbnails
  await fixChapterThumbnails(chapterImagesMap);

  log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('✅ ALL DONE!');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(e => { log('Fatal: ' + e.message); process.exit(1); });