#!/usr/bin/env node
/**
 * Fix chapter thumbnails: For chapters that HAVE images in chapter_images
 * but have NULL or broken thumbnail_url, set the thumbnail from the 5th image
 * (or first/last if fewer).
 *
 * Also fixes chapters where thumbnail_url points to a non-R2 source URL
 * but R2 images exist.
 *
 * Usage:
 *   node scripts/fix-thumbnails-from-images.mjs                    # All chapters
 *   node scripts/fix-thumbnails-from-images.mjs --manga=SLUG       # Single manga
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── Load env ───────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i === -1) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const args = process.argv.slice(2);
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const BATCH_SIZE = 200;

function isR2Url(url) {
  if (!url) return false;
  return url.includes('pub-') || url.includes('r2.dev') || url.includes('olluq.xyz') || url.includes('r2.cloudflarestorage.com');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('═'.repeat(70));
  console.log('  FIX THUMBNAILS FROM CHAPTER IMAGES');
  console.log('  Set thumbnail_url for chapters with images but NULL/broken thumbnail');
  console.log('═'.repeat(70));

  if (MANGA_FILTER) {
    const { data: manga } = await sb
      .from('manga')
      .select('id, title, slug')
      .eq('slug', MANGA_FILTER)
      .single();
    if (!manga) { console.error(`Manga not found: ${MANGA_FILTER}`); process.exit(1); }
    console.log(`📖 ${manga.title} (${manga.slug})\n`);
    await fixMangaChapters(manga);
    return;
  }

  // Global mode: Find all chapters with NULL or non-R2 thumbnail that have images
  console.log('🔍 Finding chapters with NULL/broken thumbnails but have images...\n');

  let totalFixed = 0;
  let totalSkipped = 0;
  let offset = 0;

  while (true) {
    // Get chapters with NULL thumbnail or non-R2 thumbnail
    let query = sb
      .from('chapters')
      .select('id, number, manga_id, thumbnail_url, deleted_at')
      .is('deleted_at', null)
      .order('number', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    const { data: chapters, error } = await query;
    if (error) { console.error('Query error:', error.message); break; }
    if (!chapters || chapters.length === 0) break;

    for (const ch of chapters) {
      const needsFix = !ch.thumbnail_url || (!isR2Url(ch.thumbnail_url) && !ch.thumbnail_url.startsWith('http'));

      if (!needsFix) {
        totalSkipped++;
        continue;
      }

      // Get images for this chapter
      const { data: images } = await sb
        .from('chapter_images')
        .select('image_url, number')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true })
        .range(0, 9); // Get first 10 images

      if (!images || images.length === 0) {
        totalSkipped++;
        continue;
      }

      // Pick 5th image (or last available)
      const thumbIdx = Math.min(4, images.length - 1);
      const newThumb = images[thumbIdx].image_url;

      if (!newThumb) {
        totalSkipped++;
        continue;
      }

      // Update thumbnail
      const { error: updateErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: newThumb })
        .eq('id', ch.id);

      if (updateErr) {
        console.log(`  ❌ Ch${ch.number}: ${updateErr.message}`);
        totalSkipped++;
      } else {
        totalFixed++;
        if (totalFixed % 100 === 0) {
          console.log(`  ✅ Fixed ${totalFixed} thumbnails so far...`);
        }
      }

      // Small delay to avoid rate limiting
      if (totalFixed % 50 === 0) await sleep(200);
    }

    if (chapters.length < BATCH_SIZE) break;
    offset += BATCH_SIZE;
    await sleep(100);
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Thumbnails fixed  : ${totalFixed}`);
  console.log(`  Skipped (OK/empty): ${totalSkipped}`);
  console.log('═'.repeat(70));
}

async function fixMangaChapters(manga) {
  let fixed = 0, skipped = 0;

  // Get all chapters
  const { data: chapters } = await sb
    .from('chapters')
    .select('id, number, thumbnail_url')
    .eq('manga_id', manga.id)
    .is('deleted_at', null)
    .order('number', { ascending: true });

  if (!chapters || chapters.length === 0) {
    console.log('  No chapters found');
    return;
  }

  console.log(`  Total chapters: ${chapters.length}`);

  for (const ch of chapters) {
    const needsFix = !ch.thumbnail_url;

    if (!needsFix) {
      skipped++;
      continue;
    }

    // Get images
    const { data: images } = await sb
      .from('chapter_images')
      .select('image_url, number')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(0, 9);

    if (!images || images.length === 0) {
      console.log(`  ⚠️  Ch${ch.number}: No images found`);
      skipped++;
      continue;
    }

    const thumbIdx = Math.min(4, images.length - 1);
    const newThumb = images[thumbIdx].image_url;

    const { error } = await sb
      .from('chapters')
      .update({ thumbnail_url: newThumb })
      .eq('id', ch.id);

    if (error) {
      console.log(`  ❌ Ch${ch.number}: ${error.message}`);
      skipped++;
    } else {
      console.log(`  ✅ Ch${ch.number}: thumbnail set (${images.length} images available)`);
      fixed++;
    }
  }

  console.log(`\n📊 Result: ${fixed} fixed, ${skipped} skipped`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});