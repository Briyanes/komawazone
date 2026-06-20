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

// Get manga
const { data: manga } = await sb.from('manga').select('id, title').ilike('slug', 'from-weakling-to-nemesis').single();
console.log(`Manga: ${manga.title} (${manga.id})`);

// Get all chapters
const { data: chapters } = await sb.from('chapters')
  .select('id, number, title, thumbnail_url')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .order('number');

console.log(`Total chapters: ${chapters.length}\n`);

let correct = 0, wrong = 0, nullThumb = 0;
const issues = [];

for (const ch of chapters) {
  if (!ch.thumbnail_url) {
    nullThumb++;
    issues.push(`  ❌ Ch ${ch.number}: NULL thumbnail`);
    continue;
  }

  // Check if thumbnail ends with /5.jpg (the 5th image)
  const thumbFile = ch.thumbnail_url.split('/').pop();
  if (thumbFile === '5.jpg' || thumbFile === '5.png' || thumbFile === '5.webp') {
    correct++;
  } else {
    wrong++;
    issues.push(`  ⚠️  Ch ${ch.number}: thumbnail=${thumbFile} (expected 5.jpg)`);
  }
}

console.log(`✅ Correct (5th image): ${correct}`);
console.log(`⚠️  Wrong: ${wrong}`);
console.log(`❌ NULL: ${nullThumb}`);

if (issues.length > 0) {
  console.log('\n=== ISSUES ===');
  issues.forEach(i => console.log(i));
}
