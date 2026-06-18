import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: manga } = await sb.from('manga')
  .select('id, slug, title, cover_url')
  .eq('slug', 'hanas-demons-of-lust')
  .single();

const { data: chapters } = await sb.from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .order('number', { ascending: false })
  .limit(15);

console.log('=== HANA CHAPTERS (latest 15) ===');
let nullCount = 0, gmbrCount = 0, okCount = 0;
for (const c of chapters || []) {
  const status = !c.thumbnail_url ? 'NULL' : c.thumbnail_url.includes('gmbr.pro') ? 'GMBR' : 'OK';
  if (status === 'NULL') nullCount++;
  else if (status === 'GMBR') gmbrCount++;
  else okCount++;
  console.log(`Ch ${c.number}: [${status}] ${(c.thumbnail_url || 'null').substring(0, 80)}`);
}
console.log(`\nSummary: OK=${okCount}, GMBR=${gmbrCount}, NULL=${nullCount}`);

// Count all
const { count: total } = await sb.from('chapters').select('*', { count: 'exact', head: true }).eq('manga_id', manga.id);
const { count: nulls } = await sb.from('chapters').select('*', { count: 'exact', head: true }).eq('manga_id', manga.id).is('thumbnail_url', null);
const { count: gmbrs } = await sb.from('chapters').select('*', { count: 'exact', head: true }).eq('manga_id', manga.id).like('thumbnail_url', '%gmbr.pro%');
console.log(`\nTotal chapters: ${total}, NULL: ${nulls}, GMBR: ${gmbrs}, OK: ${total - nulls - gmbrs}`);