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

const { data: ch, error } = await supabase
  .from('chapters')
  .select('*')
  .eq('id', CHAPTER_ID)
  .single();

if (error) {
  console.log('Error:', error.message);
  process.exit(1);
}

console.log('=== Chapter Details ===');
console.log(JSON.stringify(ch, null, 2));

const { data: manga } = await supabase
  .from('manga')
  .select('slug, title, source_url')
  .eq('id', ch.manga_id)
  .single();

if (manga) {
  console.log('\n=== Manga ===');
  console.log('Title:', manga.title);
  console.log('Slug:', manga.slug);
  console.log('Source URL:', manga.source_url);
}
