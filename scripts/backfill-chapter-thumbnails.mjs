/**
 * Backfill chapter thumbnail_url to use 2nd-from-last image.
 *
 * For each chapter that has chapter_images:
 *   thumbnail_url = images[images.length - 2] (or images[0] if only 1 page)
 *
 * Usage: node --env-file=.env.local scripts/backfill-chapter-thumbnails.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sbUrl   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey   = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sbUrl || !sbKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);

const BATCH_SIZE  = 100;
const CONCURRENCY = 5;

async function processBatch(chapters) {
  const results = { updated: 0, skipped: 0, errors: 0 };

  // Fetch images for all chapters in this batch in parallel
  const chapterIds = chapters.map(c => c.id);
  const { data: images, error: imgErr } = await sb
    .from('chapter_images')
    .select('chapter_id, image_url, number')
    .in('chapter_id', chapterIds)
    .order('number', { ascending: true });

  if (imgErr) {
    console.error('Error fetching images:', imgErr.message);
    results.errors = chapters.length;
    return results;
  }

  // Group images by chapter_id
  const imagesByChapter = new Map();
  for (const img of images ?? []) {
    if (!imagesByChapter.has(img.chapter_id)) {
      imagesByChapter.set(img.chapter_id, []);
    }
    imagesByChapter.get(img.chapter_id).push(img);
  }

  // Process each chapter
  const updates = [];
  for (const ch of chapters) {
    const imgs = imagesByChapter.get(ch.id) ?? [];
    if (imgs.length === 0) {
      results.skipped++;
      continue;
    }

    // 5th image (index 4), fallback to first if <5 pages
    const thumbIdx = imgs.length >= 5 ? 4 : 0;
    const newThumb = imgs[thumbIdx].image_url;

    // Skip if already correct
    if (ch.thumbnail_url === newThumb) {
      results.skipped++;
      continue;
    }

    updates.push({ id: ch.id, thumbnail_url: newThumb });
  }

  // Batch update
  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const batch = updates.slice(i, i + BATCH_SIZE);
    // Update one by one since supabase doesn't support bulk update with different values
    const promises = batch.map(u =>
      sb.from('chapters').update({ thumbnail_url: u.thumbnail_url }).eq('id', u.id)
    );

    const settled = await Promise.allSettled(promises);
    for (const r of settled) {
      if (r.status === 'rejected' || r.value.error) {
        results.errors++;
      } else {
        results.updated++;
      }
    }
  }

  return results;
}

async function main() {
  console.log('=== Backfill Chapter Thumbnails (2nd-from-last image) ===\n');

  // Get total count
  const { count: totalChapters } = await sb
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  console.log(`Total chapters: ${totalChapters}`);

  let offset    = 0;
  let totalUpdated  = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;

  while (offset < totalChapters) {
    // Fetch batch of chapters
    const { data: chapters, error } = await sb
      .from('chapters')
      .select('id, number, thumbnail_url')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error(`Error fetching chapters at offset ${offset}:`, error.message);
      break;
    }

    if (!chapters || chapters.length === 0) break;

    const batchResults = await processBatch(chapters);
    totalUpdated += batchResults.updated;
    totalSkipped += batchResults.skipped;
    totalErrors  += batchResults.errors;

    offset += chapters.length;
    process.stdout.write(`\rProgress: ${offset}/${totalChapters} | Updated: ${totalUpdated} | Skipped: ${totalSkipped} | Errors: ${totalErrors}`);
  }

  console.log('\n\n=== Done ===');
  console.log(`Total updated:  ${totalUpdated}`);
  console.log(`Total skipped:  ${totalSkipped}`);
  console.log(`Total errors:   ${totalErrors}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});