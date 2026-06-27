#!/usr/bin/env node
/**
 * REAL audit: Check ALL chapters, including those with NULL thumbnail.
 * The previous audit script only checked chapters WHERE thumbnail_url IS NOT NULL.
 * This gave a false "100% correct" result by ignoring 1,398 metadata-only chapters.
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
};

console.log('🔍 REAL AUDIT: All chapters including NULL thumbnail\n');

const PAGE_SIZE = 1000;

// 1. Total active chapters (using count endpoint)
let res = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id&deleted_at=is.null&limit=1`, {
  headers: { ...headers, 'Prefer': 'count=exact' },
});
const totalRange = res.headers.get('content-range');
const totalChapters = parseInt(totalRange?.split('/')[1] || '0');
console.log(`📚 Total active chapters: ${totalChapters}`);

// 2. Chapters WITH thumbnail (not null) - paginated
console.log('   Fetching chapters WITH thumbnail...');
let withThumb = [];
let offset = 0;
while (true) {
  res = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id&deleted_at=is.null&thumbnail_url=not.is.null&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`, { headers });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) break;
  withThumb.push(...data);
  if (data.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}
console.log(`   WITH thumbnail: ${withThumb.length} (${totalChapters > 0 ? ((withThumb.length/totalChapters)*100).toFixed(1) : 0}%)`);

// 3. Chapters WITHOUT thumbnail (null) - paginated
console.log('   Fetching chapters WITHOUT thumbnail...');
let withoutThumb = [];
offset = 0;
while (true) {
  res = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id&deleted_at=is.null&thumbnail_url=is.null&order=id.asc&limit=${PAGE_SIZE}&offset=${offset}`, { headers });
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) break;
  withoutThumb.push(...data);
  if (data.length < PAGE_SIZE) break;
  offset += PAGE_SIZE;
}
console.log(`   WITHOUT thumbnail: ${withoutThumb.length} (${totalChapters > 0 ? ((withoutThumb.length/totalChapters)*100).toFixed(1) : 0}%)`);

// 4. Check how many NULL-thumbnail chapters have images
console.log('\n🔍 Checking if NULL-thumbnail chapters have images...');
const CONCURRENCY = 50;
let withImages = 0;
let withoutImages = 0;

for (let i = 0; i < withoutThumb.length; i += CONCURRENCY) {
  const batch = withoutThumb.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(async (ch) => {
    const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&limit=1`, { headers });
    const imgs = await imgRes.json();
    if (Array.isArray(imgs) && imgs.length > 0) {
      withImages++;
    } else {
      withoutImages++;
    }
  }));
  if ((i + CONCURRENCY) % 500 === 0 || i + CONCURRENCY >= withoutThumb.length) {
    console.log(`   Checked ${Math.min(i + CONCURRENCY, withoutThumb.length)}/${withoutThumb.length}...`);
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 REAL AUDIT RESULTS');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`Total active chapters      : ${totalChapters}`);
console.log(`Chapters WITH images+thumb : ${withThumb.length} ✅`);
console.log(`Chapters NULL thumb+images : ${withImages} ⚠️  (can fix)`);
console.log(`Chapters metadata-only     : ${withoutImages} ❌ (need download)`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`\n💡 The ${withoutImages} metadata-only chapters need their images`);
console.log(`   downloaded from source_url using the admin import tool.`);