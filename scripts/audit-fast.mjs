import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log('=== AUDIT CEPAT (COUNT QUERIES) ===\n');

// 1. Total chapter_images
const { count: total } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });
console.log(`Total chapter_images: ${total}`);

// 2. R2 images (starts with /api/r2/)
const { count: r2Count } = await sb.from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .like('image_url', '/api/r2/%');
console.log(`✅ R2 images: ${r2Count}`);

// 3. Non-R2 images (NOT starting with /api/r2/)
const { count: nonR2 } = await sb.from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .not('image_url', 'like', '/api/r2/%');
console.log(`⚠️  Non-R2 images: ${nonR2}`);

// 4. gmbr.pro specifically
const { count: gmbrCount } = await sb.from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .like('image_url', '%gmbr.pro%');
console.log(`   - gmbr.pro images: ${gmbrCount}`);

// 5. Null images
const { count: nullCount } = await sb.from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .is('image_url', null);
console.log(`❌ Null: ${nullCount}`);

// 6. Get sample of non-R2 to see domains
console.log('\n📋 Sample 20 non-R2 images:');
const { data: samples } = await sb.from('chapter_images')
  .select('image_url, chapter:chapters(number, manga:manga(title))')
  .not('image_url', 'like', '/api/r2/%')
  .limit(20);
for (const s of (samples || [])) {
  const url = (s.image_url || '').substring(0, 70);
  console.log(`  ${s.chapter?.manga?.title || '?'} Ch${s.chapter?.number}: ${url}`);
}

// 7. Count unique chapters with non-R2
console.log('\n📊 Counting chapters with non-R2...');
let chCount = 0;
let off = 0;
const chIds = new Set();
while (true) {
  const { data } = await sb.from('chapter_images')
    .select('chapter:chapters(id)')
    .not('image_url', 'like', '/api/r2/%')
    .range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const d of data) { if (d.chapter?.id) chIds.add(d.chapter.id); }
  off += 1000;
}
console.log(`  📖 Chapters dengan non-R2: ${chIds.size}`);

// 8. Manga covers
const { count: totalManga } = await sb.from('manga').select('*', { count: 'exact', head: true }).eq('status', 'published');
const { count: r2Covers } = await sb.from('manga').select('*', { count: 'exact', head: true }).eq('status', 'published').like('cover_url', '/api/r2/%');
const { count: nonR2Covers } = await sb.from('manga').select('*', { count: 'exact', head: true }).eq('status', 'published').not('cover_url', 'like', '/api/r2/%');
const { count: nullCovers } = await sb.from('manga').select('*', { count: 'exact', head: true }).eq('status', 'published').is('cover_url', null);

console.log(`\n📊 COVER MANGA:`);
console.log(`  Total manga: ${totalManga}`);
console.log(`  ✅ R2: ${r2Covers}`);
console.log(`  ⚠️  Non-R2: ${nonR2Covers}`);
console.log(`  ❌ Null: ${nullCovers}`);

console.log(`\n${'═'.repeat(50)}`);
console.log(`SISA PEKERJAAN:`);
console.log(`  ${nonR2} chapter images perlu fix`);
console.log(`  ${chIds.size} chapters terdampak`);
console.log(`  ${nonR2Covers} manga cover perlu fix`);
