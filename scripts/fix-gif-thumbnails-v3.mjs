/**
 * Fix GIF thumbnails v3 — fetch ALL images, find first JPG.
 * Previous v2 failed because limit(6) missed JPGs beyond position 6.
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
const CONCURRENCY = 5;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  console.log('🚀 GIF Thumbnail Fix v3 (full image fetch) — Starting...\n');

  let totalFixed = 0, totalSkipped = 0, totalFailed = 0, round = 0;
  const skippedIds = new Set(); // Track skipped to avoid re-processing

  while (true) {
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

    // Filter out previously skipped chapters
    const newChapters = chapters.filter(c => !skippedIds.has(c.id));
    if (newChapters.length === 0) {
      console.log('  ⚠️ All remaining chapters already skipped — stopping.');
      break;
    }

    round++;
    const chunks = chunk(newChapters, CONCURRENCY);

    for (const mini of chunks) {
      await Promise.all(mini.map(async (ch) => {
        try {
          // Fetch ALL images — no limit
          const { data: imgs } = await sb
            .from('chapter_images')
            .select('image_url')
            .eq('chapter_id', ch.id)
            .order('number', { ascending: true });

          if (!imgs || imgs.length === 0) {
            totalSkipped++;
            skippedIds.add(ch.id);
            return;
          }

          // Try 5th image first (index 4)
          let thumb = null;
          if (imgs.length >= 5 && !imgs[4].image_url.toLowerCase().endsWith('.gif')) {
            thumb = imgs[4].image_url;
          }

          // Fallback: find first non-GIF image
          if (!thumb) {
            const jpg = imgs.find(i => !i.image_url.toLowerCase().endsWith('.gif'));
            if (jpg) thumb = jpg.image_url;
          }

          if (!thumb) {
            // All images are GIF — set to first image anyway (better than broken GIF thumb)
            thumb = imgs[0].image_url;
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
    console.log(`  Round ${round} | ✅ Fixed: ${totalFixed} | ⏭️ ${totalSkipped} | ❌ ${totalFailed} | Total: ${processed}`);
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
