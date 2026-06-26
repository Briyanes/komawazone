/**
 * Bulk fix: Replace broken GIF thumbnails with correct JPG (5th image).
 * Usage: node scripts/fix-gif-thumbnails-bulk.mjs
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { writeFile, readFile } from 'fs/promises';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) } }
);

const BATCH_SIZE = 200;
const CONCURRENCY = 10;
const PROGRESS_FILE = new URL('../gif-thumb-fix-progress.json', import.meta.url);

async function loadProgress() {
  try {
    const raw = await readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return { lastOffset: 0, fixed: 0, skipped: 0, failed: 0 }; }
}

async function saveProgress(p) {
  await writeFile(PROGRESS_FILE, JSON.stringify(p, null, 2));
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('🚀 GIF Thumbnail Bulk Fix — Starting...\n');

  const { count: totalGif } = await sb
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .filter('thumbnail_url', 'ilike', '%.gif%');

  console.log(`📊 Total chapters with GIF thumbnail: ${totalGif?.toLocaleString()}\n`);

  if (!totalGif || totalGif === 0) {
    console.log('✅ No GIF thumbnails found. Nothing to fix!');
    return;
  }

  const progress = await loadProgress();
  console.log(`📦 Resuming from offset ${progress.lastOffset} (already fixed: ${progress.fixed})\n`);

  let offset = progress.lastOffset;
  let totalFixed = progress.fixed;
  let totalSkipped = progress.skipped;
  let totalFailed = progress.failed;
  let batchNum = 0;

  while (offset < totalGif) {
    const { data: chapters, error: fetchErr } = await sb
      .from('chapters')
      .select('id, number, thumbnail_url')
      .filter('thumbnail_url', 'ilike', '%.gif%')
      .range(offset, offset + BATCH_SIZE - 1)
      .order('id');

    if (fetchErr) {
      console.error('❌ Error fetching chapters:', fetchErr.message);
      break;
    }
    if (!chapters || chapters.length === 0) break;

    batchNum++;
    console.log(`\n── Batch ${batchNum} (offset ${offset}, ${chapters.length} chapters) ──`);

    const chunks = chunk(chapters, CONCURRENCY);

    for (const miniBatch of chunks) {
      await Promise.all(miniBatch.map(async (ch) => {
        try {
          const { data: imgs, error: imgErr } = await sb
            .from('chapter_images')
            .select('image_url')
            .eq('chapter_id', ch.id)
            .order('number', { ascending: true })
            .limit(5);

          if (imgErr || !imgs || imgs.length === 0) {
            totalSkipped++;
            return;
          }

          let correctThumb = imgs.length >= 5 ? imgs[4].image_url : imgs[imgs.length - 1].image_url;

          // If 5th is still GIF, find first JPG
          if (correctThumb.toLowerCase().endsWith('.gif')) {
            const { data: allImgs } = await sb
              .from('chapter_images')
              .select('image_url')
              .eq('chapter_id', ch.id)
              .order('number', { ascending: true });

            const jpg = allImgs?.find(i => !i.image_url.toLowerCase().endsWith('.gif'));
            if (!jpg) {
              totalSkipped++;
              return;
            }
            correctThumb = jpg.image_url;
          }

          const { error: updErr } = await sb
            .from('chapters')
            .update({ thumbnail_url: correctThumb })
            .eq('id', ch.id);

          if (updErr) {
            totalFailed++;
          } else {
            totalFixed++;
          }
        } catch {
          totalFailed++;
        }
      }));
    }

    offset += chapters.length;
    progress.lastOffset = offset;
    progress.fixed = totalFixed;
    progress.skipped = totalSkipped;
    progress.failed = totalFailed;
    await saveProgress(progress);

    const pct = ((offset / totalGif) * 100).toFixed(1);
    console.log(`  ✅ Progress: ${offset}/${totalGif} (${pct}%) | Fixed: ${totalFixed} | Skipped: ${totalSkipped} | Failed: ${totalFailed}`);

    await sleep(200);
  }

  console.log('\n═══════════════════════════════════════');
  console.log('🎉 DONE!');
  console.log(`  ✅ Fixed:   ${totalFixed.toLocaleString()}`);
  console.log(`  ⏭️  Skipped: ${totalSkipped.toLocaleString()}`);
  console.log(`  ❌ Failed:  ${totalFailed.toLocaleString()}`);
  console.log(`  📊 Total:   ${(totalFixed + totalSkipped + totalFailed).toLocaleString()}`);
  console.log('═══════════════════════════════════════\n');

  const { count: remaining } = await sb
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`🔍 Verification — GIF thumbnails remaining: ${remaining?.toLocaleString() ?? 'null'}`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});
