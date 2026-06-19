import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1. Check manga source_url
const { data: manga } = await supabase
  .from('manga')
  .select('id, slug, title, source_url')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

console.log('=== MANGA SOURCE ===');
console.log(`Title: ${manga.title}`);
console.log(`Source URL: ${manga.source_url}`);
console.log();

// 2. Check all active manga_sources
const { data: sources } = await supabase
  .from('manga_sources')
  .select('*')
  .eq('is_active', true);

console.log('=== ACTIVE SITEMAP SOURCES ===');
for (const s of sources ?? []) {
  console.log(`\n${s.name} (${s.base_url})`);
  console.log(`  Type: ${s.type}, Rating: ${s.content_rating}`);
  console.log(`  Sitemaps: ${(s.sitemap_urls ?? []).length}`);
  for (const sm of (s.sitemap_urls ?? []).slice(0, 3)) {
    console.log(`    - ${sm}`);
  }
}
