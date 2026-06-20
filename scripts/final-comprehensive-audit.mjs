import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('═══════════════════════════════════════════════════════');
console.log('  COMPREHENSIVE AUDIT: All Chapters with Thumbnails');
console.log('═══════════════════════════════════════════════════════\n');

// Fetch ALL chapters with thumbnails using proper pagination
console.log('🔍 Fetching all chapters with thumbnails...\n');
const allChapters = [];
let off = 0;
while (true) {
  const { data, error } = await sb.from('chapters')
    .select('id, number, thumbnail_url, manga_id')
    .is('deleted_at', null)
    .not('thumbnail_url', 'is', null)
    .order('id')
    .range(off, off + 999);
  if (error) { console.error('Error:', error.message); break; }
  if (!data || data.length === 0) break;
  allChapters.push(...data);
  process.stdout.write(`\r  Fetched ${allChapters.length.toLocaleString()} chapters...`);
  if (data.length < 1000) break;
  off += 1000;
}
console.log(`\n  Done: ${allChapters.length.toLocaleString()} chapters with thumbnails\n`);

// Fetch manga titles
const mangaMap = new Map();
off = 0;
while (true) {
  const { data, error } = await sb.from('manga')
    .select('id, title, slug')
    .is('deleted_at', null)
    .range(off, off + 999);
  if (error || !data || data.length === 0) break;
  for (const m of data) mangaMap.set(m.id, m);
  if (data.length < 1000) break;
  off += 1000;
}

// Fetch image counts per chapter (ALL records, paginated properly)
console.log('🔍 Counting images per chapter (544K+ records)...\n');
const imgCountMap = new Map();
off = 0;
while (true) {
  const { data, error } = await sb.from('chapter_images')
    .select('chapter_id')
    .order('id')
    .range(off, off + 9999);
  if (error || !data || data.length === 0) break;
  for (const ci of data) {
    imgCountMap.set(ci.chapter_id, (imgCountMap.get(ci.chapter_id) || 0) + 1);
  }
  process.stdout.write(`\r  Processed ${(off + data.length).toLocaleString()} image records...`);
  if (data.length < 10000) break;
  off += 10000;
}
console.log(`\n  Done: ${imgCountMap.size.toLocaleString()} chapters have images\n`);

// Analyze each chapter
console.log('🔍 Analyzing all thumbnails...\n');
let correct5th = 0, correct005 = 0, correctLast = 0, wrong = 0, noImages = 0;
const issues = [];

for (const ch of allChapters) {
  const imgCount = imgCountMap.get(ch.id) || 0;
  const manga = mangaMap.get(ch.manga_id);
  const thumbFile = ch.thumbnail_url.split('/').pop() || '';

  if (imgCount === 0) {
    noImages++;
    continue;
  }

  // Check patterns
  const is5th = /^5\.(jpg|jpeg|png|webp)$/i.test(thumbFile);
  const is005 = /^005\.(jpg|jpeg|png|webp)$/i.test(thumbFile);

  if (imgCount >= 5) {
    if (is5th || is005) {
      if (is5th) correct5th++;
      else correct005++;
    } else {
      wrong++;
      if (issues.length < 200) issues.push({
        manga: manga?.title || '?',
        slug: manga?.slug || '?',
        chapter: ch.number,
        chapterId: ch.id,
        imageCount: imgCount,
        current: thumbFile,
        thumbUrl: ch.thumbnail_url,
      });
    }
  } else {
    correctLast++;
  }
}

// Results
const totalWithThumbs = allChapters.length;
const totalCorrect = correct5th + correct005 + correctLast;
const pct = totalWithThumbs > 0 ? ((totalCorrect / totalWithThumbs) * 100).toFixed(2) : 0;

console.log('═══════════════════════════════════════════════════════');
console.log('  FINAL AUDIT RESULTS');
console.log('═══════════════════════════════════════════════════════\n');
console.log(`✅ Correct "5.xxx" (5th image):      ${correct5th.toLocaleString()}`);
console.log(`✅ Correct "005.xxx" (5th, padded):  ${correct005.toLocaleString()}`);
console.log(`✅ Correct (last, <5 images):        ${correctLast.toLocaleString()}`);
console.log(`⚠️  Wrong thumbnail:                 ${wrong.toLocaleString()}`);
console.log(`📭 No images in chapter_images:      ${noImages.toLocaleString()}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   Total chapters with thumbnails:    ${totalWithThumbs.toLocaleString()}`);
console.log(`\n✨ Accuracy: ${pct}% (${totalCorrect.toLocaleString()}/${totalWithThumbs.toLocaleString()})\n`);

if (issues.length > 0) {
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  ⚠️ WRONG THUMBNAILS: ${wrong} chapters`);
  console.log(`═══════════════════════════════════════════════════════\n`);
  issues.forEach(i => {
    console.log(`  ${i.manga} | Ch ${i.chapter} | imgs:${i.imageCount}`);
    console.log(`    current: ${i.current}`);
    console.log(`    slug: ${i.slug}`);
  });
} else {
  console.log('✅ ALL THUMBNAILS CORRECT! No issues found.\n');
}

writeFileSync('docs/AUDIT_FINAL_REPORT.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  results: { correct5th, correct005, correctLast, wrong, noImages, total: totalWithThumbs, pct },
  issues,
}, null, 2));
console.log('📁 Report saved to docs/AUDIT_FINAL_REPORT.json');
console.log('═══════════════════════════════════════════════════════\n');
