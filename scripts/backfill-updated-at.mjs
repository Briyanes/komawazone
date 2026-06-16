/**
 * Backfill manga.updated_at from latest chapter release_date
 * Run with: node --env-file=.env.local scripts/backfill-updated-at.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// Parse .env.local
const env = {};
readFileSync('.env.local', 'utf8').split('\n').forEach(l => {
  const i = l.indexOf('=');
  if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^["']|["']$/g, '');
});

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log('=== Backfill manga.updated_at from chapter release_date ===\n');

  // Step 1: Fetch all chapters, get max release_date per manga_id
  console.log('Fetching chapters...');
  const maxReleaseByManga = new Map();
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('manga_id, release_date')
      .is('deleted_at', null)
      .order('release_date', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (error) { console.error('Error fetching chapters:', error.message); break; }
    if (!data || data.length === 0) break;

    for (const ch of data) {
      if (ch.release_date && !maxReleaseByManga.has(ch.manga_id)) {
        // First occurrence is the max because we ordered by release_date desc
        maxReleaseByManga.set(ch.manga_id, ch.release_date);
      }
    }

    offset += batchSize;
    process.stdout.write(`\r  Processed ${offset} chapters, found ${maxReleaseByManga.size} unique manga...`);
    if (data.length < batchSize) break;
  }

  console.log(`\n  Found ${maxReleaseByManga.size} manga with chapters.\n`);

  // Step 2: Batch update manga.updated_at
  console.log('Updating manga.updated_at...');
  const mangaIds = [...maxReleaseByManga.keys()];
  const updateBatchSize = 100;
  let updated = 0;

  for (let i = 0; i < mangaIds.length; i += updateBatchSize) {
    const batch = mangaIds.slice(i, i + updateBatchSize);
    const updates = batch.map(id => ({ id, updated_at: maxReleaseByManga.get(id) }));

    // Update one by one within batch (Supabase doesn't support bulk update with different values)
    for (const u of updates) {
      const { error } = await sb
        .from('manga')
        .update({ updated_at: u.updated_at })
        .eq('id', u.id);

      if (error) {
        console.error(`\n  Error updating ${u.id}:`, error.message);
      } else {
        updated++;
      }
    }

    process.stdout.write(`\r  Updated ${updated}/${mangaIds.length} manga...`);
  }

  console.log(`\n\n✅ Done! Updated ${updated} manga records.`);

  // Step 3: Verify
  console.log('\n=== Verification (top 5 by updated_at) ===');
  const { data: top5 } = await sb
    .from('manga')
    .select('title, updated_at')
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(5);

  for (const m of top5 ?? []) {
    console.log(`  ${m.title?.slice(0, 40)?.padEnd(41)} ${m.updated_at?.slice(0, 10)}`);
  }

  // Check against chapters
  console.log('\n=== Cross-check with chapters ===');
  const { data: latestChapters } = await sb
    .from('chapters')
    .select('release_date, number, manga!inner(title, updated_at)')
    .is('deleted_at', null)
    .order('release_date', { ascending: false })
    .limit(3);

  for (const ch of latestChapters ?? []) {
    const m = ch.manga;
    const match = Math.abs(new Date(m?.updated_at).getTime() - new Date(ch.release_date).getTime()) < 86400000;
    console.log(`  ${m?.title?.slice(0, 35)} | ch.release: ${ch.release_date?.slice(0, 10)} | updated_at: ${m?.updated_at?.slice(0, 10)} | ${match ? '✅' : '⚠️'}`);
  }
}

main().catch(console.error);