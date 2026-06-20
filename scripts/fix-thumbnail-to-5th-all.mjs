#!/usr/bin/env node
/**
 * fix-thumbnail-to-5th-all.mjs
 *
 * Fixes ALL chapters where thumbnail_url doesn't match the 5th image.
 * Many chapters imported earlier have thumbnail set to 1st image instead of 5th.
 *
 * Usage:
 *   node scripts/fix-thumbnail-to-5th-all.mjs [--limit N] [--dry-run] [--manga-id <uuid>]
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  const envText = fs.readFileSync(envPath, 'utf-8');
  const env = {};
  for (const line of envText.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ─── Config ──────────────────────────────────────────────────────────────────

const BATCH_SIZE = 500;
const DB_CONCURRENCY = 10;

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const dryRun = args.includes('--dry-run');
  const mangaIdIdx = args.indexOf('--manga-id');
  const specificMangaId = mangaIdIdx !== -1 ? args[mangaIdIdx + 1] : null;

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 fix-thumbnail-to-5th-all.mjs');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Mode      : ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update DB)'}`);
  console.log(`  Limit     : ${limit || 'ALL'}`);
  console.log(`  Manga ID  : ${specificMangaId || 'ALL manga'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Fetch all chapters that HAVE a thumbnail (not null)
  console.log('📋 Fetching chapters with existing thumbnails...');
  let allChapters = [];
  let offset = 0;

  while (true) {
    let query = sb.from('chapters')
      .select('id, number, title, manga_id, thumbnail_url')
      .is('deleted_at', null)
      .not('thumbnail_url', 'is', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1);

    if (specificMangaId) {
      query = query.eq('manga_id', specificMangaId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching chapters:', error.message);
      break;
    }
    if (!data || data.length === 0) break;

    allChapters.push(...data);
    offset += BATCH_SIZE;
    if (data.length < BATCH_SIZE) break;
  }

  console.log(`📊 Found ${allChapters.length} chapters with thumbnails`);

  if (limit > 0) {
    allChapters = allChapters.slice(0, limit);
    console.log(`📊 Limited to: ${allChapters.length}`);
  }

  // Stats
  const stats = {
    checked: 0,
    alreadyCorrect: 0,
    fixed: 0,
    needsFix: 0,
    lessThan5Images: 0,
    noImages: 0,
    error: 0,
  };

  // Process in batches for DB efficiency
  const BATCH = 50;
  for (let i = 0; i < allChapters.length; i += BATCH) {
    const batch = allChapters.slice(i, i + BATCH);

    // For each chapter, fetch its images and compare
    const updatePromises = batch.map(async (chapter) => {
      try {
        const { data: imgs, error } = await sb.from('chapter_images')
          .select('image_url, number')
          .eq('chapter_id', chapter.id)
          .order('number', { ascending: true });

        if (error) {
          stats.error++;
          return;
        }

        stats.checked++;

        if (!imgs || imgs.length === 0) {
          stats.noImages++;
          return;
        }

        const correctThumb = imgs.length >= 5 ? imgs[4].image_url : imgs[imgs.length - 1].image_url;

        if (chapter.thumbnail_url === correctThumb) {
          stats.alreadyCorrect++;
          return;
        }

        // Check if chapter has < 5 images
        if (imgs.length < 5) {
          // Use last image as fallback
          const fallbackThumb = imgs[imgs.length - 1].image_url;
          if (chapter.thumbnail_url === fallbackThumb) {
            stats.alreadyCorrect++;
            return;
          }
          stats.lessThan5Images++;
          if (!dryRun) {
            await sb.from('chapters').update({ thumbnail_url: fallbackThumb }).eq('id', chapter.id);
          }
          return;
        }

        // Thumbnail doesn't match 5th image — needs fix
        stats.needsFix++;

        if (dryRun) {
          console.log(`  ❌ Ch #${chapter.number} (${chapter.id.substring(0, 8)}): thumb doesn't match 5th img`);
          console.log(`     Current: ${chapter.thumbnail_url?.substring(0, 80)}`);
          console.log(`     Should : ${correctThumb.substring(0, 80)}`);
        } else {
          const { error: updateError } = await sb.from('chapters')
            .update({ thumbnail_url: correctThumb })
            .eq('id', chapter.id);

          if (updateError) {
            stats.error++;
          } else {
            stats.fixed++;
          }
        }
      } catch (err) {
        stats.error++;
      }
    });

    await Promise.all(updatePromises);

    // Progress
    const done = Math.min(i + BATCH, allChapters.length);
    const pct = ((done / allChapters.length) * 100).toFixed(1);
    console.log(`📊 ${done}/${allChapters.length} (${pct}%) | ✅${stats.alreadyCorrect} 🔧${stats.fixed} ❌${stats.needsFix} 📏${stats.lessThan5Images} 🚫${stats.noImages} ⚠️${stats.error}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 FINAL SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Total Checked     : ${stats.checked}`);
  console.log(`  Already Correct   : ${stats.alreadyCorrect}`);
  console.log(`  Fixed to 5th      : ${dryRun ? '(dry-run) ' + stats.needsFix : stats.fixed}`);
  console.log(`  Needs Fix         : ${stats.needsFix}`);
  console.log(`  < 5 images (<5)   : ${stats.lessThan5Images}`);
  console.log(`  No Images         : ${stats.noImages}`);
  console.log(`  Errors            : ${stats.error}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (dryRun && stats.needsFix > 0) {
    console.log('\n💡 Run without --dry-run to apply fixes');
  }
}

main().catch(err => { console.error('💥 Fatal:', err.message); console.error(err); process.exit(1); });