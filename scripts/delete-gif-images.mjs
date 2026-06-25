/**
 * Delete all .gif chapter images from DB + R2
 *
 * Usage:
 *   node scripts/delete-gif-images.mjs              # dry-run (preview only)
 *   node scripts/delete-gif-images.mjs --execute    # actually delete
 */

import { createClient } from '@supabase/supabase-js';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET;

const EXECUTE = process.argv.includes('--execute');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase env vars. Check .env.local');
  process.exit(1);
}
if (EXECUTE && (!R2_ACCOUNT_ID || !R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET)) {
  console.error('❌ Missing R2 env vars for deletion. Check .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

const s3Client = EXECUTE ? new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
}) : null;

async function deleteR2Object(key) {
  if (!EXECUTE) return { dryRun: true };
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    }));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function extractKey(url) {
  if (!url) return null;
  if (url.startsWith('/api/r2/image/')) {
    return url.slice('/api/r2/image/'.length);
  }
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, '');
    if (path.startsWith(`${R2_BUCKET}/`)) {
      return path.slice(R2_BUCKET.length + 1);
    }
    return path || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🎬 DELETE .GIF CHAPTER IMAGES`);
  console.log(`   Mode: ${EXECUTE ? '🔴 EXECUTE' : '⚪ DRY RUN (preview only)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Step 1: Fetch first batch to check if any .gif images exist + show samples
  console.log('📊 Step 1: Fetching sample .gif images...');
  const { data: firstBatch, error: firstError } = await sb
    .from('chapter_images')
    .select('id, image_url')
    .filter('image_url', 'ilike', '%.gif%')
    .range(0, 4);

  if (firstError) {
    console.error('Fetch error:', firstError.message);
    process.exit(1);
  }

  if (!firstBatch || firstBatch.length === 0) {
    console.log('✅ No .gif images found. Nothing to do.');
    return;
  }

  console.log(`  Sample URLs:`);
  for (const s of firstBatch) {
    console.log(`    ${s.image_url}`);
  }
  console.log('');

  // Dry-run: done
  if (!EXECUTE) {
    console.log(`💡 This was a DRY RUN. To actually delete, run:`);
    console.log(`   node scripts/delete-gif-images.mjs --execute\n`);
    return;
  }

  // Step 2: Delete in batches (fetch + delete, repeat)
  console.log(`🗑️  Deleting .gif images in batches...\n`);

  let deleted = 0;
  let r2Errors = 0;
  let dbErrors = 0;
  const PAGE = 200;

  while (true) {
    // Fetch a batch of .gif image IDs + URLs
    const { data: batch, error: fetchError } = await sb
      .from('chapter_images')
      .select('id, image_url')
      .filter('image_url', 'ilike', '%.gif%')
      .range(0, PAGE - 1);

    if (fetchError) {
      console.error('  Fetch error:', fetchError.message);
      break;
    }
    if (!batch || batch.length === 0) break;

    // Delete from R2 first (parallel)
    const r2Results = await Promise.all(
      batch.map(async (img) => {
        const key = extractKey(img.image_url);
        if (!key) return { ok: false };
        return deleteR2Object(key);
      })
    );
    r2Errors += r2Results.filter((r) => !r.ok).length;

    // Delete from DB
    const idsToDelete = batch.map((b) => b.id);
    const { error: dbError } = await sb
      .from('chapter_images')
      .delete()
      .in('id', idsToDelete);

    if (dbError) {
      console.error(`  DB delete error:`, dbError.message);
      dbErrors += batch.length;
    } else {
      deleted += batch.length;
    }

    process.stdout.write(
      `  Progress: ${deleted.toLocaleString()} deleted | R2 errs: ${r2Errors}\r`
    );

    if (batch.length < PAGE) break;
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`✅ DONE`);
  console.log(`   Deleted:   ${deleted.toLocaleString()}`);
  console.log(`   R2 errors: ${r2Errors.toLocaleString()}`);
  console.log(`   DB errors: ${dbErrors.toLocaleString()}`);
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});