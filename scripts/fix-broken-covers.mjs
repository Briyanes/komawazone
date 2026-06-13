#!/usr/bin/env node
/**
 * Fix Broken Covers — Re-download non-R2 covers to Cloudflare R2.
 *
 * These covers come from dead domains (gmbr.pro, kambingjantan.cc, etc.)
 * and need to be re-hosted on R2.
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-broken-covers.mjs
 *   node --env-file=.env.local scripts/fix-broken-covers.mjs --dry-run
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const DRY_RUN = process.argv.includes('--dry-run');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'komawazone';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || `https://pub-${R2_ACCOUNT_ID}.r2.dev`;

const R2_PATTERN = /^https:\/\/pub-[a-z0-9]+\.r2\.dev/i;

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

function sanitizeKey(text) {
  return (text || 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

async function downloadAndUpload(coverUrl, title) {
  const res = await fetch(coverUrl, {
    signal: AbortSignal.timeout(15_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MangaZoneBot/1.0)' },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || 'image/jpeg';
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(await res.arrayBuffer());

  if (buffer.length < 1000) throw new Error('Image too small (likely placeholder/404)');

  const key = `covers/${sanitizeKey(title)}.${ext}`;
  const publicUrl = `${R2_PUBLIC_URL}/${key}`;

  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));

  return publicUrl;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes\n' : '🔧 LIVE FIX — covers will be updated\n');

  const { data: mangaList, error } = await sb.from('manga')
    .select('id, title, slug, cover_url, source_url')
    .not('cover_url', 'is', null)
    .is('deleted_at', null)
    .order('title');

  if (error) {
    console.error('❌ Failed to fetch:', error.message);
    process.exit(1);
  }

  const brokenCovers = (mangaList || []).filter(m => !R2_PATTERN.test(m.cover_url));
  console.log(`📊 Found ${brokenCovers.length} manga with non-R2 covers\n`);

  if (brokenCovers.length === 0) {
    console.log('✅ All covers are already on R2!');
    return;
  }

  let fixed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < brokenCovers.length; i++) {
    const m = brokenCovers[i];
    process.stdout.write(`[${i + 1}/${brokenCovers.length}] ${m.title}... `);

    if (DRY_RUN) {
      console.log('SKIP (dry-run)');
      skipped++;
      continue;
    }

    try {
      const newUrl = await downloadAndUpload(m.cover_url, m.title);
      await sb.from('manga').update({ cover_url: newUrl }).eq('id', m.id);
      console.log('✅ Fixed');
      fixed++;
    } catch (err) {
      console.log(`❌ ${err.message}`);
      failed++;
    }

    if ((i + 1) % 10 === 0) {
      console.log(`  --- Progress: ${fixed} fixed, ${failed} failed, ${i + 1}/${brokenCovers.length} ---`);
    }
  }

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  DONE: ${fixed} fixed, ${failed} failed, ${skipped} skipped`);
  console.log(`═══════════════════════════════════════`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});