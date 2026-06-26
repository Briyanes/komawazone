#!/usr/bin/env node
/**
 * Batch fix chapter thumbnails to 5th image FROM LAST via REST API.
 * Uses concurrency of 50 parallel requests to avoid server timeouts.
 * Processes only chapters that actually need updating.
 *
 * Logic:
 *   - >=5 images → 5th from LAST (urls[urls.length - 5])
 *   - <5 images → first image (urls[0])
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

// Step 1: Fetch ALL chapters with thumbnails
console.log('📥 Fetching all chapters...');
let allChapters = [];
let offset = 0;
const PAGE = 1000;
while (true) {
  const res = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,manga_id,thumbnail_url&deleted_at=is.null&thumbnail_url=not.is.null&order=id.asc&limit=${PAGE}&offset=${offset}`, { headers });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) break;
  allChapters.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`   Found ${allChapters.length} chapters with thumbnails\n`);

// Step 2: Determine which need updating
console.log('🔍 Checking which chapters need updating...');
let needUpdate = [];
let processed = 0;
const startTime = Date.now();

for (let i = 0; i < allChapters.length; i += CONCURRENCY) {
  const batch = allChapters.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (ch) => {
    const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
    const imgs = await imgRes.json();
    const urls = (Array.isArray(imgs) ? imgs : []).map(x => x.image_url).filter(Boolean);
    if (urls.length === 0) return;

    const expected = urls.length >= 5 ? urls[urls.length - 5] : urls[0];
    if (ch.thumbnail_url !== expected) {
      needUpdate.push({ id: ch.id, number: ch.number, newUrl: expected });
    }
  }));
  processed = Math.min(i + CONCURRENCY, allChapters.length);
  if (processed % 5000 === 0 || processed === allChapters.length) {
    console.log(`   Checked ${processed}/${allChapters.length}... (${needUpdate.length} need update)`);
  }
}

console.log(`\n📊 ${needUpdate.length} chapters need updating.\n`);

if (needUpdate.length === 0) {
  console.log('🎉 All thumbnails are already correct!');
  process.exit(0);
}

// Step 3: Batch update with concurrency
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
  if (done % 1000 === 0 || done === needUpdate.length) {
    const pct = ((done / needUpdate.length) * 100).toFixed(1);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`   Updated ${done}/${needUpdate.length} (${pct}%) [${elapsed}s elapsed]`);
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ BATCH FIX COMPLETED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Updated : ${updated}`);
console.log(`  Failed  : ${failed}`);
console.log(`  Time    : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');