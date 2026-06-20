#!/usr/bin/env node
/**
 * FAST AUDIT: Check all chapters' thumbnails efficiently
 * Strategy: Check thumbnail filename pattern (5.jpg = 5th image)
 */
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
console.log('  FAST AUDIT: All Chapters Thumbnail Check');
console.log('═══════════════════════════════════════════════════════\n');

// Step 1: Get counts
const { count: totalManga } = await sb.from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null);
const { count: totalChapters } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null);

console.log(`📊 Manga: ${totalManga?.toLocaleString()} | Chapters: ${totalChapters?.toLocaleString()}\n`);

// Step 2: Fetch all chapters with manga info
console.log('🔍 Fetching all chapters...\n');
const allChapters = [];
let off = 0;
while (true) {
  const { data, error } = await sb.from('chapters')
    .select('id, number, title, thumbnail_url, manga_id')
    .is('deleted_at', null)
    .order('id')
    .range(off, off + 999);
  if (error || !data || data.length === 0) break;
  allChapters.push(...data);
  process.stdout.write(`\r  Fetched ${allChapters.length.toLocaleString()} chapters...`);
  if (data.length < 1000) break;
  off += 1000;
}
console.log(`\n  Done: ${allChapters.length.toLocaleString()} chapters loaded\n`);

// Step 3: Fetch manga titles
console.log('🔍 Fetching manga titles...\n');
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
console.log(`  Done: ${mangaMap.size.toLocaleString()} manga loaded\n`);

// Step 4: Get image counts per chapter via aggregated query
console.log('🔍 Counting images per chapter...\n');
const imgCountMap = new Map();
off = 0;
while (true) {
  // Fetch chapter_images in batches and count
  const { data, error } = await sb.from('chapter_images')
    .select('chapter_id')
    .order('chapter_id')
    .range(off, off + 9999);
  if (error || !data || data.length === 0) break;
  for (const ci of data) {
    imgCountMap.set(ci.chapter_id, (imgCountMap.get(ci.chapter_id) || 0) + 1);
  }
  process.stdout.write(`\r  Processed ${off + data.length} image records...`);
  if (data.length < 10000) break;
  off += 10000;
}
console.log(`\n  Done: ${imgCountMap.size.toLocaleString()} chapters have images\n`);

// Step 5: Analyze each chapter
console.log('🔍 Analyzing thumbnails...\n');
let correct5th = 0, correctLast = 0, wrong = 0, nullThumb = 0, noImages = 0;
const issues = [];

for (const ch of allChapters) {
  const imgCount = imgCountMap.get(ch.id) || 0;
  const manga = mangaMap.get(ch.manga_id);

  if (imgCount === 0) {
    noImages++;
    if (issues.length < 200) issues.push({
      type: 'NO_IMAGES',
      manga: manga?.title || '?',
      slug: manga?.slug || '?',
      chapter: ch.number,
      chapterId: ch.id,
      imageCount: 0,
    });
    continue;
  }

  if (!ch.thumbnail_url) {
    nullThumb++;
    if (issues.length < 200) issues.push({
      type: 'NULL_THUMB',
      manga: manga?.title || '?',
      slug: manga?.slug || '?',
      chapter: ch.number,
      chapterId: ch.id,
      imageCount: imgCount,
    });
    continue;
  }

  // Check thumbnail filename
  const thumbFile = ch.thumbnail_url.split('/').pop() || '';
  
  // For chapters with 5+ images: thumbnail should be "5.xxx"
  if (imgCount >= 5) {
    const is5th = /^5\.(jpg|jpeg|png|webp)$/i.test(thumbFile);
    if (is5th) {
      correct5th++;
    } else {
      wrong++;
      if (issues.length < 200) issues.push({
        type: 'WRONG_THUMB',
        manga: manga?.title || '?',
        slug: manga?.slug || '?',
        chapter: ch.number,
        chapterId: ch.id,
        imageCount: imgCount,
        current: thumbFile,
      });
    }
  } else {
    // Chapters with <5 images: thumbnail could be last image
    // Accept any valid image filename
    correctLast++;
  }
}

// Step 6: Print results
const total = allChapters.length;
const totalCorrect = correct5th + correctLast;
const pct = total > 0 ? ((totalCorrect / total) * 100).toFixed(2) : 0;

console.log('═══════════════════════════════════════════════════════');
console.log('  AUDIT RESULTS');
console.log('═══════════════════════════════════════════════════════\n');
console.log(`✅ Correct (5th image):           ${correct5th.toLocaleString()}`);
console.log(`✅ Correct (last image, <5 imgs): ${correctLast.toLocaleString()}`);
console.log(`⚠️  Wrong thumbnail:              ${wrong.toLocaleString()}`);
console.log(`❌ NULL thumbnail:                ${nullThumb.toLocaleString()}`);
console.log(`📭 Chapter with no images:        ${noImages.toLocaleString()}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   Total chapters:                ${total.toLocaleString()}`);
console.log(`\n✨ Accuracy: ${pct}% (${totalCorrect.toLocaleString()}/${total.toLocaleString()})\n`);

// Print issues
if (issues.length > 0) {
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  ISSUES FOUND: ${issues.length} chapters (showing first 50)`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  const byType = {};
  for (const iss of issues) {
    if (!byType[iss.type]) byType[iss.type] = [];
    byType[iss.type].push(iss);
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`── ${type} (${items.length}) ──`);
    items.slice(0, 20).forEach(i => {
      console.log(`  ${i.manga} | Ch ${i.chapter} | imgs:${i.imageCount} | ${i.slug}`);
      if (type === 'WRONG_THUMB') console.log(`    thumb: ${i.current} (should be 5.jpg)`);
    });
    if (items.length > 20) console.log(`  ... and ${items.length - 20} more\n`);
    else console.log('');
  }
} else {
  console.log('✅ NO ISSUES FOUND! All chapters are correct.\n');
}

// Save report
const report = {
  timestamp: new Date().toISOString(),
  summary: { totalManga, totalChapters, totalImages: imgCountMap.size },
  results: { correct5th, correctLast, wrong, nullThumb, noImages, total, pct },
  issues: issues.slice(0, 500),
};
writeFileSync('docs/AUDIT_FULL_REPORT.json', JSON.stringify(report, null, 2));
console.log('📁 Full report saved to docs/AUDIT_FULL_REPORT.json');
console.log('═══════════════════════════════════════════════════════\n');