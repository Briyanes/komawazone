/**
 * Comprehensive Thumbnail Fix
 *
 * Problem: Many chapters have `thumbnail_url` pointing to R2 objects
 * that were NEVER uploaded (download failed from CDN).
 * This causes broken thumbnail images on the website.
 *
 * This script:
 * 1. Finds ALL chapters with thumbnail_url but NO chapter_images rows
 * 2. Sets thumbnail_url = NULL for those (frontend shows placeholder)
 * 3. For chapters WITH images, ensures thumbnail = 5th image (index 4)
 *
 * Usage:
 *   node scripts/fix-broken-thumbnails-comprehensive.mjs              # all manga
 *   node scripts/fix-broken-thumbnails-comprehensive.mjs hanas-demons-of-lust  # one manga
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const BATCH_SIZE = 200;
const THUMB_INDEX = 4; // 5th image (0-based index 4)
const targetSlug = process.argv[2] || null;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log(`\n🔧 Comprehensive Thumbnail Fix (remove ghost thumbnails + verify 5th image)`);
  console.log(`   Target: ${targetSlug ? `slug="${targetSlug}"` : 'ALL manga'}\n`);

  // Resolve manga_id if a slug was specified
  let mangaId = null;
  let mangaTitle = '';
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
    mangaTitle = mangaRow.title;
    console.log(`   Manga: ${mangaTitle} (${mangaId})\n`);
  }

  // Phase 1: Find all chapters with thumbnail_url
  // We need to paginate through ALL chapters, not just 1000
  let offset = 0;
  let totalNullified = 0;    // Chapters where thumbnail → NULL (no images)
  let totalFixedTo5th = 0;   // Chapters where thumbnail → 5th image
  let totalAlreadyOk = 0;    // Chapters where thumbnail already correct
  let totalProcessed = 0;
  const startTime = Date.now();

  // Get total count
  let countQuery = sb.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null);
  if (mangaId) countQuery = countQuery.eq('manga_id', mangaId);
  const { count: total } = await countQuery;
  console.log(`   Total active chapters: ${total ?? 0}\n`);

  while (true) {
    // Fetch batch of chapters that HAVE a thumbnail_url
    let pageQuery = sb
      .from('chapters')
      .select('id, number, manga_id, thumbnail_url')
      .is('deleted_at', null)
      .not('thumbnail_url', 'is', null)
      .order('number', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);
    if (mangaId) pageQuery = pageQuery.eq('manga_id', mangaId);

    const { data: chapters, error } = await pageQuery;

    if (error) {
      console.error('Fetch error:', error.message);
      break;
    }
    if (!chapters || chapters.length === 0) break;

    // For each chapter in batch, check if it has images
    const updates = [];

    for (const chapter of chapters) {
      const { data: images } = await sb
        .from('chapter_images')
        .select('image_url, page_number')
        .eq('chapter_id', chapter.id)
        .order('page_number', { ascending: true });

      if (!images || images.length === 0) {
        // NO images → set thumbnail to NULL
        updates.push({
          id: chapter.id,
          number: chapter.number,
          action: 'nullify',
        });
      } else {
        // HAS images → ensure thumbnail = 5th image
        const correctThumb = images.length > THUMB_INDEX
          ? images[THUMB_INDEX].image_url
          : images[0].image_url;

        if (chapter.thumbnail_url !== correctThumb) {
          updates.push({
            id: chapter.id,
            number: chapter.number,
            action: 'fix5th',
            thumbnail_url: correctThumb,
          });
        } else {
          totalAlreadyOk++;
        }
      }
      totalProcessed++;
    }

    // Apply updates in batch
    const nullifyIds = updates.filter(u => u.action === 'nullify').map(u => u.id);
    const fixIds = updates.filter(u => u.action === 'fix5th');

    if (nullifyIds.length > 0) {
      const { error: nullErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: null })
        .in('id', nullifyIds);
      if (nullErr) {
        console.error(`  Nullify error:`, nullErr.message);
      } else {
        totalNullified += nullifyIds.length;
      }
    }

    for (const fix of fixIds) {
      const { error: fixErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: fix.thumbnail_url })
        .eq('id', fix.id);
      if (fixErr) {
        console.error(`  Fix Ch.${fix.number} error:`, fixErr.message);
      } else {
        totalFixedTo5th++;
      }
    }

    offset += BATCH_SIZE;
    const pct = total ? Math.min(100, ((offset / total) * 100)).toFixed(0) : '100';
    console.log(
      `  Progress: ${pct}% | Processed: ${totalProcessed} | ` +
      `Nullified (no images): ${totalNullified} | Fixed to 5th: ${totalFixedTo5th} | Already OK: ${totalAlreadyOk}`
    );

    await sleep(100);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n=== DONE ===`);
  console.log(`  Total processed:     ${totalProcessed}`);
  console.log(`  Nullified (no img):  ${totalNullified} ← broken thumbnails removed`);
  console.log(`  Fixed to 5th:        ${totalFixedTo5th}`);
  console.log(`  Already correct:     ${totalAlreadyOk}`);
  console.log(`  Time:                ${elapsed}s`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});