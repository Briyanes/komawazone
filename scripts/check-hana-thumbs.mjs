import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: manga } = await supabase
  .from('manga')
  .select('id, slug, title')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

if (!manga) {
  console.log('Manga not found');
  process.exit(1);
}

console.log(`Manga: ${manga.title} (${manga.id})\n`);

const { data: chapters } = await supabase
  .from('chapters')
  .select('id, number, title, thumbnail_url, images')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .order('number', { ascending: true });

console.log(`Total chapters: ${chapters?.length ?? 0}\n`);
console.log('Chapter | Thumbnail URL | Image count | Issue');
console.log('─'.repeat(120));

let issues = 0;
for (const ch of chapters ?? []) {
  const imgCount = ch.images?.length ?? 0;
  let issue = '';

  if (!ch.thumbnail_url || ch.thumbnail_url === 'null') {
    issue = '⚠️  NULL thumbnail';
    issues++;
  } else if (ch.thumbnail_url.includes('gmbr.pro')) {
    issue = '❌ DEAD DOMAIN (gmbr.pro)';
    issues++;
  } else if (ch.thumbnail_url.includes('undefined')) {
    issue = '❌ UNDEFINED in URL';
    issues++;
  }

  const thumb = (ch.thumbnail_url || 'NULL').substring(0, 70);
  console.log(`Ch.${String(ch.number).padEnd(5)} | ${thumb.padEnd(70)} | ${String(imgCount).padEnd(3)} img | ${issue}`);
}

console.log('\n' + '═'.repeat(120));
console.log(`Issues found: ${issues}/${chapters?.length ?? 0}`);