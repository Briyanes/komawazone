import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Get sample rows to see column names
console.log('=== Sample chapter_images ===');
const { data: sample } = await sb.from('chapter_images').select('*').limit(3);
if (sample && sample[0]) {
  console.log('Columns:', Object.keys(sample[0]));
  console.log('Sample URL:', sample[0].image_url || sample[0].url || JSON.stringify(sample[0]).substring(0, 200));
}

// Count with or filter
const urlCol = sample?.[0]?.image_url ? 'image_url' : 'url';
console.log('\nUsing column:', urlCol);

// Use ilike and check
const { count: totalImgs } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });
console.log('Total images:', totalImgs);

// Check for various dead CDN patterns
for (const pattern of ['%gmbr.pro%', '%gmbr%', '%cdn.gmbr%', '%manhwaland%', '%riz-/', '%ouw%' ]) {
  const { count, error } = await sb.from('chapter_images').select('*', { count: 'exact', head: true }).ilike(urlCol, pattern);
  console.log(`  ${pattern}: ${count}${error ? ' ERROR: ' + error.message : ''}`);
}

// Check for R2/healthy URLs
for (const pattern of ['%r2.dev%', '%olluq.xyz%', '%cloudflare%']) {
  const { count } = await sb.from('chapter_images').select('*', { count: 'exact', head: true }).ilike(urlCol, pattern);
  console.log(`  ${pattern}: ${count}`);
}

// Manga covers
console.log('\n=== Manga covers ===');
const { data: mangaSample } = await sb.from('manga').select('cover_image').limit(2);
console.log('Cover sample:', mangaSample?.[0]?.cover_image?.substring(0, 80));

const { count: totalManga } = await sb.from('manga').select('*', { count: 'exact', head: true });
console.log('Total manga:', totalManga);
for (const pattern of ['%gmbr.pro%', '%gmbr%', '%r2.dev%', '%olluq%']) {
  const { count } = await sb.from('manga').select('*', { count: 'exact', head: true }).ilike('cover_image', pattern);
  console.log(`  cover ${pattern}: ${count}`);
}
