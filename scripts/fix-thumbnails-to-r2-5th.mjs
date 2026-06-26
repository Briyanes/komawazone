/**
 * Fix chapter thumbnails that point to dead hosts (gmbr.pro, gmbar.xyz, uwakjawa.xyz)
 * by pulling the 5th image from chapter_images (or first R2 image as fallback).
 *
 * Usage: node scripts/fix-thumbnails-to-r2-5th.mjs [--dry-run] [--limit=N]
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Dead host detection
const DEAD_SUFFIXES = ['.gmbr.pro', '.gmbar.xyz', '.uwakjawa.xyz'];
const DEAD_HOSTS = new Set(['gmbr.pro', 'gmbar.xyz', 'uwakjawa.xyz']);

function isDeadUrl(url) {
  if (!url) return true;
  try {
    const h = new URL(url).hostname;
    if (DEAD_HOSTS.has(h)) return true;
    return DEAD_SUFFIXES.some(s => h.endsWith(s));
  } catch {
    return false;
  }
}

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0; // 0 = no limit

async function main() {
  console.log('═'.repeat(70));
  console.log(`  fix-thumbnails-to-r2-5th.mjs  ${DRY_RUN ? '〔DRY RUN〕' : '〔LIVE〕'}`);
  console.log('═'.repeat(70));
  console.log('');

  // Step 1: Count chapters needing fix (use data, not head — more reliable)
  const { data: nullRows } = await sb
    .from('chapters')
    .select('id, thumbnail_url')
    .is('thumbnail_url', null)
    .is('deleted_at', null)
    .range(0, 0);
  const nullCount = nullRows?.length ?? 0;

  // Count dead-host thumbnails
  const { data: deadRows } = await sb
    .from('chapters')
    .select('id')
    .or('thumbnail_url.like.%gmbr.pro%,thumbnail_url.like.%gmbar.xyz%,thumbnail_url.like.%uwakjawa.xyz%')
    .is('deleted_at', null)
    .range(0, 999);
  const deadHostCount = deadRows?.length ?? 0;

  // Get total count via count head (no filter, more reliable)
  const { count: totalChapters } = await sb
    .from('chapters')
    .select('id', { count: 'exact', head: true })
    .is('deleted_at', null);

  console.log(`📊 Total active chapters              : ${totalChapters ?? '?'}`);
  console.log(`📊 Chapters with dead-host thumbnail  : ${deadHostCount}+`);
  console.log(`📊 Chapters with NULL thumbnail       : ${nullCount === 1 ? 'many (showing first)' : nullCount}`);
  if (LIMIT > 0) console.log(`📊 Limit (this run)                   : ${LIMIT}`);
  console.log('');

  // Step 2: Fetch chapters in batches
  const BATCH = 200;
  let processed = 0;
  let updated = 0;
  let skippedNoImages = 0;
  let skippedAllDead = 0;
  let offset = 0;

  while (true) {
    if (LIMIT > 0 && processed >= LIMIT) break;

    const batchLimit = LIMIT > 0 ? Math.min(BATCH, LIMIT - processed) : BATCH;

    // Fetch chapters with dead/NULL thumbnails
    const { data: chapters, error } = await sb
      .from('chapters')
      .select('id, number, title, thumbnail_url, manga_id')
      .or('thumbnail_url.is.null,thumbnail_url.like.%gmbr.pro%,thumbnail_url.like.%gmbar.xyz%,thumbnail_url.like.%uwakjawa.xyz%')
      .is('deleted_at', null)
      .range(offset, offset + batchLimit - 1)
      .order('number', { ascending: true });

    if (error) {
      console.error('❌ Query error:', error.message);
      break;
    }
    if (!chapters || chapters.length === 0) break;

    // Process each chapter
    for (const ch of chapters) {
      processed++;

      // Fetch chapter_images for this chapter
      const { data: images, error: imgErr } = await sb
        .from('chapter_images')
        .select('image_url, number')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true });

      if (imgErr || !images || images.length === 0) {
        skippedNoImages++;
        continue;
      }

      // Strategy: try 5th image first (index 4), then find first R2 image
      let newThumb = null;
      const fifth = images[4]; // 5th image (0-indexed)
      if (fifth && !isDeadUrl(fifth.image_url)) {
        newThumb = fifth.image_url;
      } else {
        // Find first non-dead image
        const goodImg = images.find(img => !isDeadUrl(img.image_url));
        if (goodImg) {
          newThumb = goodImg.image_url;
        }
      }

      if (!newThumb) {
        skippedAllDead++;
        if (processed <= 10 || processed % 100 === 0) {
          console.log(`  ⚠️  Ch ${ch.number}: ALL ${images.length} images are dead-host`);
        }
        continue;
      }

      if (DRY_RUN) {
        if (processed <= 10 || processed % 100 === 0) {
          console.log(`  [DRY] Ch ${ch.number}: ${ch.thumbnail_url?.slice(0, 40) ?? 'NULL'} → ${newThumb.slice(0, 60)}...`);
        }
        updated++;
      } else {
        const { error: updErr } = await sb
          .from('chapters')
          .update({ thumbnail_url: newThumb })
          .eq('id', ch.id);

        if (updErr) {
          console.error(`  ❌ Failed ch ${ch.id}:`, updErr.message);
        } else {
          updated++;
          if (processed <= 10 || processed % 200 === 0) {
            console.log(`  ✅ [${processed}] Ch ${ch.number}: → ${newThumb.slice(0, 50)}...`);
          }
        }
      }
    }

    offset += batchLimit;

    // Progress
    if (processed % 200 === 0 || chapters.length < batchLimit) {
      console.log(`  ── Progress: ${processed} processed, ${updated} updated, ${skippedNoImages} no-images, ${skippedAllDead} all-dead ──`);
    }

    if (chapters.length < batchLimit) break;
  }

  console.log('');
  console.log('═'.repeat(70));
  console.log(`  SELESAI!`);
  console.log(`  Total processed  : ${processed}`);
  console.log(`  ${DRY_RUN ? 'Would update' : 'Updated'}      : ${updated}`);
  console.log(`  Skipped (no img) : ${skippedNoImages}`);
  console.log(`  Skipped (dead)   : ${skippedAllDead}`);
  console.log('═'.repeat(70));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});