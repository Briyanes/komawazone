#!/usr/bin/env node
/**
 * Fix NULL thumbnail chapters by checking R2 for existing images.
 * Sets thumbnail to 5th image (or 1st if <5 images) for chapters that have images in R2.
 * 
 * Usage: node scripts/fix-null-thumbnails-from-r2.mjs [--dry-run]
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;
const R2_BASE = 'https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev';

// Load env
const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// R2 client
const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = env.R2_BUCKET_NAME || 'manga-zone';

async function listR2Images(chapterId) {
  const prefix = `chapters/${chapterId}/`;
  try {
    const cmd = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      MaxKeys: 10,
    });
    const resp = await r2.send(cmd);
    if (!resp.Contents || resp.Contents.length === 0) return [];
    // Sort by key
    const keys = resp.Contents.map((c) => c.Key).sort();
    return keys;
  } catch {
    return [];
  }
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`🔧 FIX NULL THUMBNAILS FROM R2 ${DRY_RUN ? '(DRY RUN)' : ''}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Count NULL thumbnail chapters
  const { count: nullCount } = await sb.from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .is('thumbnail_url', null);
  console.log(`📊 NULL thumbnail chapters: ${nullCount}`);

  if (nullCount === 0) {
    console.log('✅ All chapters have thumbnails!');
    return;
  }

  let processed = 0;
  let fixed = 0;
  let noImages = 0;
  let offset = 0;

  while (offset < nullCount) {
    // Fetch batch of NULL thumbnail chapters
    const { data: chapters, error } = await sb.from('chapters')
      .select('id, number, manga_id')
      .is('deleted_at', null)
      .is('thumbnail_url', null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (error || !chapters) {
      console.log('❌ Error fetching:', error?.message);
      break;
    }

    for (const ch of chapters) {
      processed++;
      
      // List R2 images for this chapter
      const images = await listR2Images(ch.id);
      
      if (images.length === 0) {
        noImages++;
        if (processed % 50 === 0) {
          console.log(`[${processed}/${nullCount}] No images for Ch ${ch.number} (${ch.id.substring(0,8)})`);
        }
        continue;
      }

      // Pick 5th image, or fall back to 1st
      let thumbKey = null;
      // Try to find 5.jpg or 005.jpg
      const fifthImages = images.filter((k) => k.match(/\/5\.jpg$/i) || k.match(/\/005\.jpg$/i));
      if (fifthImages.length > 0) {
        thumbKey = fifthImages[0];
      } else {
        // Use first image
        thumbKey = images[0];
      }

      const thumbUrl = `${R2_BASE}/${thumbKey}`;

      if (!DRY_RUN) {
        const { error: updateErr } = await sb.from('chapters')
          .update({ thumbnail_url: thumbUrl })
          .eq('id', ch.id);
        
        if (updateErr) {
          console.log(`❌ Update failed for ${ch.id}: ${updateErr.message}`);
        } else {
          fixed++;
        }
      } else {
        fixed++;
      }

      if (processed % 50 === 0) {
        console.log(`[${processed}/${nullCount}] Fixed Ch ${ch.number} → ${thumbKey.split('/').pop()}`);
      }
    }

    offset += BATCH_SIZE;
    // Small delay between batches
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📊 RESULTS:`);
  console.log(`   Processed: ${processed}`);
  console.log(`   Fixed:     ${fixed}`);
  console.log(`   No images: ${noImages}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main().catch(console.error);