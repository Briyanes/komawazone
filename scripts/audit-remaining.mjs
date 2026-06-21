import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== AUDIT SISA IMAGE NON-R2 ===\n');

// Get ALL chapter_images
let allImages = [];
let offset = 0;
while (true) {
  const { data } = await sb.from('chapter_images')
    .select('id, image_url, chapter:chapters(id, number, manga:manga(slug, title))')
    .range(offset, offset + 999);
  if (!data || data.length === 0) break;
  allImages.push(...data);
  offset += 1000;
  if (offset % 5000 === 0) process.stdout.write('.');
}
console.log(`Total chapter_images di DB: ${allImages.length}`);

let r2Count = 0, nonR2Count = 0, nullCount = 0;
const nonR2ByDomain = {};
const nonR2Chapters = new Map(); // chId -> info

for (const img of allImages) {
  if (!img.image_url) { nullCount++; continue; }
  const url = img.image_url;
  if (url.startsWith('/api/r2/') || url.includes('r2.dev') || url.includes('r2.cloudflarestorage')) {
    r2Count++;
  } else {
    nonR2Count++;
    // Track domain
    try {
      const domain = new URL(url).hostname;
      nonR2ByDomain[domain] = (nonR2ByDomain[domain] || 0) + 1;
    } catch { nonR2ByDomain['unknown'] = (nonR2ByDomain['unknown'] || 0) + 1; }
    // Track chapter
    const chId = img.chapter?.id;
    if (chId && !nonR2Chapters.has(chId)) {
      nonR2Chapters.set(chId, {
        title: img.chapter?.manga?.title || '?',
        chNum: img.chapter?.number || '?',
        count: 0
      });
    }
    if (chId) nonR2Chapters.get(chId).count++;
  }
}

const nonR2MangaSet = new Set();
for (const [, info] of nonR2Chapters) nonR2MangaSet.add(info.title);

console.log(`\n📊 HASIL AUDIT CHAPTER IMAGES:`);
console.log(`  ✅ Sudah R2: ${r2Count}`);
console.log(`  ⚠️  Masih non-R2: ${nonR2Count}`);
console.log(`  ❌ Null: ${nullCount}`);
console.log(`  📚 Manga terdampak: ${nonR2MangaSet.size}`);
console.log(`  📖 Chapter terdampak: ${nonR2Chapters.size}`);

console.log(`\n📋 Breakdown by domain:`);
for (const [domain, count] of Object.entries(nonR2ByDomain).sort((a,b) => b[1]-a[1])) {
  console.log(`  ${domain}: ${count} images`);
}

// Sample chapters
console.log(`\n📋 Sample 15 chapter non-R2:`);
const sorted = [...nonR2Chapters.entries()].sort((a,b) => b[1].count - a[1].count);
for (const [chId, info] of sorted.slice(0, 15)) {
  console.log(`  - ${info.title} Ch${info.chNum}: ${info.count} imgs (${chId.slice(0,8)})`);
}

// Check manga covers
const { data: allManga } = await sb.from('manga').select('id, title, cover_url').eq('status', 'published');
let r2Covers = 0, nonR2Covers = 0, nullCovers = 0;
const nonR2CoverManga = [];
for (const m of (allManga || [])) {
  if (!m.cover_url) { nullCovers++; continue; }
  if (m.cover_url.startsWith('/api/r2/') || m.cover_url.includes('r2.dev')) r2Covers++;
  else { nonR2Covers++; nonR2CoverManga.push(m.title); }
}
console.log(`\n📊 HASIL AUDIT COVER MANGA:`);
console.log(`  ✅ Cover R2: ${r2Covers}`);
console.log(`  ⚠️  Cover non-R2: ${nonR2Covers}`);
console.log(`  ❌ Cover null: ${nullCovers}`);

if (nonR2CoverManga.length > 0) {
  console.log(`\n📋 Manga dengan cover non-R2 (max 20):`);
  for (const t of nonR2CoverManga.slice(0, 20)) console.log(`  - ${t}`);
}

console.log(`\n${'═'.repeat(50)}`);
console.log(`SISA PEKERJAAN:`);
console.log(`  ${nonR2Count} images perlu fix`);
console.log(`  ${nonR2Chapters.size} chapters terdampak`);
console.log(`  ${nonR2MangaSet.size} manga terdampak`);
console.log(`  ${nonR2Covers} manga cover perlu fix`);
