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

const { data: manga } = await sb.from('manga').select('id').ilike('slug', 'from-weakling-to-nemesis').single();

// Get chapter 45
const { data: ch } = await sb.from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .eq('number', 45)
  .single();

console.log('Ch 45 ID:', ch.id);
console.log('Ch 45 Thumbnail:', ch.thumbnail_url);

// Get images
const { data: images } = await sb.from('chapter_images')
  .select('number, image_url')
  .eq('chapter_id', ch.id)
  .order('number', { ascending: true });

console.log('Total images:', images.length);
console.log('Image #5:', images[4]?.image_url ?? 'N/A');
console.log('Current thumb:', ch.thumbnail_url);
console.log('Match?', images[4]?.image_url === ch.thumbnail_url ? '✅' : '❌ NEEDS FIX');

// Show first 5
console.log('\nFirst 5 images:');
for (let i = 0; i < 5; i++) {
  console.log(`  ${i + 1}. ${images[i]?.image_url?.split('/').pop()}`);
}
