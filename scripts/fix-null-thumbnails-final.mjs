#!/usr/bin/env node
/**
 * Fix chapters with NULL thumbnail_url.
 * 
 * The previous batch-fix-thumbnails-5th.mjs only checked chapters that
 * ALREADY had a thumbnail (thumbnail_url=not.is.null). This left chapters
 * with NULL thumbnails completely unfixed.
 * 
 * This script finds all chapters with NULL thumbnail and sets them to:
 *   - >=5 images → 5th from LAST (urls[urls.length - 5])
 *   - <5 images → first image (urls[0])
 *   - 0 images → skip (can't set thumbnail)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
};

const CONCURRENCY = 50;

// Step 1: Fetch ALL chapters with NULL thumbnail
console.log('📥 Fetching chapters with NULL thumbnail...');
let nullThumbChapters = [];
let offset = 0;
const PAGE = 1000;
while (true) {
  const res = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,manga_id,thumbnail_url&deleted_at=is.null&thumbnail_url=is.null&order=id.asc&limit=${PAGE}&offset=${offset}`, { headers });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) break;
  nullThumbChapters.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`   Found ${nullThumbChapters.length} chapters with NULL thumbnail\n`);

if (nullThumbChapters.length === 0) {
  console.log('🎉 No chapters with NULL thumbnail found!');
  process.exit(0);
}

// Step 2: For each, fetch its images and determine correct thumbnail
console.log('🔍 Fetching images for each chapter...');
let needUpdate = [];
let processed = 0;
const startTime = Date.now();

for (let i = 0; i < nullThumbChapters.length; i += CONCURRENCY) {
  const batch = nullThumbChapters.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (ch) => {
    const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
    const imgs = await imgRes.json();
    const urls = (Array.isArray(imgs) ? imgs : []).map(x => x.image_url).filter(Boolean);
    if (urls.length === 0) return; // skip, no images

    const expected = urls.length >= 5 ? urls[urls.length - 5] : urls[0];
    needUpdate.push({ id: ch.id, number: ch.number, newUrl: expected, imgCount: urls.length });
  }));
  processed = Math.min(i + CONCURRENCY, nullThumbChapters.length);
  if (processed % 500 === 0 || processed === nullThumbChapters.length) {
    console.log(`   Checked ${processed}/${nullThumbChapters.length}... (${needUpdate.length} can be fixed)`);
  }
}

console.log(`\n📊 ${needUpdate.length} chapters can be fixed (have images but no thumbnail).`);
console.log(`   ${nullThumbChapters.length - needUpdate.length} chapters have no images at all.\n`);

if (needUpdate.length === 0) {
  console.log('⚠️  No chapters can be fixed (all have 0 images).');
  process.exit(0);
}

// Show sample
console.log('📋 Sample of chapters to fix:');
for (const ch of needUpdate.slice(0, 10)) {
  console.log(`   • Ch ${ch.number} (${ch.id.substring(0, 8)}...) — ${ch.imgCount} images → thumb from image ${ch.imgCount >= 5 ? '#' + (ch.imgCount - 4) : '#1'}`);
}
console.log('');

// Step 3: Batch update
console.log(`🔧 Updating ${needUpdate.length} chapters (concurrency=${CONCURRENCY})...\n`);
let updated = 0;
let failed = 0;

for (let i = 0; i < needUpdate.length; i += CONCURRENCY) {
  const batch = needUpdate.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (ch) => {
    const patchRes = await fetch(`${supabaseUrl}/rest/v1/chapters?id=eq.${ch.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ thumbnail_url: ch.newUrl }),
    });
    if (patchRes.ok) {
      updated++;
    } else {
      failed++;
      const errText = await patchRes.text();
      console.error(`   ❌ Ch ${ch.number} (${ch.id}): ${errText.substring(0, 200)}`);
    }
  }));

  const done = Math.min(i + CONCURRENCY, needUpdate.length);
  if (done % 500 === 0 || done === needUpdate.length) {
    const pct = ((done / needUpdate.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`   Updated ${done}/${needUpdate.length} (${pct}%) [${elapsed}s elapsed]`);
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ NULL THUMBNAIL FIX COMPLETED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Updated : ${updated}`);
console.log(`  Failed  : ${failed}`);
console.log(`  Time    : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');