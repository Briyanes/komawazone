#!/usr/bin/env node
/**
 * Fix NULL thumbnails - Batch version
 * ──────────────────────────────────────────────────────────────────────
 * Phase 1: Instant fix - chapters that already have R2 images (just update thumbnail_url)
 * Phase 2: Chapters with gmbr.pro images need re-download (skip for now, use fix-dead-images.mjs)
 * Phase 3: Chapters with no images at all (skip - nothing to use)
 *
 * Usage: node scripts/fix-null-thumbnails-batch.mjs
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const envPath = path.join(__dirname, '..', '.env.local');
const env = loadEnv(envPath);
Object.assign(process.env, env);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchInBatches(ids, fetchFn) {
  const results = [];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(id => fetchFn(id)));
    results.push(...batchResults);
    if (i % 500 === 0) process.stdout.write(`  Progress: ${i}/${ids.length}\r`);
  }
  process.stdout.write('\n');
  return results;
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Fix NULL Thumbnails — Batch Processor');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Step 1: Get all NULL thumbnail chapters
  console.log('Step 1: Fetching all chapters with NULL thumbnail...');
  let nullChapters = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from('chapters')
      .select('id, number, manga_id')
      .is('thumbnail_url', null)
      .is('deleted_at', null)
      .range(from, from + 999);
    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    nullChapters = nullChapters.concat(data);
    from += 1000;
  }
  console.log(`  Found: ${nullChapters.length} chapters with NULL thumbnail\n`);

  // Step 2: Check chapter_images for each - get the 5th image
  console.log('Step 2: Checking chapter_images for each (5th image = thumbnail)...');
  const toFixInstantly = [];
  const needsDownload = [];
  const noImages = [];

  const batchSize = 100;
  for (let i = 0; i < nullChapters.length; i += batchSize) {
    const batch = nullChapters.slice(i, i + batchSize);
    
    // Process in parallel within batch
    const results = await Promise.all(batch.map(async (ch) => {
      const { data: imgs } = await supabase
        .from('chapter_images')
        .select('image_url, number')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true })
        .limit(5);
      
      if (!imgs || imgs.length === 0) {
        return { chapter: ch, type: 'no_images', thumb: null };
      }
      
      const fifth = imgs[4] || imgs[imgs.length - 1];
      if (fifth && (fifth.image_url.includes('r2.dev') || fifth.image_url.includes('cdn.olluq.xyz'))) {
        return { chapter: ch, type: 'instant', thumb: fifth.image_url };
      } else {
        return { chapter: ch, type: 'download', thumb: null };
      }
    }));

    for (const r of results) {
      if (r.type === 'instant') toFixInstantly.push(r);
      else if (r.type === 'download') needsDownload.push(r);
      else noImages.push(r);
    }

    process.stdout.write(`  Checked: ${Math.min(i + batchSize, nullChapters.length)}/${nullChapters.length}\r`);
  }
  process.stdout.write('\n\n');

  console.log('  ┌──────────────────────────────────────────┐');
  console.log(`  │ Has R2 images (instant fix): ${String(toFixInstantly.length).padStart(6)}      │`);
  console.log(`  │ Needs re-download:           ${String(needsDownload.length).padStart(6)}      │`);
  console.log(`  │ No images at all:            ${String(noImages.length).padStart(6)}      │`);
  console.log('  └──────────────────────────────────────────┘\n');

  // Step 3: Fix instantly
  if (toFixInstantly.length > 0) {
    console.log(`Step 3: Fixing ${toFixInstantly.length} chapters (instant thumbnail update)...`);
    let fixed = 0, errors = 0;
    
    for (let i = 0; i < toFixInstantly.length; i += batchSize) {
      const batch = toFixInstantly.slice(i, i + batchSize);
      const results = await Promise.all(batch.map(async (r) => {
        const { error } = await supabase
          .from('chapters')
          .update({ thumbnail_url: r.thumb })
          .eq('id', r.chapter.id);
        return error ? false : true;
      }));
      
      fixed += results.filter(Boolean).length;
      errors += results.filter(x => !x).length;
      process.stdout.write(`  Fixed: ${fixed}/${toFixInstantly.length}\r`);
    }
    process.stdout.write('\n\n');
    console.log(`  ✅ Fixed: ${fixed} | ❌ Errors: ${errors}\n`);
  }

  // Step 4: Report chapters needing download
  if (needsDownload.length > 0) {
    console.log(`\nStep 4: ${needsDownload.length} chapters need image re-download.`);
    console.log('  These chapters have gmbr.pro images that need to be re-scraped.');
    console.log('  Run: node scripts/fix-dead-images.mjs --all\n');
    
    // Group by manga
    const byManga = new Map();
    for (const r of needsDownload) {
      const mid = r.chapter.manga_id;
      byManga.set(mid, (byManga.get(mid) || 0) + 1);
    }
    console.log(`  Affected manga: ${byManga.size}`);
  }

  // Step 5: Report chapters with no images
  if (noImages.length > 0) {
    console.log(`\nStep 5: ${noImages.length} chapters have NO images at all.`);
    console.log('  These are likely broken chapters that need to be re-scraped or deleted.\n');
  }

  // Final count
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Total NULL thumbnail chapters scanned : ${nullChapters.length}`);
  console.log(`  ✅ Fixed (instant from existing R2)   : ${toFixInstantly.length}`);
  console.log(`  ⚠️  Needs re-download (gmbr.pro)      : ${needsDownload.length}`);
  console.log(`  ❌ No images (broken chapters)        : ${noImages.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);