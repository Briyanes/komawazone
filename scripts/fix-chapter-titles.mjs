/**
 * Normalize ALL chapter titles to "Chapter N" format.
 *
 * Many chapters have titles like:
 *   - "Misshitsu Swimsuit Chapter 1"  (manga title prepended)
 *   - "Sake de Onna ni Natta Hanashi Chapter 1"
 *   - Other non-standard formats
 *
 * This script sets them all to clean "Chapter N" based on the `number` column.
 *
 * Usage: node scripts/fix-chapter-titles.mjs
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── Load env ──────────────────────────────────────────────────────────────
const env = {};
const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
}

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const BATCH_SIZE = 500;
let totalUpdated = 0;
let totalProcessed = 0;

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Chapter Title Normalizer — "Manga Title Chapter N" → "Chapter N"');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Count how many chapters need fixing
  const { count: totalBadTitles } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('title', 'ilike', 'Chapter %');

  console.log(`Chapters with bad titles: ${totalBadTitles}`);
  console.log(`Processing in batches of ${BATCH_SIZE}...\n`);

  let offset = 0;

  while (true) {
    // Fetch a batch of chapters with bad titles
    const { data: chapters, error } = await supabase
      .from('chapters')
      .select('id, number, title')
      .is('deleted_at', null)
      .not('title', 'ilike', 'Chapter %')
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) {
      console.error('Error fetching chapters:', error.message);
      break;
    }

    if (!chapters || chapters.length === 0) {
      console.log('\n✅ No more chapters to process!');
      break;
    }

    // Build updates — group by identical new title to reduce API calls
    // But since each chapter gets its own "Chapter N", we update individually
    // in a batch using Promise.all
    const updates = chapters.map(ch => ({
      id: ch.id,
      title: `Chapter ${ch.number}`,
    }));

    // Update in parallel (batches of 50 to avoid rate limiting)
    const PARALLEL = 50;
    let batchUpdated = 0;

    for (let i = 0; i < updates.length; i += PARALLEL) {
      const slice = updates.slice(i, i + PARALLEL);
      const results = await Promise.all(
        slice.map(u =>
          supabase
            .from('chapters')
            .update({ title: u.title })
            .eq('id', u.id)
            .select('id')
        ),
      );

      for (const r of results) {
        if (!r.error) batchUpdated++;
        else console.error(`  Error: ${r.error.message}`);
      }
    }

    totalUpdated += batchUpdated;
    totalProcessed += chapters.length;
    const pct = totalBadTitles > 0 ? ((totalProcessed / totalBadTitles) * 100).toFixed(1) : '0';
    console.log(
      `[${totalProcessed}/${totalBadTitles}] ${pct}% — Updated ${batchUpdated} titles (total: ${totalUpdated})`,
    );

    offset += BATCH_SIZE;

    // Small delay between batches
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  ✅ DONE! Total chapters updated: ${totalUpdated}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Verify
  const { count: remainingBad } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null)
    .not('title', 'ilike', 'Chapter %');

  console.log(`Verification — remaining bad titles: ${remainingBad}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});