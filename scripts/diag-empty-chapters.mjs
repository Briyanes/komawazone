#!/usr/bin/env node
/**
 * Count empty chapters accurately using chapter_images table.
 * (Same approach as backfill-all-empty-images.mjs)
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  console.log('🔍 Counting empty chapters (via chapter_images table)...\n');

  // 1. Total chapters (paginate)
  let allChapterIds = [];
  let offset = 0;
  while (offset < 60000) {
    const { data: batch } = await supabase
      .from('chapters')
      .select('id, number, manga_id, source_url')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (!batch || batch.length === 0) break;
    allChapterIds.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  console.log(`📦 Total active chapters: ${allChapterIds.length}`);

  // 2. Get all chapter_ids that have images
  let hasImagesIds = [];
  offset = 0;
  while (offset < 500000) {
    const { data: batch } = await supabase
      .from('chapter_images')
      .select('chapter_id')
      .range(offset, offset + 999);
    if (!batch || batch.length === 0) break;
    hasImagesIds.push(...batch.map(r => r.chapter_id));
    if (batch.length < 1000) break;
    offset += 1000;
  }
  const hasImagesSet = new Set([...new Set(hasImagesIds)]); // unique
  console.log(`📦 Chapters with images: ${hasImagesSet.size}`);

  // 3. Calculate empty
  const emptyChapters = allChapterIds.filter(ch => !hasImagesSet.has(ch.id));
  console.log(`📦 Chapters WITHOUT images: ${emptyChapters.length}`);
  console.log(`📊 Progress: ${((allChapterIds.length - emptyChapters.length) / allChapterIds.length * 100).toFixed(1)}% filled\n`);

  // 4. Show breakdown by manga
  const emptyByManga = {};
  for (const ch of emptyChapters) {
    emptyByManga[ch.manga_id] = (emptyByManga[ch.manga_id] || 0) + 1;
  }
  const topEmpty = Object.entries(emptyByManga).sort((a, b) => b[1] - a[1]).slice(0, 10);
  console.log('📋 Top 10 manga with most empty chapters (manga_id: count):');
  for (const [mangaId, count] of topEmpty) {
    console.log(`  ${mangaId}: ${count} chapters`);
  }

  // 5. Save to file for next step
  const fs = await import('fs/promises');
  await fs.writeFile(
    'scripts/data/empty-chapters.json',
    JSON.stringify({ total: emptyChapters.length, chapters: emptyChapters.map(c => ({ id: c.id, number: c.number, manga_id: c.manga_id, source_url: c.source_url })) }, null, 0)
  );
  console.log(`\n💾 Saved ${emptyChapters.length} empty chapters to scripts/data/empty-chapters.json`);
}

main().catch(console.error);