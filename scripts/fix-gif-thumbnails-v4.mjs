/**
 * Fix GIF thumbnails v4 — ALWAYS update, never skip.
 * - No images → set NULL (exits GIF filter)
 * - Has images, 5th is JPG → use 5th
 * - Has images, has JPG → use first JPG
 * - All GIF → use first image anyway
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) } }
);

const BATCH = 100;
const CONCURRENCY = 10;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🚀 GIF Thumbnail Fix v4 (always update) — Starting...\n');

  const { count: initial } = await sb.from('chapters').select('*', { count: 'exact', head: true }).filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`📊 Initial GIF thumbnails: ${initial?.toLocaleString()}\n`);

  let totalFixed = 0, totalNulled = 0, totalFailed = 0, round = 0;

  while (true) {
    const { data: chapters, error } = await sb
      .from('chapters')
      .select('id')
      .filter('thumbnail_url', 'ilike', '%.gif%')
      .range(0, BATCH - 1)
      .order('id');

    if (error) {
      console.error('❌', error.message);
      await new Promise(r => setTimeout(r, 2000));
      continue;
    }
    if (!chapters || chapters.length === 0) {
      console.log('✅ No more GIF thumbnails!');
      break;
    }

    round++;
    const chunks = chunk(chapters, CONCURRENCY);

    for (const mini of chunks) {
      await Promise.all(mini.map(async (ch) => {
        try {
          const { data: imgs } = await sb
            .from('chapter_images')
            .select('image_url')
            .eq('chapter_id', ch.id)
            .order('number', { ascending: true });

          let updateVal = null;
          let isNull = false;

          if (!imgs || imgs.length === 0) {
            updateVal = null;
            isNull = true;
          } else {
            if (imgs.length >= 5 && !imgs[4].image_url.toLowerCase().endsWith('.gif')) {
              updateVal = imgs[4].image_url;
            } else {
              const jpg = imgs.find(i => !i.image_url.toLowerCase().endsWith('.gif'));
              updateVal = jpg ? jpg.image_url : imgs[0].image_url;
            }
          }

          const { error: updErr } = await sb
            .from('chapters')
            .update({ thumbnail_url: updateVal })
            .eq('id', ch.id);

          if (updErr) totalFailed++;
          else if (isNull) totalNulled++;
          else totalFixed++;
        } catch { totalFailed++; }
      }));
    }

    if (round % 10 === 0) {
      const total = totalFixed + totalNulled + totalFailed;
      console.log(`  Round ${round} | ✅ Fixed: ${totalFixed} | 📭 Nulled: ${totalNulled} | ❌ ${totalFailed} | Total: ${total}`);
    }
  }

  console.log('\n═══════════════════════════════════');
  console.log('🎉 ALL DONE!');
  console.log(`  ✅ Fixed:   ${totalFixed.toLocaleString()}`);
  console.log(`  📭 Nulled:  ${totalNulled.toLocaleString()}`);
  console.log(`  ❌ Failed:  ${totalFailed.toLocaleString()}`);
  console.log('═══════════════════════════════════\n');

  const { count: remaining } = await sb.from('chapters').select('*', { count: 'exact', head: true }).filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`🔍 GIF thumbnails remaining: ${remaining?.toLocaleString() ?? 'null'}`);
}

main().catch(err => { console.error('💥', err); process.exit(1); });
