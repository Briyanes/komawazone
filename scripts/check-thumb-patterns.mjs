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

// Get all chapters
const { data: chapters } = await supabase
  .from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .order('number', { ascending: true });

console.log('=== THUMBNAIL URL PATTERNS ===\n');

const patterns = {};
for (const ch of chapters ?? []) {
  const url = ch.thumbnail_url || 'NULL';
  let domain = 'NULL';
  if (url !== 'NULL') {
    try {
      const u = new URL(url);
      domain = u.hostname;
    } catch {
      domain = 'invalid';
    }
  }
  if (!patterns[domain]) patterns[domain] = [];
  patterns[domain].push(ch.number);
}

for (const [domain, chs] of Object.entries(patterns)) {
  console.log(`Domain: ${domain} (${chs.length} chapters)`);
  console.log(`  Chapters: ${chs.slice(0, 10).join(', ')}${chs.length > 10 ? '...' : ''}`);
  // Show a sample URL
  const sampleCh = chapters?.find(c => c.number === chs[0]);
  if (sampleCh?.thumbnail_url) {
    console.log(`  Sample: ${sampleCh.thumbnail_url.substring(0, 100)}`);
  }
  console.log();
}

// Also check: what do chapter_images URLs look like for a few chapters?
console.log('=== CHAPTER IMAGES URL PATTERNS (first 3 chapters) ===\n');

for (const ch of (chapters ?? []).slice(0, 3)) {
  const { data: imgs } = await supabase
    .from('chapter_images')
    .select('image_url')
    .eq('chapter_id', ch.id)
    .order('number', { ascending: true })
    .limit(2);
  
  console.log(`Ch.${ch.number}:`);
  if (imgs && imgs.length > 0) {
    console.log(`  Image 1: ${imgs[0].image_url.substring(0, 100)}`);
    if (imgs[1]) console.log(`  Image 2: ${imgs[1].image_url.substring(0, 100)}`);
  } else {
    console.log('  NO IMAGES');
  }
  console.log();
}