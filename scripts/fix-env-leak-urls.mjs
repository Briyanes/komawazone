#!/usr/bin/env node
/**
 * Fix 31,946 chapter_images with corrupted URLs caused by env-leak bug.
 *
 * Corrupted pattern:
 *   https://pub-xxx.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev/chapters/...
 *
 * Fixed:
 *   https://pub-xxx.r2.dev/chapters/...
 *
 * Uses parallel batch updates for speed.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const LEAK_PATTERN = /NEXT_PUBLIC_R2_PUBLIC_BASE_URL=https?:\/\/[^\s/$]+\.r2\.dev/;
const FETCH_SIZE = 1000;
const CONCURRENCY = 20;

function fixUrl(url) {
  if (!url || !url.includes('NEXT_PUBLIC_R2')) return url;
  return url.replace(LEAK_PATTERN, '');
}

async function updateOne(table, column, id, newVal) {
  const { error } = await supabase
    .from(table)
    .update({ [column]: newVal })
    .eq('id', id);
  return { id, error };
}

async function fixTable(table, column) {
  console.log(`\n═══ Fixing ${table}.${column} ═══`);

  // Count corrupted
  const { count: totalCorrupted } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .like(column, '%NEXT_PUBLIC_R2%');

  console.log(`  Corrupted rows: ${totalCorrupted ?? 0}`);
  if (!totalCorrupted) return { fixed: 0, errors: 0 };

  let fixed = 0;
  let errors = 0;
  let loops = 0;

  // Always fetch from offset 0 — as we fix rows, they disappear from the
  // filtered result set, so the next batch naturally picks up the next unfixed rows.
  while (true) {
    const { data: rows, error } = await supabase
      .from(table)
      .select(`id, ${column}`)
      .like(column, '%NEXT_PUBLIC_R2%')
      .range(0, FETCH_SIZE - 1);

    if (error) {
      console.error(`  Fetch error:`, error.message);
      break;
    }
    if (!rows || rows.length === 0) break;

    // Build update tasks
    const tasks = [];
    for (const row of rows) {
      const oldUrl = row[column];
      const newUrl = fixUrl(oldUrl);
      if (oldUrl !== newUrl) {
        tasks.push({ id: row.id, url: newUrl });
      }
    }

    // Process in parallel with concurrency limit
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(t => updateOne(table, column, t.id, t.url))
      );
      for (const r of results) {
        if (r.error) {
          errors++;
          if (errors <= 3) console.error(`  Error id=${r.id}:`, r.error.message);
        } else {
          fixed++;
        }
      }
    }

    loops++;
    const pct = ((fixed / totalCorrupted) * 100).toFixed(1);
    console.log(`  [${pct}%] Fixed: ${fixed}/${totalCorrupted} | Errors: ${errors} | Loop: ${loops}`);
  }

  console.log(`  ✅ ${table}.${column}: ${fixed} fixed, ${errors} errors`);
  return { fixed, errors };
}

// ─── Main ───
console.log('═══════════════════════════════════════');
console.log('  ENV-LEAK URL FIXER');
console.log('═══════════════════════════════════════');

// Validate the fix function
const testUrl = 'https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.devNEXT_PUBLIC_R2_PUBLIC_BASE_URL=https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev/chapters/4bc9ce25-62a4-455f-a44d-aefae5f523c4/7.jpg';
const fixedTest = fixUrl(testUrl);
const expected = 'https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev/chapters/4bc9ce25-62a4-455f-a44d-aefae5f523c4/7.jpg';
console.log(`\nTest: ${fixedTest === expected ? '✅ PASS' : '❌ FAIL'}`);

const dryRun = process.argv.includes('--dry-run');
if (dryRun) console.log('\n🔍 DRY RUN mode — counting only\n');

const r1 = dryRun
  ? { fixed: (await supabase.from('chapter_images').select('id', { count: 'exact', head: true }).like('image_url', '%NEXT_PUBLIC_R2%')).count }
  : await fixTable('chapter_images', 'image_url');

const r2 = dryRun
  ? { fixed: (await supabase.from('chapters').select('id', { count: 'exact', head: true }).like('thumbnail_url', '%NEXT_PUBLIC_R2%')).count }
  : await fixTable('chapters', 'thumbnail_url');

console.log('\n═══════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════');
console.log(`  chapter_images: ${r1?.fixed ?? 0} ${dryRun ? 'would fix' : 'fixed'}`);
console.log(`  chapters thumb: ${r2?.fixed ?? 0} ${dryRun ? 'would fix' : 'fixed'}`);
console.log('\n✅ Complete');