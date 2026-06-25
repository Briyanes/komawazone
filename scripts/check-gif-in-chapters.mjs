/**
 * Check & clean .gif URLs from chapters.chapter_images array
 *
 * Usage:
 *   node scripts/check-gif-in-chapters.mjs              # dry-run (count only)
 *   node scripts/check-gif-in-chapters.mjs --execute     # remove .gif from arrays
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EXECUTE = process.argv.includes('--execute');

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing Supabase env vars. Check .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

async function main() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔍 CHECK .GIF IN chapters.chapter_images ARRAY`);
  console.log(`   Mode: ${EXECUTE ? '🔴 EXECUTE' : '⚪ DRY RUN'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Fetch chapters that have .gif in their chapter_images array
  let totalGifUrls = 0;
  let chaptersAffected = 0;
  let updated = 0;
  let errors = 0;
  const PAGE = 100;

  while (true) {
    // Use textSearch on chapter_images to find .gif references
    const { data: chapters, error } = await sb
      .from('chapters')
      .select('id, chapter_number, manga_id, chapter_images')
      .filter('chapter_images', 'cs', '{"%.gif%"}')
      .range(0, PAGE - 1);

    if (error) {
      // Fallback: try ilike approach via RPC or direct filter
      console.error('Query error:', error.message);
      break;
    }

    if (!chapters || chapters.length === 0) break;

    for (const ch of chapters) {
      const imgs = ch.chapter_images || [];
      const hasGif = imgs.some((u) => u && u.includes('.gif'));
      if (!hasGif) continue;

      chaptersAffected++;
      const gifCount = imgs.filter((u) => u && u.includes('.gif')).length;
      totalGifUrls += gifCount;
      const cleanImgs = imgs.filter((u) => !u || !u.includes('.gif'));

      if (EXECUTE) {
        const { error: updateError } = await sb
          .from('chapters')
          .update({ chapter_images: cleanImgs })
          .eq('id', ch.id);

        if (updateError) {
          console.error(`  Error updating chapter ${ch.id}:`, updateError.message);
          errors++;
        } else {
          updated++;
        }
      }
    }

    process.stdout.write(
      `  Found: ${chaptersAffected} chapters, ${totalGifUrls} .gif URLs${EXECUTE ? ` | Updated: ${updated}` : ''}\r`
    );

    if (chapters.length < PAGE) break;
  }

  console.log(`\n\n${'='.repeat(60)}`);
  console.log(`✅ DONE`);
  console.log(`   Chapters with .gif: ${chaptersAffected.toLocaleString()}`);
  console.log(`   Total .gif URLs:    ${totalGifUrls.toLocaleString()}`);
  if (EXECUTE) {
    console.log(`   Chapters updated:   ${updated.toLocaleString()}`);
    console.log(`   Errors:             ${errors.toLocaleString()}`);
  }
  console.log(`${'='.repeat(60)}\n`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});