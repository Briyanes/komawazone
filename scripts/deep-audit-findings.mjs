import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('═══════════════════════════════════════════════════');
console.log('  DEEP AUDIT: Investigating Findings');
console.log('═══════════════════════════════════════════════════\n');

// 1. Check: Why only 44 chapters have images in chapter_images?
console.log('📊 CHAPTER IMAGES TABLE STATUS:');
const { count: totalImgRecords } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });
console.log(`   Total image records in chapter_images: ${totalImgRecords?.toLocaleString()}`);
console.log('');

// 2. Check: How many chapters have images stored in R2 but not in chapter_images?
// Check chapter_images with different schema
console.log('📊 CHECKING CHAPTER IMAGES SCHEMA:');
const { data: sampleCh } = await sb.from('chapters')
  .select('id, number, thumbnail_url, total_pages, content_rating')
  .not('thumbnail_url', 'is', null)
  .is('deleted_at', null)
  .limit(3);
console.log('   Sample chapters with thumbnails:');
for (const ch of sampleCh || []) {
  console.log(`   Ch ${ch.id.slice(0,8)}: thumb=${ch.thumbnail_url?.slice(-30)} total_pages=${ch.total_pages}`);
}
console.log('');

// 3. Check chapters that have thumbnail_url but 0 images in chapter_images
console.log('📊 CHAPTERS WITH THUMBNAIL BUT NO chapter_images RECORDS:');
const { count: withThumb } = await sb.from('chapters')
  .select('*', { count: 'exact', head: true })
  .not('thumbnail_url', 'is', null)
  .is('deleted_at', null);
console.log(`   Chapters with thumbnail_url: ${withThumb?.toLocaleString()}`);
console.log('');

// 4. Investigate "WRONG_THUMB" chapters more carefully
// Many have "005.jpg" which IS the 5th image (zero-padded format)
console.log('🔍 INVESTIGATING "WRONG" THUMBNAILS:');
console.log('   (005.jpg = 5th image with zero-padding, NOT actually wrong)\n');

// Get chapters where thumbnail doesn't match /^5\./ pattern
const { data: notMatchingChs } = await sb.from('chapters')
  .select('id, number, thumbnail_url, manga_id')
  .is('deleted_at', null)
  .not('thumbnail_url', 'is', null);

let uuidThumbs = 0, zeroPad5Thumbs = 0, otherPattern = 0;
const uuidExamples = [];

for (const ch of notMatchingChs || []) {
  const fname = ch.thumbnail_url?.split('/').pop() || '';
  if (/^5\.(jpg|jpeg|png|webp)$/i.test(fname)) continue; // Standard 5th image
  
  if (/^005\.(jpg|jpeg|png|webp)$/i.test(fname)) {
    zeroPad5Thumbs++;
  } else if (/^\d{10,}-[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(fname)) {
    uuidThumbs++;
    if (uuidExamples.length < 10) uuidExamples.push({ ch: ch.id, fname });
  } else {
    otherPattern++;
  }
}

console.log(`   005.xxx (zero-padded 5th = CORRECT): ${zeroPad5Thumbs}`);
console.log(`   UUID-based filenames:                ${uuidThumbs}`);
console.log(`   Other patterns:                      ${otherPattern}`);

if (uuidExamples.length > 0) {
  console.log('\n   UUID examples (TRULY WRONG):');
  uuidExamples.forEach(e => console.log(`     ${e.ch.slice(0,8)}: ${e.fname.slice(0,50)}`));
}

console.log('\n═══════════════════════════════════════════════════');
