#!/usr/bin/env node
/**
 * Final global verification: check ALL chapters with thumbnails
 * that thumbnail_url matches 5th image FROM LAST (or first if <5 images)
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
};

// Get ALL chapters with thumbnails (paginated)
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

console.log(`\n📋 Total chapters with thumbnails: ${allChapters.length}\n`);

let correct = 0;
let wrong = [];
let checked = 0;
const BATCH = 50;

for (let i = 0; i < allChapters.length; i += BATCH) {
  const batch = allChapters.slice(i, i + BATCH);
  
  await Promise.all(batch.map(async (ch) => {
    const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
    const imgs = await imgRes.json();
    const urls = (Array.isArray(imgs) ? imgs : []).map(x => x.image_url).filter(Boolean);
    
    if (urls.length === 0) return; // no images, skip
    
    // 5th image FROM LAST, fallback to FIRST image
    const expected = urls.length >= 5 ? urls[urls.length - 5] : urls[0];
    checked++;
    
    if (ch.thumbnail_url === expected) {
      correct++;
    } else {
      wrong.push({
        chapter: ch.number,
        mangaId: ch.manga_id,
        current: ch.thumbnail_url?.split('/').pop(),
        expected: expected?.split('/').pop(),
        imgCount: urls.length,
      });
    }
  }));
  
  if ((i + BATCH) % 5000 === 0 || i + BATCH >= allChapters.length) {
    console.log(`  Checked ${Math.min(i + BATCH, allChapters.length)}/${allChapters.length}...`);
  }
}

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📊 FINAL VERIFICATION RESULT');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Checked         : ${checked}`);
console.log(`  ✅ Correct (5th) : ${correct} (${((correct/checked)*100).toFixed(1)}%)`);
console.log(`  ❌ Wrong         : ${wrong.length}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

if (wrong.length > 0) {
  console.log(`\n⚠️  Still wrong (first 20):`);
  for (const w of wrong.slice(0, 20)) {
    console.log(`  Ch ${w.chapter} (${w.mangaId.substring(0,8)}): ${w.imgCount} imgs | now=${w.current} | should=${w.expected}`);
  }
  if (wrong.length > 20) console.log(`  ... and ${wrong.length - 20} more`);
} else {
  console.log('\n🎉 ALL thumbnails are correct!');
}