#!/usr/bin/env node
/**
 * FAST targeted corruption fixer.
 *
 * Instead of scanning all 16k+ chapters with a heavy JOIN,
 * this script directly targets ONLY corrupted rows:
 *   - chapter_images WHERE image_url LIKE '%NEXT_PUBLIC%'
 *   - chapters WHERE thumbnail_url LIKE '%NEXT_PUBLIC%'
 *
 * Usage:
 *   node --env-file=.env.local scripts/fix-corrupted-urls-fast.mjs
 */
import { createClient } from '@supabase/supabase-js';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!sbUrl || !sbKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);

const R2_BASE = (process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '');

// Validate R2_BASE
if (R2_BASE && (R2_BASE.includes('NEXT_PUBLIC') || R2_BASE.includes('R2_PUBLIC_BASE_URL=') || R2_BASE.includes('$'))) {
  console.error('❌ FATAL: R2_PUBLIC_BASE_URL is corrupted!');
  process.exit(1);
}

function buildR2Url(key) {
  return `${R2_BASE}/${key}`;
}

function sanitizeCorruptedR2Url(url) {
  if (!url) return url;
  if (!url.includes('NEXT_PUBLIC_') && !url.includes('R2_PUBLIC_BASE_URL=')) {
    return url;
  }

  // Handle double-corruption pattern where R2 base is prepended
  // e.g. "https://xxx.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://xxx.r2.dev/chapters/..."
  // Strategy: split by 'r2.dev/' and take the last segment as the key
  const parts = url.split('r2.dev/');
  if (parts.length >= 2) {
    const key = parts[parts.length - 1];
    // Validate key looks like an R2 path
    if (/^(chapters|manga|covers)\//.test(key)) {
      return buildR2Url(key);
    }
  }

  // Fallback: try regex extraction
  const keyMatch = url.match(/\/(chapters|manga|covers)\/[^?\s]+$/);
  if (keyMatch) {
    const key = keyMatch[0].slice(1);
    return buildR2Url(key);
  }

  console.warn(`  ⚠️  Can't extract key from: ${url.slice(0, 100)}...`);
  return url;
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  FAST CORRUPTED URL FIXER (v2 - fixed pagination)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  R2 Base: ${R2_BASE.slice(0, 50)}...`);
  console.log('');

  const PAGE_SIZE = 500;

  // ── STEP 1: Fix corrupted chapter_images ──────────────────────────────────
  console.log('📋 Step 1: Fixing corrupted chapter_images...');

  let totalFixedImages = 0;
  let batch = 0;

  // CRITICAL: Always query from offset 0 because fixed rows
  // no longer match the filter, so remaining rows shift down.
  while (true) {
    const { data: corruptedImgs, error } = await sb
      .from('chapter_images')
      .select('id, image_url')
      .like('image_url', '%NEXT_PUBLIC%')
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error(`❌ Error fetching batch ${batch}:`, error.message);
      break;
    }

    if (!corruptedImgs || corruptedImgs.length === 0) {
      break;
    }

    process.stdout.write(`\r  Batch ${batch + 1}: ${corruptedImgs.length} corrupted images...`);

    for (const img of corruptedImgs) {
      const cleanUrl = sanitizeCorruptedR2Url(img.image_url);
      if (cleanUrl !== img.image_url) {
        const { error: updateErr } = await sb
          .from('chapter_images')
          .update({ image_url: cleanUrl })
          .eq('id', img.id);
        if (updateErr) {
          console.error(`\n  ❌ Update failed for img ${img.id}: ${updateErr.message}`);
        } else {
          totalFixedImages++;
        }
      }
    }

    batch++;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n  ✅ Fixed ${totalFixedImages} corrupted chapter_images\n`);

  // ── STEP 2: Fix corrupted chapter thumbnails ──────────────────────────────
  console.log('📋 Step 2: Fixing corrupted chapter thumbnails...');

  let totalFixedThumbs = 0;
  batch = 0;

  while (true) {
    const { data: corruptedThumbs, error } = await sb
      .from('chapters')
      .select('id, thumbnail_url')
      .like('thumbnail_url', '%NEXT_PUBLIC%')
      .range(0, PAGE_SIZE - 1);

    if (error) {
      console.error(`❌ Error fetching thumb batch ${batch}:`, error.message);
      break;
    }

    if (!corruptedThumbs || corruptedThumbs.length === 0) {
      break;
    }

    process.stdout.write(`\r  Batch ${batch + 1}: ${corruptedThumbs.length} corrupted thumbnails...`);

    for (const ch of corruptedThumbs) {
      const cleanUrl = sanitizeCorruptedR2Url(ch.thumbnail_url);
      if (cleanUrl !== ch.thumbnail_url) {
        const { error: updateErr } = await sb
          .from('chapters')
          .update({ thumbnail_url: cleanUrl })
          .eq('id', ch.id);
        if (updateErr) {
          console.error(`\n  ❌ Update failed for chapter ${ch.id}: ${updateErr.message}`);
        } else {
          totalFixedThumbs++;
        }
      }
    }

    batch++;
    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`\n  ✅ Fixed ${totalFixedThumbs} corrupted thumbnails\n`);

  // ── STEP 3: Fix NULL thumbnails (set to 5th image) ────────────────────────
  console.log('📋 Step 3: Fixing NULL thumbnails (setting to 5th image)...');

  let totalFixedNull = 0;
  let nullPage = 0;

  while (true) {
    const { data: nullThumbChapters, error } = await sb
      .from('chapters')
      .select(`
        id, number,
        chapter_images(image_url, number)
      `)
      .is('thumbnail_url', null)
      .is('deleted_at', null)
      .range(nullPage * PAGE_SIZE, (nullPage + 1) * PAGE_SIZE - 1);

    if (error) {
      console.error(`❌ Error fetching null-thumb page ${nullPage}:`, error.message);
      break;
    }

    if (!nullThumbChapters || nullThumbChapters.length === 0) {
      break;
    }

    process.stdout.write(`\r  Page ${nullPage + 1}: processing ${nullThumbChapters.length} chapters...`);

    for (const ch of nullThumbChapters) {
      const imgs = (ch.chapter_images || []).sort((a, b) => a.number - b.number);
      if (imgs.length === 0) continue;

      const idx = imgs.length >= 5 ? 4 : 0;
      const expectedThumb = imgs[idx].image_url;

      // Only skip if the image URL itself is corrupted (contains env var name)
      // gmbr.pro URLs are valid external URLs and should be used as thumbnails
      if (expectedThumb.includes('NEXT_PUBLIC') || expectedThumb.includes('R2_PUBLIC_BASE_URL=')) continue;

      const { error: updateErr } = await sb
        .from('chapters')
        .update({ thumbnail_url: expectedThumb })
        .eq('id', ch.id);

      if (updateErr) {
        console.error(`\n  ❌ Update failed for chapter ${ch.id}: ${updateErr.message}`);
      } else {
        totalFixedNull++;
      }
    }

    if (nullThumbChapters.length < PAGE_SIZE) break;
    nullPage++;
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`\n  ✅ Fixed ${totalFixedNull} NULL thumbnails\n`);

  // ── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('  FINAL SUMMARY');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  🔧 Corrupted images fixed:   ${totalFixedImages}`);
  console.log(`  🔧 Corrupted thumbs fixed:   ${totalFixedThumbs}`);
  console.log(`  ✓  NULL thumbs fixed:        ${totalFixedNull}`);
  console.log('');
}

main().catch(err => {
  console.error('\nFatal error:', err);
  process.exit(1);
});