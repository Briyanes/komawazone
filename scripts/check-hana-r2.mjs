#!/usr/bin/env node
/**
 * Check R2 thumbnail existence for Hana's Demons of Lust chapters
 */
import { createClient } from '@supabase/supabase-js';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';

const env = {};
const envText = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf-8');
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});

async function main() {
  const mangaId = '929adfa1-91bc-4b3f-9843-57d07868052f';

  const { data: chapters } = await sb.from('chapters')
    .select('id, number, thumbnail_url')
    .eq('manga_id', mangaId)
    .is('deleted_at', null)
    .order('number', { ascending: true });

  console.log('Total chapters:', chapters.length);

  let nullThumb = 0;
  let r2ThumbExists = 0;
  let r2ThumbMissing = 0;
  const missingChapters = [];

  for (const ch of chapters) {
    if (!ch.thumbnail_url) {
      nullThumb++;
      continue;
    }

    const key = ch.thumbnail_url.replace(/^https?:\/\/[^/]+\//, '');

    try {
      const cmd = new HeadObjectCommand({ Bucket: env.R2_BUCKET, Key: key });
      await s3.send(cmd);
      r2ThumbExists++;
    } catch(e) {
      r2ThumbMissing++;
      missingChapters.push({ number: ch.number, key });
    }
  }

  console.log('\n=== Hana Thumbnail Status ===');
  console.log('  NULL thumbnail:', nullThumb);
  console.log('  R2 EXISTS:', r2ThumbExists);
  console.log('  R2 MISSING:', r2ThumbMissing);

  if (missingChapters.length > 0) {
    console.log('\n=== Missing R2 thumbnails (first 10) ===');
    for (const m of missingChapters.slice(0, 10)) {
      console.log('  Ch', m.number, '→', m.key);
    }
  }

  // Now check: how many images does each chapter have in R2?
  const { ListObjectsV2Command } = await import('@aws-sdk/client-s3');
  console.log('\n=== Chapter R2 Image Count (first 10 non-null chapters) ===');

  const chaptersWithThumb = chapters.filter(c => c.thumbnail_url).slice(0, 10);
  for (const ch of chaptersWithThumb) {
    const prefix = `chapters/${ch.id}/`;
    try {
      const listCmd = new ListObjectsV2Command({ Bucket: env.R2_BUCKET, Prefix: prefix });
      const listRes = await s3.send(listCmd);
      const imageCount = (listRes.Contents || []).length;
      console.log(`  Ch ${ch.number}: ${imageCount} images in R2`);
    } catch(e) {
      console.log(`  Ch ${ch.number}: ERROR listing - ${e.message}`);
    }
  }
}

main().catch(console.error);