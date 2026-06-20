import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CHAPTER_ID = '02bf09d4-0298-4a39-a611-e7a0e85fbb7b';

// Check chapter_images table
const { data: images, error } = await supabase
  .from('chapter_images')
  .select('*')
  .eq('chapter_id', CHAPTER_ID)
  .order('order_index', { ascending: true });

console.log('=== chapter_images for chapter', CHAPTER_ID, '===');
if (error) {
  console.log('Error:', error.message);
} else {
  console.log('Count:', images ? images.length : 0);
  if (images && images.length > 0) {
    images.slice(0, 5).forEach((img, i) => console.log(`[${i}]`, JSON.stringify(img)));
  }
}

// Check total chapter count for this manga
const { data: manga } = await supabase
  .from('manga')
  .select('slug, title, source_url')
  .eq('id', 'b2083043-3ed7-4be4-b431-e77f7164c2d3')
  .single();

console.log('\n=== Manga ===');
console.log(JSON.stringify(manga, null, 2));

// Check all chapters for this manga
const { data: chapters } = await supabase
  .from('chapters')
  .select('id, number, title, thumbnail_url, created_at')
  .eq('manga_id', 'b2083043-3ed7-4be4-b431-e77f7164c2d3')
  .order('number', { ascending: true });

console.log('\n=== All Chapters ===');
if (chapters) {
  chapters.forEach(ch => {
    const hasThumb = ch.thumbnail_url ? '✅' : '❌';
    console.log(`Ch ${ch.number}: ${ch.title} ${hasThumb} (${ch.created_at})`);
  });
}

// Count chapters with images for this manga
if (chapters && chapters.length > 0) {
  const chIds = chapters.map(c => c.id);
  const { count } = await supabase
    .from('chapter_images')
    .select('*', { count: 'exact', head: true })
    .in('chapter_id', chIds);
  console.log(`\nTotal images for this manga: ${count || 0}`);
}
