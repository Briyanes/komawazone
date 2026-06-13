#!/usr/bin/env node
/**
 * Batch import chapters (metadata only) for manga that have no chapters yet.
 * Images are lazy-loaded on first read.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-chapters-batch.mjs           # all manga
 *   node --env-file=.env.local scripts/import-chapters-batch.mjs --slug=69-university  # specific manga
 *   node --env-file=.env.local scripts/import-chapters-batch.mjs --limit=10             # first 10
 *   node --env-file=.env.local scripts/import-chapters-batch.mjs --dry-run              # preview only
 */

import { createClient } from '@supabase/supabase-js';

// Parse args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries - 1) throw err;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

/**
 * Parse chapter list from manhwaland HTML
 */
function parseChapters(html) {
  const chapters = [];
  const linkRegex = /href="(https?:\/\/[^"]*\/[^"]*-chapter-(\d+(?:\.\d+)?)[^"]*)"/gi;
  const seen = new Set();
  let match;

  while ((match = linkRegex.exec(html)) !== null) {
    const url = match[1];
    const num = parseFloat(match[2]);
    if (seen.has(num)) continue;
    seen.add(num);
    chapters.push({ number: num, url, title: `Chapter ${num}` });
  }

  chapters.sort((a, b) => b.number - a.number);
  return chapters;
}

async function importChaptersForManga(manga) {
  console.log(`\n📚 ${manga.title} (${manga.slug})`);

  if (!manga.source_url) {
    console.log(`   ⚠️  No source_url — skipping`);
    return { slug: manga.slug, status: 'no_source', count: 0 };
  }

  try {
    const html = await fetchWithRetry(manga.source_url);
    const chapters = parseChapters(html);

    if (chapters.length === 0) {
      console.log(`   ⚠️  No chapters found in HTML`);
      return { slug: manga.slug, status: 'no_chapters', count: 0 };
    }

    console.log(`   Found ${chapters.length} chapters`);

    if (dryRun) {
      console.log(`   [DRY RUN] Would import ch.${chapters[0].number} → ch.${chapters[chapters.length - 1].number}`);
      return { slug: manga.slug, status: 'dry_run', count: chapters.length };
    }

    // Build insert rows — match actual schema: manga_id, number, title
    const rows = chapters.map(ch => ({
      manga_id: manga.id,
      number: ch.number,
      title: ch.title,
    }));

    // Plain insert in batches of 50
    let insertedCount = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error: insertErr } = await supabase
        .from('chapters')
        .insert(batch);

      if (insertErr) {
        // If duplicate, try one by one
        if (insertErr.code === '23505') {
          for (const row of batch) {
            const { error: e2 } = await supabase.from('chapters').insert(row);
            if (!e2) insertedCount++;
          }
        } else {
          console.error(`   ❌ Insert error:`, insertErr.message, insertErr.code);
        }
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`   ✅ Inserted ${insertedCount}/${chapters.length} chapters`);
    return { slug: manga.slug, status: 'success', count: insertedCount };
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return { slug: manga.slug, status: 'error', count: 0, error: err.message };
  }
}

async function main() {
  console.log('=== Batch Chapter Import ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (slugArg) console.log(`Filter: slug=${slugArg}`);
  if (limitArg) console.log(`Limit: ${limitArg}`);

  let query = supabase
    .from('manga')
    .select('id, slug, title, source_url, status')
    .is('deleted_at', null)
    .not('source_url', 'is', null)
    .order('title');

  if (slugArg) query = query.eq('slug', slugArg);

  const { data: allManga, error: mangaErr } = await query;
  if (mangaErr) {
    console.error('Failed to fetch manga:', mangaErr.message);
    process.exit(1);
  }

  // Paginate through ALL chapters (Supabase defaults to 1000 rows per page)
  const mangaWithChapters = new Set();
  let page = 0;
  while (true) {
    const { data: pageData } = await supabase
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!pageData || pageData.length === 0) break;
    for (const c of pageData) mangaWithChapters.add(c.manga_id);
    if (pageData.length < 1000) break;
    page++;
  }
  let mangaToProcess = allManga.filter(m => !mangaWithChapters.has(m.id));

  if (limitArg > 0) mangaToProcess = mangaToProcess.slice(0, limitArg);

  console.log(`\n${allManga.length} active manga, ${mangaWithChapters.size} have chapters, ${mangaToProcess.length} need import\n`);

  if (mangaToProcess.length === 0) {
    console.log('✅ Nothing to import!');
    return;
  }

  const results = [];
  let success = 0;
  let errors = 0;
  let totalChapters = 0;

  for (let i = 0; i < mangaToProcess.length; i++) {
    const manga = mangaToProcess[i];
    console.log(`\n[${i + 1}/${mangaToProcess.length}]`, '━'.repeat(40));
    const result = await importChaptersForManga(manga);
    results.push(result);

    if (result.status === 'success') {
      success++;
      totalChapters += result.count;
    }
    if (result.status === 'error') errors++;

    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n' + '═'.repeat(50));
  console.log('=== IMPORT SUMMARY ===');
  console.log('═'.repeat(50));
  console.log(`Manga processed: ${mangaToProcess.length}`);
  console.log(`Success: ${success}`);
  console.log(`Errors: ${errors}`);
  console.log(`Total chapters imported: ${totalChapters}`);

  if (errors > 0) {
    console.log('\nErrors:');
    results.filter(r => r.status === 'error').forEach(r => {
      console.log(`  - ${r.slug}: ${r.error}`);
    });
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});