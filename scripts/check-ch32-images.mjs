import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: manga } = await supabase
  .from('manga')
  .select('id, title')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

// Check chapter_images for chapters 32, 35, 50, 70 (the broken ones)
const { data: chapters } = await supabase
  .from('chapters')
  .select('id, number')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .in('number', [32, 35, 50, 70])
  .order('number', { ascending: true });

console.log('=== CHAPTER_IMAGES for broken chapters ===\n');

for (const ch of chapters ?? []) {
  const { data: imgs } = await supabase
    .from('chapter_images')
    .select('image_url, number')
    .eq('chapter_id', ch.id)
    .order('number', { ascending: true })
    .limit(5);
  
  console.log(`Ch.${ch.number}:`);
  if (imgs && imgs.length > 0) {
    for (const img of imgs) {
      console.log(`  [${img.number}]: ${img.image_url.substring(0, 100)}`);
    }
  } else {
    console.log('  NO IMAGES');
  }
  console.log();
}

// Check: are ANY chapter_images for ch 32+ on R2?
console.log('=== Checking if any ch32+ images are on R2 ===\n');

const { data: ch32plus } = await supabase
  .from('chapters')
  .select('id, number')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .gte('number', 32)
  .order('number', { ascending: true });

let r2Count = 0;
let gmbrCount = 0;
let otherCount = 0;

for (const ch of ch32plus ?? []) {
  const { data: imgs } = await supabase
    .from('chapter_images')
    .select('image_url')
    .eq('chapter_id', ch.id)
    .limit(1);
  
  if (imgs && imgs.length > 0) {
    const url = imgs[0].image_url;
    if (url.includes('r2.dev') || url.includes('olluq.xyz')) r2Count++;
    else if (url.includes('gmbr.pro')) gmbrCount++;
    else otherCount++;
  }
}

console.log(`Chapters 32-${ch32plus?.[ch32plus.length-1]?.number}:`);
console.log(`  R2/CDN:  ${r2Count}`);
console.log(`  gmbr.pro: ${gmbrCount}`);
console.log(`  Other:   ${otherCount}`);