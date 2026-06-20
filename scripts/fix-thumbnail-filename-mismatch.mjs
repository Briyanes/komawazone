/**
 * Fix Thumbnail Filename Mismatch
 *
 * ROOT CAUSE: Some chapters have images stored with UUID filenames (e.g., 8f045fac-....jpg)
 * instead of sequential filenames (e.g., 1.jpg, 2.jpg...). But the thumbnail_url always
 * assumes the 5th image is "5.jpg", which doesn't exist for UUID-named chapters.
 *
 * This script:
 * 1. Finds ALL chapters where the thumbnail filename doesn't match the actual 5th image
 * 2. Updates the thumbnail_url to point to the correct filename
 *
 * Usage: node scripts/fix-thumbnail-filename-mismatch.mjs [--dry-run] [--manga=<slug>]
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const DRY_RUN = process.argv.includes('--dry-run');
const MANGA_SLUG_ARG = process.argv.find(a => a.startsWith('--manga='));
const MANGA_SLUG = MANGA_SLUG_ARG ? MANGA_SLUG_ARG.split('=')[1] : null;

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('🔧 Thumbnail Filename Mismatch Fix');
  console.log('   Mode:', DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update DB)');
  if (MANGA_SLUG) console.log('   Manga filter:', MANGA_SLUG);
  console.log('');

  // Build query
  let mangaQuery = sb.from('manga').select('id, slug, title');
  if (MANGA_SLUG) {
    mangaQuery = mangaQuery.eq('slug', MANGA_SLUG);
  }

  const { data: mangaList, error: mangaErr } = await mangaQuery.order('title');
  if (mangaErr) {
    console.error('❌ Failed to fetch manga:', mangaErr.message);
    process.exit(1);
  }

  console.log(`📚 Checking ${mangaList.length} manga...`);
  console.log('');

  let totalFixed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;
  const errorDetails = [];

  for (const manga of mangaList) {
    // Get all chapters for this manga
    const { data: chapters, error: chErr } = await sb
      .from('chapters')
      .select('id, number, thumbnail_url')
      .eq('manga_id', manga.id)
      .order('number', { ascending: true });

    if (chErr || !chapters) {
      console.error(`❌ ${manga.slug}: Failed to fetch chapters`);
      continue;
    }

    let mangaFixed = 0;

    for (const ch of chapters) {
      if (!ch.thumbnail_url) {
        totalSkipped++;
        continue;
      }

      // Extract filename from thumbnail_url
      const thumbFilename = ch.thumbnail_url.split('/').pop();
      if (!thumbFilename) {
        totalSkipped++;
        continue;
      }

      // Get the 5th image from chapter_images
      const { data: images, error: imgErr } = await sb
        .from('chapter_images')
        .select('number, image_url')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true })
        .range(0, 4); // Get first 5 images

      if (imgErr || !images || images.length < 5) {
        // Chapter has fewer than 5 images, skip (use first available)
        if (!images || images.length === 0) {
          totalSkipped++;
          continue;
        }
      }

      // The 5th image (index 4), or fall back to the last available
      const targetImage = images[Math.min(4, images.length - 1)];
      if (!targetImage || !targetImage.image_url) {
        totalSkipped++;
        continue;
      }

      const actualFilename = targetImage.image_url.split('/').pop();

      // If the thumbnail filename already matches, skip
      if (thumbFilename === actualFilename) {
        totalSkipped++;
        continue;
      }

      // The thumbnail points to wrong filename — fix it!
      // Replace the filename in thumbnail_url
      const newThumbnailUrl = ch.thumbnail_url.replace(
        /\/[^/]+$/,
        '/' + actualFilename
      );

      if (DRY_RUN) {
        console.log(
          `  📖 ${manga.slug} Ch${ch.number}: ${thumbFilename} → ${actualFilename}`
        );
      } else {
        const { error: updateErr } = await sb
          .from('chapters')
          .update({ thumbnail_url: newThumbnailUrl })
          .eq('id', ch.id);

        if (updateErr) {
          totalErrors++;
          errorDetails.push(`${manga.slug} Ch${ch.number}: ${updateErr.message}`);
        } else {
          totalFixed++;
          mangaFixed++;
        }
      }
    }

    if (mangaFixed > 0) {
      console.log(`  ✅ ${manga.slug}: Fixed ${mangaFixed} chapters`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════');
  console.log(`  Fixed:   ${totalFixed}`);
  console.log(`  Skipped: ${totalSkipped}`);
  console.log(`  Errors:  ${totalErrors}`);

  if (errorDetails.length > 0) {
    console.log('');
    console.log('❌ Error details:');
    errorDetails.slice(0, 20).forEach(e => console.log('  ' + e));
  }

  if (DRY_RUN) {
    console.log('');
    console.log('💡 Run without --dry-run to apply changes.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});