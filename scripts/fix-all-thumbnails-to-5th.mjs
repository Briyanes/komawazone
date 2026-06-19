/**
 * Re-fix ALL chapter thumbnails to use the 5th image (index 4).
 *
 * Previous scripts only fixed NULL or dead-domain (gmbr.pro) thumbnails.
 * This script fixes chapters that ALREADY have a thumbnail but it's the
 * WRONG one (e.g. page 1 instead of page 5) — a leftover from the old
 * buggy code that used images[0] or successfulResults[4] (shifted index).
 *
 * Usage:
 *   node scripts/fix-all-thumbnails-to-5th.mjs                    # all manga
 *   node scripts/fix-all-thumbnails-to-5th.mjs hanas-demons-of-lust  # one manga
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const BATCH_SIZE   = 50;
const CONCURRENCY  = 5;
const THUMB_INDEX  = 4; // 5th image (0-based index 4)
const targetSlug   = process.argv[2] || null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Process a batch of chapters: fetch their images, compare thumbnail,
 * update if different. Returns counts.
 */
async function processBatch(chapters) {
  let updated   = 0;
  let skipped   = 0;
  let noImages  = 0;

  // Run with limited concurrency
  const queue = [...chapters];

  async function worker() {
    while (queue.length > 0) {
      const chapter = queue.shift();
      if (!chapter) break;

      // Fetch images ordered by page number
      const { data: images, error } = await sb
        .from('chapter_images')
        .select('image_url, number')
        .eq('chapter_id', chapter.id)
        .order('number', { ascending: true });

      if (error) {
        console.error(`  [Ch.${chapter.number}] Query error:`, error.message);
        skipped++;
        continue;
      }

      if (!images || images.length === 0) {
        noImages++;
        continue;
      }

      // Determine correct thumbnail: 5th image, fallback to 1st
      const correctThumb = images.length > THUMB_INDEX
        ? images[THUMB_INDEX].image_url
        : images[0].image_url;

      // Skip if already correct
      if (chapter.thumbnail_url === correctThumb) {
        skipped++;
        continue;
      }

      // Update the chapter's thumbnail
      const { error: updateErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: correctThumb })
        .eq('id', chapter.id);

      if (updateErr) {
        console.error(`  [Ch.${chapter.number}] Update error:`, updateErr.message);
        skipped++;
      } else {
        updated++;
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  return { updated, skipped, noImages };
}

async function main() {
  console.log(`\n🔧 Thumbnail Re-Fix Script (force 5th image)`);
  console.log(`   Target: ${targetSlug ? `slug="${targetSlug}"` : 'ALL manga'}`);
  console.log(`   Rule: thumbnail_url = chapter_images[4] (5th page), fallback [0]\n`);

  // Resolve manga_id if a slug was specified (so we can filter directly)
  let mangaId = null;
  if (targetSlug) {
    const { data: mangaRow, error: mErr } = await sb
      .from('manga')
      .select('id, title')
      .eq('slug', targetSlug)
      .single();
    if (mErr || !mangaRow) {
      console.error(`Manga with slug "${targetSlug}" not found.`);
      process.exit(1);
    }
    mangaId = mangaRow.id;
    console.log(`   Manga: ${mangaRow.title} (${mangaId})\n`);
  }

  // Get total count first
  let countQuery = sb.from('chapters').select('*', { count: 'exact', head: true });
  if (mangaId) countQuery = countQuery.eq('manga_id', mangaId);
  const { count: total } = await countQuery;

  console.log(`   Total chapters to check: ${total ?? 0}\n`);

  let offset      = 0;
  let totalUpdated   = 0;
  let totalSkipped   = 0;
  let totalNoImages  = 0;
  const startTime    = Date.now();

  while (true) {
    // Fetch batch of chapters
    let pageQuery = sb
      .from('chapters')
      .select('id, number, thumbnail_url')
      .order('number', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (mangaId) pageQuery = pageQuery.eq('manga_id', mangaId);

    const { data: chapters, error } = await pageQuery;

    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
    if (!chapters || chapters.length === 0) break;

    const { updated, skipped, noImages } = await processBatch(chapters);
    totalUpdated  += updated;
    totalSkipped  += skipped;
    totalNoImages += noImages;

    offset += BATCH_SIZE;
    const pct = Math.min(100, ((offset / total) * 100)).toFixed(0);
    console.log(`  Progress: ${pct}% | Updated: ${totalUpdated} | Skipped (already correct): ${totalSkipped} | No images: ${totalNoImages}`);

    await sleep(150); // Rate limit
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`  Updated:      ${totalUpdated}`);
  console.log(`  Already OK:   ${totalSkipped}`);
  console.log(`  No images:    ${totalNoImages}`);
  console.log(`  Time:         ${elapsed}s`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});