import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Check the manga
const { data: manga } = await supabase
  .from('manga')
  .select('id, slug, title, deleted_at')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

console.log('Manga:', manga);

// Try without any filter
const { data: allChapters, error: err1 } = await supabase
  .from('chapters')
  .select('id, number, manga_id, deleted_at')
  .eq('manga_id', manga.id);

console.log(`\nAll chapters (no filter): ${allChapters?.length ?? 0}`);
if (err1) console.log('Error:', err1);

if (allChapters && allChapters.length > 0) {
  console.log('Sample:', allChapters.slice(0, 3));
  const deletedCount = allChapters.filter(c => c.deleted_at !== null).length;
  console.log(`Deleted: ${deletedCount}, Active: ${allChapters.length - deletedCount}`);
}

// Try with deleted_at filter
const { data: activeChapters } = await supabase
  .from('chapters')
  .select('id, number')
  .eq('manga_id', manga.id)
  .is('deleted_at', null);

console.log(`\nActive chapters (deleted_at IS NULL): ${activeChapters?.length ?? 0}`);

// Check if there's a different slug pattern
const { data: similarManga } = await supabase
  .from('manga')
  .select('id, slug, title, deleted_at')
  .ilike('slug', '%hana%');

console.log(`\nSimilar manga (ilike %hana%): ${similarManga?.length ?? 0}`);
if (similarManga) {
  for (const m of similarManga) {
    const { count } = await supabase
      .from('chapters')
      .select('id', { count: 'exact', head: true })
      .eq('manga_id', m.id);
    console.log(`  ${m.slug} — ${count} chapters — deleted: ${m.deleted_at ? 'YES' : 'no'}`);
  }
}