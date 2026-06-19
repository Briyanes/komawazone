/**
 * fix-hana-thumbnails.mjs
 * 
 * Fixes broken thumbnails for "Hana's Demons of Lust" — uses 5th image from chapter_images table.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MANGA_SLUG = 'hanas-demons-of-lust';

// ── Step 1: Get manga ───────────────────────────────────────────────────────
const { data: manga } = await supabase
  .from('manga')
  .select('id, title')
  .eq('slug', MANGA_SLUG)
  .single();

if (!manga) {
  console.error(`✗ Manga "${MANGA_SLUG}" not found`);
  process.exit(1);
}
console.log(`\n📖 ${manga.title} (${manga.id})\n`);

// ── Step 2: Get chapters (lightweight) ──────────────────────────────────────
const { data: chapters } = await supabase
  .from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .is('deleted_at', null)
  .order('number', { ascending: true });

console.log(`Found ${chapters?.length ?? 0} chapters\n`);

// ── Step 3: Check & fix each chapter ─────────────────────────────────────────
let fixed = 0;
let alreadyOk = 0;
let skipped = 0;
const issues = [];

for (const ch of chapters ?? []) {
  let needsFix = false;
  let reason = '';

  if (!ch.thumbnail_url || ch.thumbnail_url === 'null') {
    needsFix = true;
    reason = 'NULL thumbnail';
  } else if (ch.thumbnail_url.includes('gmbr.pro')) {
    needsFix = true;
    reason = 'Dead domain (gmbr.pro)';
  } else if (ch.thumbnail_url.includes('undefined')) {
    needsFix = true;
    reason = 'undefined in URL';
  }

  if (!needsFix) {
    alreadyOk++;
    continue;
  }

  // Get 5th image from chapter_images table
  const { data: fifthImage, error: imgErr } = await supabase
    .from('chapter_images')
    .select('image_url')
    .eq('chapter_id', ch.id)
    .order('number', { ascending: true })
    .range(4, 4)  // index 4 = 5th image
    .maybeSingle();

  if (imgErr || !fifthImage) {
    // Fallback: get first image
    const { data: firstImage } = await supabase
      .from('chapter_images')
      .select('image_url')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(0, 0)
      .maybeSingle();

    if (!firstImage) {
      console.log(`  ✗ Ch.${ch.number}: NO images in chapter_images — cannot fix`);
      issues.push({ chapter: ch.number, reason: 'No images' });
      skipped++;
      continue;
    }

    const { error: updateErr } = await supabase
      .from('chapters')
      .update({ thumbnail_url: firstImage.image_url })
      .eq('id', ch.id);

    if (updateErr) {
      console.log(`  ✗ Ch.${ch.number}: update failed — ${updateErr.message}`);
      skipped++;
    } else {
      console.log(`  ⚠ Ch.${ch.number}: fixed with 1st image (no 5th image found, ${reason})`);
      fixed++;
    }
    continue;
  }

  // Fix with 5th image
  const { error: updateErr } = await supabase
    .from('chapters')
    .update({ thumbnail_url: fifthImage.image_url })
    .eq('id', ch.id);

  if (updateErr) {
    console.log(`  ✗ Ch.${ch.number}: update failed — ${updateErr.message}`);
    skipped++;
  } else {
    console.log(`  ✓ Ch.${ch.number}: fixed (${reason}) → ${fifthImage.image_url.substring(0, 60)}...`);
    fixed++;
  }
}

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(80));
console.log(`📊 SUMMARY for "${manga.title}"`);
console.log(`   Total chapters:  ${chapters?.length ?? 0}`);
console.log(`   Already OK:      ${alreadyOk}`);
console.log(`   Fixed:           ${fixed}`);
console.log(`   Skipped:         ${skipped}`);
if (issues.length > 0) {
  console.log(`   Unfixable:       ${issues.length}`);
  for (const iss of issues) {
    console.log(`     → Ch.${iss.chapter}: ${iss.reason}`);
  }
}
console.log('═'.repeat(80) + '\n');