import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get Hana manga
const { data: manga } = await sb.from('manga')
  .select('id')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

// Get one chapter with gmbr.pro thumbnail
const { data: chapter } = await sb.from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .like('thumbnail_url', '%gmbr.pro%')
  .order('number', { ascending: false })
  .range(0, 0)
  .single();

console.log('Chapter:', chapter.number, chapter.thumbnail_url);

// Check chapter_images for this chapter
const { data: images, error } = await sb.from('chapter_images')
  .select('image_url, number')
  .eq('chapter_id', chapter.id)
  .order('number', { ascending: true })
  .limit(10);

console.log('\nChapter images error:', error?.message);
console.log('Chapter images count:', images?.length);
for (const img of images || []) {
  const status = img.image_url?.includes('gmbr.pro') ? 'GMBR' : img.image_url?.includes('r2.dev') || img.image_url?.includes('olluq') ? 'R2' : 'OTHER';
  console.log(`  Page ${img.number}: [${status}] ${(img.image_url || '').substring(0, 80)}`);
}

// The 5th image (number=5, index 4)
if (images && images.length >= 5) {
  console.log('\n5th image:', images[4].image_url);
} else {
  console.log('\nNot enough images, available:', images?.length);
}

// Count chapters with gmbr.pro thumbnails that HAVE R2 images
const { data: gmbrChapters } = await sb.from('chapters')
  .select('id, number')
  .eq('manga_id', manga.id)
  .like('thumbnail_url', '%gmbr.pro%');

console.log(`\nChecking ${gmbrChapters?.length || 0} gmbr chapters...`);
let hasR2Images = 0;
let hasGmbrImages = 0;
let noImages = 0;

for (const ch of gmbrChapters || []) {
  const { data: imgs } = await sb.from('chapter_images')
    .select('image_url')
    .eq('chapter_id', ch.id)
    .order('number', { ascending: true })
    .range(4, 4); // 5th image

  if (!imgs || imgs.length === 0) {
    noImages++;
  } else if (imgs[0].image_url?.includes('r2.dev') || imgs[0].image_url?.includes('olluq')) {
    hasR2Images++;
  } else {
    hasGmbrImages++;
  }
}

console.log(`\n=== SUMMARY ===`);
console.log('Have R2 5th image:', hasR2Images);
console.log('Have gmbr 5th image:', hasGmbrImages);
console.log('No images at all:', noImages);