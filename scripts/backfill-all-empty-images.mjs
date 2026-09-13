#!/usr/bin/env node
/**
 * Batch: Scrape + Download + Upload to R2 for ALL chapters with 0 images.
 *
 * FLOW:
 *   1. Query DB for chapters with 0 images in chapter_images table
 *   2. For each chapter: scrape HTML via proxy → extract CDN image URLs
 *   3. Download each image via proxy → upload to R2
 *   4. Store R2 URLs in chapter_images table
 *
 * DOWNLOAD STRATEGY (v3 — CF bypass via chapter-page intercept):
 *   PRIMARY: downloadImagesFromChapterPage() — navigates to chapter page,
 *            browser intercepts <img> loads with CF cookies. Best for gmbr.pro.
 *   FALLBACK: downloadImage() per-image with DNS/403 browser fallback.
 *
 * Usage:
 *   node scripts/backfill-all-empty-images.mjs                    # All (uses proxy)
 *   node scripts/backfill-all-empty-images.mjs --manga=SLUG        # Single manga
 *   node scripts/backfill-all-empty-images.mjs --limit=100         # Max chapters
 *   node scripts/backfill-all-empty-images.mjs --concurrency=5     # Parallel chapters
 *   node scripts/backfill-all-empty-images.mjs --direct            # No proxy (MacBook IP)
 *   node scripts/backfill-all-empty-images.mjs --dry-run           # Just scrape, no R2
 */

import {
  loadEnv, initSupabase, initR2, ProxyPool,
  fetchHtml, fetchHtmlWithChapterFallback, downloadImage,
  downloadImagesFromChapterPage, parseChapterImages,
  rewriteSourceUrl, ProgressBar, sleep, ServerError,
  closeBrowser,
} from './lib/local-import-utils.mjs';

// Load env vars from .env.local FIRST
loadEnv();

const sb = initSupabase();

// Parse args
const args = process.argv.slice(2);
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const LIMIT = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const CONCURRENCY = parseInt(args.find(a => a.startsWith('--concurrency='))?.split('=')[1] || '5', 10);
const DRY_RUN = args.includes('--dry-run');
const DIRECT = args.includes('--direct');

// ─── Initialize proxy + R2 ────────────────────────────────────────

const proxyPool = new ProxyPool(DIRECT ? false : true);
if (!DIRECT) {
  proxyPool.enabled = true; // Force enable
  proxyPool.init();
  if (!process.env.PROXY_LIST) {
    console.log('  ℹ️  Using FALLBACK Webshare proxies (from local-import-utils.mjs)');
  }
} else {
  proxyPool.init();
}

let r2 = null;
if (!DRY_RUN) {
  r2 = initR2();
  console.log('✅ R2 client initialized');
} else {
  console.log('⚠️  DRY RUN — images will be scraped but NOT downloaded/uploaded');
}

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Cache of manga-page-scraped chapter URLs.
 * Key: manga_id → Map<chapterNumber_string, sourceUrl>
 * Avoids re-scraping manga page for every chapter.
 */
const mangaChapterUrlCache = new Map();

/**
 * Scrape manga page to extract ALL real chapter URLs.
 * Returns Map<number, url> — much more reliable than guessing URLs.
 *
 * Manga page URL format: {origin}/manga/{slug}/
 * Chapter links on page: href="...{slug}-chapter-{N}..."
 */
async function scrapeMangaChapterUrls(ch) {
  const mangaId = ch.manga_id;
  if (mangaChapterUrlCache.has(mangaId)) {
    return mangaChapterUrlCache.get(mangaId);
  }

  const slug = ch.manga?.slug || ch.manga_slug;
  const origin = ch.source_origin || 'https://04x-1s.manhwaland.land';
  const mangaPageUrl = `${origin}/manga/${slug}/`;

  const chapterMap = new Map();

  try {
    const { html } = await fetchHtmlWithChapterFallback(mangaPageUrl, proxyPool, {
      maxRetries: 2,
      timeoutMs: 30_000,
      delayMs: 2000,
    });

    // Extract all chapter URLs from manga page
    // Pattern: href="...{slug}-chapter-{NUMBER}..." or href="...chapter-{NUMBER}..."
    const chapterUrlPattern = /href="(https?:\/\/[^"]*?-chapter-([^"\/]+)\/?)"/gi;
    let match;
    while ((match = chapterUrlPattern.exec(html)) !== null) {
      const url = rewriteSourceUrl(match[1]);
      const numStr = match[2];

      // Parse chapter number (handle "160-end", "0", "1-0", decimals)
      const parsed = parseFloat(numStr);
      if (!isNaN(parsed)) {
        // Also store the exact string for exact matching
        chapterMap.set(String(parsed), url);
        chapterMap.set(numStr, url);
      }
    }

    // Also extract data-num attributes (manhwaland uses these in JS)
    const dataNumPattern = /data-num="([^"]+)"/gi;
    while ((match = dataNumPattern.exec(html)) !== null) {
      const numStr = match[1];
      const parsed = parseFloat(numStr);
      if (!isNaN(parsed) && !chapterMap.has(String(parsed))) {
        // Try to find the corresponding href near this element
        // (The href is typically in the same <a> or <li> parent)
      }
    }

    console.log(`  📚 Manga page scraped: ${chapterMap.size} chapters found for "${slug}"`);
  } catch (err) {
    console.warn(`  ⚠️  Failed to scrape manga page for "${slug}": ${err.message}`);
  }

  mangaChapterUrlCache.set(mangaId, chapterMap);
  return chapterMap;
}

function buildCandidateUrls(ch, chapterMap) {
  const candidates = [];

  // STRATEGY 1: Use scraped chapter URL map (most reliable)
  if (chapterMap && chapterMap.size > 0) {
    // Try exact number match
    const exact = chapterMap.get(String(ch.number));
    if (exact) candidates.push(exact);

    // Try float variations
    const floatMatch = chapterMap.get(String(parseFloat(ch.number)));
    if (floatMatch) candidates.push(floatMatch);

    // Try integer match (if ch.number is 1.0, try "1")
    const intNum = Math.floor(ch.number);
    const intMatch = chapterMap.get(String(intNum));
    if (intMatch) candidates.push(intMatch);
  }

  // STRATEGY 2: Use stored source_url
  if (ch.source_url) {
    candidates.push(rewriteSourceUrl(ch.source_url));
  }

  // STRATEGY 3: Fallback URL guessing (last resort)
  const sourceOrigin = ch.source_origin || 'https://04x-1s.manhwaland.land';
  const slug = ch.manga?.slug || ch.manga_slug;
  if (slug) {
    const intNum = Math.floor(ch.number);
    const paddedNum = String(intNum).padStart(2, '0');
    candidates.push(`${sourceOrigin}/${slug}-chapter-${ch.number}/`);
    candidates.push(`${sourceOrigin}/${slug}-chapter-${intNum}/`);
    if (intNum < 100) {
      candidates.push(`${sourceOrigin}/${slug}-chapter-${paddedNum}/`);
    }
  }

  return [...new Set(candidates)];
}

async function scrapeChapter(ch) {
  // Step 1: Scrape manga page to get real chapter URLs (cached per manga)
  const chapterMap = await scrapeMangaChapterUrls(ch);

  // Step 2: Build candidate URLs using the map
  const candidates = buildCandidateUrls(ch, chapterMap);

  for (const url of candidates) {
    try {
      // Use browser fallback for JS-rendered chapter lists (manhwaland uses jQuery/AJAX)
      const { html, usedBrowser } = await fetchHtmlWithChapterFallback(url, proxyPool, {
        maxRetries: 2,
        timeoutMs: 25_000,
        delayMs: 1500,
      });
      const images = parseChapterImages(html);
      if (images.length > 0) {
        if (usedBrowser) {
          console.log(`  🌐 Chapter HTML via browser (JS rendered)`);
        }
        return { images, matchedUrl: url };
      }
    } catch {
      // try next candidate
    }
  }
  return { images: [], matchedUrl: null };
}

async function processChapterImage(ch, imageUrl, idx, chapterUrl) {
  // Download via proxy (with browser fallback for 403/DNS errors)
  const { buffer, contentType } = await downloadImage(imageUrl, proxyPool, {
    maxRetries: 3,
    timeoutMs: 30_000,
    delayMs: 2000,
    refererUrl: chapterUrl,
  });

  // Upload to R2
  const ext = (contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split(';')[0];
  const slug = ch.manga?.slug || ch.manga_slug || 'unknown';
  const key = `chapters/${slug}/${ch.number}/${String(idx + 1).padStart(3, '0')}.${ext}`;

  const r2Path = await r2.upload(buffer, contentType, key);
  return r2Path;
}

async function processChapter(ch, progress) {
  try {
    // Step 1: Scrape image URLs
    const { images, matchedUrl } = await scrapeChapter(ch);

    if (images.length === 0) {
      progress.tick(false, false);
      return { chapterId: ch.id, number: ch.number, status: 'no_images' };
    }

    // DRY RUN: just report found URLs
    if (DRY_RUN) {
      progress.tick(true, false);
      return { chapterId: ch.id, number: ch.number, status: 'dry_run', imageCount: images.length };
    }

    // Step 2: Download + upload to R2
    // PRIMARY: downloadImagesFromChapterPage (intercept <img> loads from chapter page)
    // This is the most reliable method for CF-protected CDNs (gmbr.pro etc.)
    // because the browser gets cf_clearance cookies from the chapter page navigation.
    const r2Urls = [];
    let failedImages = 0;
    let consecutiveServerErrors = 0;
    let usedChapterPageIntercept = false;

    if (matchedUrl && images.length > 0) {
      try {
        console.log(`  🌐 Trying chapter-page intercept (${images.length} images)...`);
        const results = await downloadImagesFromChapterPage(matchedUrl, images, {
          timeoutMs: 120_000,
          onProgress: (done, total) => {
            if (done % 5 === 0 || done === total) {
              process.stdout.write(`\r  📸 Intercept: ${done}/${total}  `);
            }
          },
        });

        // Upload captured buffers to R2
        for (let i = 0; i < results.length; i++) {
          if (results[i]) {
            try {
              const ext = (results[i].contentType.split('/')[1] || 'jpg').replace('jpeg', 'jpg').split(';')[0];
              const slug = ch.manga?.slug || ch.manga_slug || 'unknown';
              const key = `chapters/${slug}/${ch.number}/${String(r2Urls.length + 1).padStart(3, '0')}.${ext}`;
              const r2Path = await r2.upload(results[i].buffer, results[i].contentType, key);
              r2Urls.push(r2Path);
            } catch (err) {
              failedImages++;
            }
          } else {
            failedImages++;
          }
        }
        usedChapterPageIntercept = r2Urls.length > 0;
        if (usedChapterPageIntercept) {
          console.log(`  ✅ Intercept captured ${r2Urls.length}/${images.length} images`);
        }
      } catch (err) {
        console.log(`  ⚠️  Intercept failed: ${err.message} — falling back to per-image download`);
      }
    }

    // FALLBACK: Per-image download (for images not captured by intercept)
    const missingIdx = [];
    if (usedChapterPageIntercept) {
      // Find images that weren't captured
      for (let i = 0; i < images.length; i++) {
        // If we got fewer results than images, some are missing
        if (r2Urls.length < images.length && i >= r2Urls.length) {
          missingIdx.push(i);
        }
      }
    } else if (r2Urls.length === 0) {
      // Intercept didn't work at all — download all images individually
      for (let i = 0; i < images.length; i++) missingIdx.push(i);
    }

    for (const i of missingIdx) {
      try {
        const r2Path = await processChapterImage(ch, images[i], i, matchedUrl || images[0]);
        r2Urls.push(r2Path);
        consecutiveServerErrors = 0;
      } catch (err) {
        failedImages++;

        // Smart-skip: If CDN returns repeated 5xx (server down), skip remaining images
        if (err instanceof ServerError) {
          consecutiveServerErrors++;
          if (consecutiveServerErrors >= 3) {
            console.log(`    ⏭️  Ch${ch.number}: CDN appears down (${err.statusCode}), skipping remaining ${missingIdx.length - missingIdx.indexOf(i) - 1} images`);
            break;
          }
        }

        // If we already got some images, continue; else fail chapter
        if (r2Urls.length === 0 && err instanceof ServerError) {
          progress.tick(false, false);
          return { chapterId: ch.id, number: ch.number, status: 'cdn_down', statusCode: err.statusCode };
        }
      }
      await sleep(300); // Small delay between images
    }

    if (r2Urls.length === 0) {
      progress.tick(false, false);
      return { chapterId: ch.id, number: ch.number, status: 'all_failed' };
    }

    // Step 3: Insert R2 URLs to DB
    const imageRows = r2Urls.map((url, idx) => ({
      chapter_id: ch.id,
      image_url: url,
      number: idx + 1,
    }));

    const { error: insertErr } = await sb
      .from('chapter_images')
      .upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

    if (insertErr) {
      console.log(`  ❌ Ch${ch.number}: DB insert error: ${insertErr.message}`);
      progress.tick(false, false);
      return { chapterId: ch.id, number: ch.number, status: 'db_error', error: insertErr.message };
    }

    // Update chapter thumbnail + source_url
    const thumb = r2Urls.length >= 5 ? r2Urls[4] : r2Urls[r2Urls.length - 1];
    const chapterUpdate = { thumbnail_url: thumb };
    if (matchedUrl) chapterUpdate.source_url = matchedUrl;
    await sb.from('chapters').update(chapterUpdate).eq('id', ch.id);

    progress.tick(true, false);
    return {
      chapterId: ch.id,
      number: ch.number,
      status: 'success',
      imageCount: r2Urls.length,
      failedImages,
    };
  } catch (err) {
    progress.tick(false, false);
    return { chapterId: ch.id, number: ch.number, status: 'error', error: err.message };
  }
}

// ─── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('  BATCH BACKFILL: All Empty Chapter Images → R2 Download');
  console.log('═'.repeat(70));
  console.log(`  🎯 Mode: ${DRY_RUN ? 'DRY RUN' : 'FULL (scrape + download + R2)'}`);
  console.log(`  📡 Proxy: ${proxyPool.enabled ? 'ENABLED' : 'DIRECT (MacBook IP)'}`);
  console.log(`  ⚡ Concurrency: ${CONCURRENCY} chapters in parallel`);
  if (MANGA_FILTER) console.log(`  🎯 Manga filter: ${MANGA_FILTER}`);
  if (LIMIT > 0) console.log(`  🔢 Limit: ${LIMIT} chapters`);

  // ─── Load chapters with 0 images ──────────────────────────────
  console.log('\n🔍 Loading chapters from DB...');

  let allChapters = [];
  if (MANGA_FILTER) {
    const { data: mangaData } = await sb
      .from('manga')
      .select('id, slug, title, source_url')
      .eq('slug', MANGA_FILTER)
      .single();

    if (!mangaData) {
      console.error(`❌ Manga not found: "${MANGA_FILTER}"`);
      process.exit(1);
    }
    console.log(`📖 Manga: ${mangaData.title} (${mangaData.slug})`);

    let offset = 0;
    while (true) {
      const { data: batch } = await sb
        .from('chapters')
        .select('id, number, title, source_url, manga_id')
        .eq('manga_id', mangaData.id)
        .is('deleted_at', null)
        .order('number', { ascending: true })
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      for (const ch of batch) {
        ch.manga = mangaData;
        // IMPORTANT: Apply rewriteSourceUrl() so dead domains (04x.manhwaland.land)
        // get rewritten to active domain (04x-1s.manhwaland.land) BEFORE building candidate URLs
        const rawSourceUrl = ch.source_url || mangaData.source_url || 'https://04x-1s.manhwaland.land';
        const rewrittenSourceUrl = rewriteSourceUrl(rawSourceUrl);
        ch.source_origin = (() => { try { return new URL(rewrittenSourceUrl).origin; } catch { return 'https://04x-1s.manhwaland.land'; } })();
      }
      allChapters.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    console.log(`📚 Chapters for this manga: ${allChapters.length}`);
  } else {
    let offset = 0;
    while (offset < 60000) {
      const { data: batch } = await sb
        .from('chapters')
        .select('id, number, title, source_url, manga_id, manga:manga(slug, title, source_url)')
        .is('deleted_at', null)
        .order('manga_id', { ascending: true })
        .range(offset, offset + 999);
      if (!batch || batch.length === 0) break;
      for (const ch of batch) {
        // IMPORTANT: Apply rewriteSourceUrl() so dead domains get rewritten to active domain
        const rawSourceUrl = ch.source_url || ch.manga?.source_url || 'https://04x-1s.manhwaland.land';
        const rewrittenSourceUrl = rewriteSourceUrl(rawSourceUrl);
        ch.source_origin = (() => { try { return new URL(rewrittenSourceUrl).origin; } catch { return 'https://04x-1s.manhwaland.land'; } })();
      }
      allChapters.push(...batch);
      if (batch.length < 1000) break;
      offset += 1000;
    }
    console.log(`📚 Total chapters in DB: ${allChapters.length}`);
  }

  if (allChapters.length === 0) {
    console.log('❌ No chapters found');
    process.exit(1);
  }

  // ─── Filter: chapters WITHOUT images ──────────────────────────
  console.log('🔍 Finding chapters without images...');
  const { data: chaptersWithImages } = await sb
    .from('chapter_images')
    .select('chapter_id')
    .limit(200000);

  const hasImagesSet = new Set((chaptersWithImages || []).map(r => r.chapter_id));
  const emptyChapters = allChapters.filter(ch => !hasImagesSet.has(ch.id));

  if (emptyChapters.length === 0) {
    console.log('🎉 All chapters already have images!');
    process.exit(0);
  }

  // Apply limit
  const toProcess = LIMIT > 0 ? emptyChapters.slice(0, LIMIT) : emptyChapters;
  console.log(`📊 Chapters without images: ${emptyChapters.length}`);
  if (LIMIT > 0 && LIMIT < emptyChapters.length) {
    console.log(`   Processing first ${LIMIT} (use --limit=0 for all)`);
  }
  console.log('');

  // ─── Process with concurrency ─────────────────────────────────
  const progress = new ProgressBar(toProcess.length, 'Backfilling');
  const results = [];
  let currentManga = null;

  // Process in batches of CONCURRENCY
  for (let i = 0; i < toProcess.length; i += CONCURRENCY) {
    const batch = toProcess.slice(i, i + CONCURRENCY);

    // Print manga name when it changes
    const batchManga = batch[0]?.manga?.slug;
    if (batchManga !== currentManga) {
      currentManga = batchManga;
      const mangaTitle = batch[0]?.manga?.title || batchManga;
      console.log(`\n📖 [${i + 1}-${Math.min(i + CONCURRENCY, toProcess.length)}/${toProcess.length}] ${mangaTitle}`);
    }

    // Run batch in parallel
    const batchResults = await Promise.all(
      batch.map(ch => processChapter(ch, progress))
    );

    // Log results
    for (const r of batchResults) {
      const icon = r.status === 'success' ? '✅' :
                   r.status === 'dry_run' ? '🔍' :
                   r.status === 'no_images' ? '⚠️ ' : '❌';
      if (r.status === 'success') {
        const failInfo = r.failedImages > 0 ? ` (${r.failedImages} failed)` : '';
        console.log(`  ${icon} Ch${r.number}: ${r.imageCount} images${failInfo}`);
      } else if (r.status === 'dry_run') {
        console.log(`  ${icon} Ch${r.number}: found ${r.imageCount} source URLs`);
      } else if (r.status !== 'no_images') {
        console.log(`  ${icon} Ch${r.number}: ${r.status}${r.error ? ' — ' + r.error.substring(0, 60) : ''}`);
      }
    }

    results.push(...batchResults);

    // Small delay between batches
    await sleep(500);
  }

  progress.done();

  // ─── Summary ──────────────────────────────────────────────────
  const success = results.filter(r => r.status === 'success').length;
  const dryRun = results.filter(r => r.status === 'dry_run').length;
  const noImages = results.filter(r => r.status === 'no_images').length;
  const errors = results.filter(r => r.status === 'error' || r.status === 'all_failed' || r.status === 'cdn_down' || r.status === 'db_error').length;
  const totalImages = results.filter(r => r.imageCount).reduce((sum, r) => sum + r.imageCount, 0);

  console.log('\n' + '═'.repeat(70));
  console.log('  📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Processed    : ${results.length}`);
  console.log(`  ✅ Success   : ${success} (${totalImages.toLocaleString()} images downloaded)`);
  if (dryRun > 0) console.log(`  🔍 Dry Run   : ${dryRun}`);
  console.log(`  ⚠️  No Images : ${noImages}`);
  console.log(`  ❌ Errors    : ${errors}`);
  console.log('═'.repeat(70));

  if (noImages > 0) {
    console.log('\n💡 Chapters with "no_images" may have:');
    console.log('   - Source URL changed (domain migration)');
    console.log('   - Chapter not yet available on source');
    console.log('   - Anti-scraping protection (try --direct mode)');
  }

  await closeBrowser();
  process.exit(errors === results.length ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  closeBrowser().finally(() => process.exit(1));
});