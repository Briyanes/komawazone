/**
 * Fix GIF thumbnails — no offset pagination.
 * Strategy: Query 200 GIF chapters, fix them, repeat until 0 remaining.
 * Each fixed chapter exits the GIF filter, so next query gets fresh batch.
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) } }
);

const BATCH = 200;
const CONCURRENCY = 10;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🚀 GIF Thumbnail Fix v2 (no-offset) — Starting...\n');

  let totalFixed = 0, totalSkipped = 0, totalFailed = 0, round = 0;

  while (true) {
    // Always query from offset 0 — fixed chapters leave the GIF filter
    const { data: chapters, error } = await sb
      .from('chapters')
      .select('id, number')
      .filter('thumbnail_url', 'ilike', '%.gif%')
      .range(0, BATCH - 1)
      .order('id');

    if (error) {
      console.error('❌ Query error:', error.message);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }

    if (!chapters || chapters.length === 0) break;

    round++;
    const chunks = chunk(chapters, CONCURRENCY);

    for (const mini of chunks) {
      await Promise.all(mini.map(async (ch) => {
        try {
          const { data: imgs } = await sb
            .from('chapter_images')
            .select('image_url')
            .eq('chapter_id', ch.id)
            .order('number', { ascending: true })
            .limit(6);

          if (!imgs || imgs.length === 0) { totalSkipped++; return; }

          let thumb = imgs.length >= 5 ? imgs[4].image_url : imgs[imgs.length - 1].image_url;

          if (thumb.toLowerCase().endsWith('.gif')) {
            const jpg = imgs.find(i => !i.image_url.toLowerCase().endsWith('.gif'));
            if (!jpg) { totalSkipped++; return; }
            thumb = jpg.image_url;
          }

          const { error: updErr } = await sb
            .from('chapters')
            .update({ thumbnail_url: thumb })
            .eq('id', ch.id);

          if (updErr) totalFailed++;
          else totalFixed++;
        } catch { totalFailed++; }
      }));
    }

    const processed = totalFixed + totalSkipped + totalFailed;
    if (round % 5 === 0 || chapters.length < BATCH) {
      console.log(`  Round ${round} | ✅ Fixed: ${totalFixed} | ⏭️ ${totalSkipped} | ❌ ${totalFailed} | Total: ${processed}`);
    }
  }

  console.log('\n══════════════════════════════════');
  console.log('🎉 ALL DONE!');
  console.log(`  ✅ Fixed:   ${totalFixed.toLocaleString()}`);
  console.log(`  ⏭️  Skipped: ${totalSkipped.toLocaleString()}`);
  console.log(`  ❌ Failed:  ${totalFailed.toLocaleString()}`);
  console.log('══════════════════════════════════\n');

  const { count: remaining } = await sb
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`🔍 GIF thumbnails remaining: ${remaining?.toLocaleString() ?? 'null'}`);
}

main().catch(err => { console.error('💥 Fatal:', err); process.exit(1); });
