#!/usr/bin/env node
/**
 * Smart Filter: Identify which manga actually have fixable chapters on source.
 *
 * PROBLEM:
 *   - 24,066 empty chapters across ~700 manga
 *   - Many manga were imported from sitemap (metadata-only) — source only has 1 chapter
 *   - Backfilling ALL empty chapters wastes 94% of effort on manga that can't be fixed
 *
 * SOLUTION:
 *   1. Group empty chapters by manga_id
 *   2. For each manga, scrape its source page ONCE (browser render)
 *   3. Extract real chapter list from source
 *   4. Cross-reference: which DB chapters match source chapters?
 *   5. Output: fixable manga list + skip list (metadata-only)
 *
 * Usage:
 *   node scripts/smart-filter-fixable.mjs                   # Full scan
 *   node scripts/smart-filter-fixable.mjs --top=50           # Top 50 manga by empty count
 *   node scripts/smart-filter-fixable.mjs --manga=SLUG       # Single manga
 *   node scripts/smart-filter-fixable.mjs --output=report   # Custom output filename
 */

import {
  loadEnv, initSupabase, ProxyPool,
  fetchHtmlWithChapterFallback, scrapeChapterList,
  rewriteSourceUrl, ProgressBar, sleep, closeBrowser,
} from './lib/local-import-utils.mjs';

import fs from 'fs';
import path from 'path';

// ─── Init ─────────────────────────────────────────────────────────

loadEnv();
const sb = initSupabase();

const args = process.argv.slice(2);
const TOP_N = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '0', 10);
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const OUTPUT_NAME = args.find(a => a.startsWith('--output='))?.split('=')[1] || 'smart-filter-report';

const proxyPool = new ProxyPool(false); // Direct mode for manga page scrape (residential IP)
proxyPool.init();

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Load all chapters WITHOUT images, grouped by manga_id.
 * Returns: Map<manga_id, { manga: {...}, chapters: [...] }>
 */
async function loadEmptyChaptersGrouped() {
  console.log('🔍 Loading chapters without images...');

  // Step 1: Load all chapter_ids that HAVE images (for filtering)
  const hasImagesSet = new Set();
  let imgOffset = 0;
  while (imgOffset < 600_000) {
    const { data: imgBatch } = await sb
      .from('chapter_images')
      .select('chapter_id')
      .range(imgOffset, imgOffset + 99_999);
    if (!imgBatch || imgBatch.length === 0) break;
    for (const r of imgBatch) hasImagesSet.add(r.chapter_id);
    if (imgBatch.length < 100_000) break;
    imgOffset += 100_000;
  }
  console.log(`  📊 Chapters WITH images: ${hasImagesSet.size}`);

  // Step 2: Load all chapters, filter empty ones
  const grouped = new Map();
  let chOffset = 0;
  let totalLoaded = 0;
  let totalEmpty = 0;

  while (chOffset < 60_000) {
    const { data: batch } = await sb
      .from('chapters')
      .select('id, number, title, source_url, manga_id, manga:manga(slug, title, source_url)')
      .is('deleted_at', null)
      .order('manga_id', { ascending: true })
      .range(chOffset, chOffset + 999);
    if (!batch || batch.length === 0) break;

    totalLoaded += batch.length;

    for (const ch of batch) {
      if (!hasImagesSet.has(ch.id)) {
        totalEmpty++;
        const mangaId = ch.manga_id;

        if (!grouped.has(mangaId)) {
          const mangaData = Array.isArray(ch.manga) ? ch.manga[0] : ch.manga;
          const rawSourceUrl = mangaData?.source_url || ch.source_url || 'https://04x-1s.manhwaland.land';
          const rewrittenUrl = rewriteSourceUrl(rawSourceUrl);
          let origin;
          try { origin = new URL(rewrittenUrl).origin; } catch { origin = 'https://04x-1s.manhwaland.land'; }

          grouped.set(mangaId, {
            manga_id: mangaId,
            manga: mangaData,
            source_origin: origin,
            chapters: [],
          });
        }

        grouped.get(mangaId).chapters.push({
          id: ch.id,
          number: ch.number,
          title: ch.title,
          source_url: ch.source_url,
        });
      }
    }

    if (batch.length < 1000) break;
    chOffset += 1000;
  }

  console.log(`  📚 Total chapters loaded: ${totalLoaded}`);
  console.log(`  📂 Chapters WITHOUT images: ${totalEmpty}`);
  console.log(`  📖 Unique manga with empty chapters: ${grouped.size}`);

  return grouped;
}

/**
 * Scrape manga source page → extract real chapter list.
 * Returns array of { number, url, title } from source.
 */
async function scrapeSourceChapters(mangaEntry) {
  const slug = mangaEntry.manga?.slug;
  if (!slug) return [];

  const mangaPageUrl = `${mangaEntry.source_origin}/manga/${slug}/`;

  try {
    const { html } = await fetchHtmlWithChapterFallback(mangaPageUrl, proxyPool, {
      maxRetries: 2,
      timeoutMs: 30_000,
      delayMs: 2000,
    });

    const chapters = scrapeChapterList(html);
    return chapters;
  } catch (err) {
    return [];
  }
}

/**
 * Cross-reference DB chapters with source chapters.
 * Returns: { fixable: [...], missing: [...] }
 */
function crossReference(dbChapters, sourceChapters) {
  // Build source chapter number → URL map
  const sourceMap = new Map();
  for (const sc of sourceChapters) {
    if (!isNaN(sc.number)) {
      sourceMap.set(String(sc.number), sc.url);
      sourceMap.set(String(parseFloat(sc.number)), sc.url);
    }
  }

  const fixable = [];
  const missing = [];

  for (const dbCh of dbChapters) {
    const numStr = String(dbCh.number);
    const floatStr = String(parseFloat(dbCh.number));
    const intStr = String(Math.floor(dbCh.number));

    // Check if this chapter number exists on source
    const sourceUrl = sourceMap.get(numStr) || sourceMap.get(floatStr) || sourceMap.get(intStr);

    if (sourceUrl) {
      fixable.push({ ...dbCh, source_url: sourceUrl });
    } else {
      missing.push(dbCh);
    }
  }

  return { fixable, missing };
}

// ─── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('  SMART FILTER: Identify Fixable vs Metadata-Only Manga');
  console.log('═'.repeat(70));

  // Load empty chapters grouped by manga
  const grouped = await loadEmptyChaptersGrouped();

  // Convert to array and sort by empty chapter count (most empty first)
  let mangaList = [...grouped.values()].sort((a, b) => b.chapters.length - a.chapters.length);

  // Apply --manga filter
  if (MANGA_FILTER) {
    mangaList = mangaList.filter(m => m.manga?.slug === MANGA_FILTER);
    if (mangaList.length === 0) {
      console.error(`❌ Manga not found or has no empty chapters: "${MANGA_FILTER}"`);
      process.exit(1);
    }
  }

  // Apply --top filter
  if (TOP_N > 0 && mangaList.length > TOP_N) {
    console.log(`\n🎯 Limiting to top ${TOP_N} manga (by empty chapter count)`);
    mangaList = mangaList.slice(0, TOP_N);
  }

  console.log(`\n🔍 Scanning ${mangaList.length} manga on source...\n`);

  const results = [];
  const progress = new ProgressBar(mangaList.length, 'Scanning');

  for (const entry of mangaList) {
    const slug = entry.manga?.slug || 'unknown';
    const title = entry.manga?.title || slug;

    // Scrape source chapter list
    const sourceChapters = await scrapeSourceChapters(entry);

    // Cross-reference
    const { fixable, missing } = crossReference(entry.chapters, sourceChapters);

    const isFixable = fixable.length > 0;
    const isMetadataOnly = sourceChapters.length <= 1 && entry.chapters.length > 1;

    results.push({
      manga_id: entry.manga_id,
      slug,
      title,
      source_origin: entry.source_origin,
      source_chapter_count: sourceChapters.length,
      db_empty_count: entry.chapters.length,
      fixable_count: fixable.length,
      missing_count: missing.length,
      is_fixable: isFixable,
      is_metadata_only: isMetadataOnly,
      fixable_chapters: fixable,
    });

    const icon = isFixable ? '✅' : (isMetadataOnly ? '📋' : '⚠️');
    progress.tick(true, false);

    if (results.length % 5 === 0 || !isFixable) {
      console.log(`  ${icon} ${title.substring(0, 40)} — source: ${sourceChapters.length}ch, DB empty: ${entry.chapters.length}, fixable: ${fixable.length}`);
    }

    // Small delay between manga page scrapes (avoid rate limit)
    await sleep(1500);
  }

  progress.done();

  // ─── Summary ──────────────────────────────────────────────────

  const fixableManga = results.filter(r => r.is_fixable);
  const metadataOnly = results.filter(r => r.is_metadata_only);
  const totalFixableChapters = fixableManga.reduce((sum, r) => sum + r.fixable_count, 0);
  const totalMetadataOnlyChapters = metadataOnly.reduce((sum, r) => sum + r.db_empty_count, 0);

  console.log('\n' + '═'.repeat(70));
  console.log('  📊 SMART FILTER RESULTS');
  console.log('═'.repeat(70));
  console.log(`  Manga scanned          : ${results.length}`);
  console.log(`  ✅ Fixable manga       : ${fixableManga.length} (${totalFixableChapters} chapters can be backfilled)`);
  console.log(`  📋 Metadata-only manga : ${metadataOnly.length} (${totalMetadataOnlyChapters} chapters — source doesn't have them)`);
  console.log(`  ⚠️  Other (source down?) : ${results.length - fixableManga.length - metadataOnly.length}`);
  console.log('═'.repeat(70));

  // Top 20 fixable manga
  console.log('\n📖 Top 20 Fixable Manga:');
  fixableManga
    .sort((a, b) => b.fixable_count - a.fixable_count)
    .slice(0, 20)
    .forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.title.substring(0, 45)} — ${r.fixable_count} fixable (source: ${r.source_chapter_count}ch)`);
    });

  // Save report
  const reportDir = path.join(process.cwd(), 'scripts', 'data');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, `${OUTPUT_NAME}.json`);
  const report = {
    generated_at: new Date().toISOString(),
    summary: {
      manga_scanned: results.length,
      fixable_manga: fixableManga.length,
      metadata_only_manga: metadataOnly.length,
      total_fixable_chapters: totalFixableChapters,
      total_metadata_only_chapters: totalMetadataOnlyChapters,
    },
    fixable_manga: fixableManga.sort((a, b) => b.fixable_count - a.fixable_count),
    metadata_only: metadataOnly.map(r => ({ slug: r.slug, title: r.title, db_empty: r.db_empty_count })),
  };

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Report saved to: ${reportPath}`);

  // Generate backfill command for fixable manga
  if (fixableManga.length > 0) {
    console.log('\n💡 To backfill fixable manga:');
    console.log('   npm run import:local:smart-backfill');
    console.log(`   # Or run specific manga:`);
    const top5 = fixableManga.sort((a, b) => b.fixable_count - a.fixable_count).slice(0, 5);
    for (const m of top5) {
      console.log(`   npm run import:local:backfill -- --manga=${m.slug}`);
    }
  }

  await closeBrowser();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  closeBrowser().finally(() => process.exit(1));
});