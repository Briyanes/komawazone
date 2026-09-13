#!/usr/bin/env node
/**
 * fix-gmbr-covers-to-r2.mjs
 *
 * Fixes manga covers pointing to gmbr.pro (403 anti-hotlink).
 * Extracts og:image from source page, downloads, uploads to R2, updates DB.
 *
 * Usage:
 *   node scripts/fix-gmbr-covers-to-r2.mjs              # fix all
 *   node scripts/fix-gmbr-covers-to-r2.mjs --dry-run    # preview only
 *   node scripts/fix-gmbr-covers-to-r2.mjs --slug=yixuan-8217-s-lesson-for-today
 */

import {
  loadEnv, initSupabase, initR2, ProxyPool,
  fetchHtmlViaBrowser, downloadImage,
  rewriteSourceUrl, sleep, closeBrowser,
} from './lib/local-import-utils.mjs';

// ─── CLI Args ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];

/**
 * Extract cover URL from og:image meta tag (most reliable for manhwaland).
 * Falls back to twitter:image or .summary_image/.thumb img.
 */
function extractCoverUrl(html) {
  // 1. og:image meta tag
  const og = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
  if (og) return og[1];

  // 2. Twitter image meta
  const tw = html.match(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i);
  if (tw) return tw[1];

  // 3. First img inside .summary_image / .thumb
  const sm = html.match(/class=["'][^"']*(?:summary_image|thumb)[^"']*["'][^>]*>[\s\S]{0,500}?<img[^>]+(?:data-src|src)=["']([^"']+)["']/i);
  if (sm) return sm[1];

  return null;
}

async function main() {
  loadEnv();
  const sb = initSupabase();
  const r2 = initR2();

  let query = sb.from('manga')
    .select('id, slug, title, cover_url, source_url')
    .like('cover_url', '%gmbr.pro%')
    .is('deleted_at', null);

  if (slugArg) query = query.eq('slug', slugArg);

  const { data: mangaList, error } = await query;
  if (error) {
    console.error('❌ Query error:', error.message);
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🔧 FIX GMBR.PRO COVERS → R2`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  Manga to fix: ${mangaList.length}`);
  console.log(`  Mode: ${DRY_RUN ? 'DRY-RUN (preview)' : 'LIVE (upload + update DB)'}`);
  console.log(`${'═'.repeat(60)}\n`);

  if (mangaList.length === 0) {
    console.log('✅ No manga with gmbr.pro covers found!');
    return;
  }

  const proxyPool = new ProxyPool();
  proxyPool.init();

  let fixed = 0;
  let failed = 0;

  for (const manga of mangaList) {
    console.log(`\n─ ${manga.slug} ─────────────────────────`);
    console.log(`  Title:    ${manga.title}`);
    console.log(`  Old URL:  ${manga.cover_url}`);
    console.log(`  Source:   ${manga.source_url || '(none)'}`);

    if (DRY_RUN) {
      console.log('  [DRY-RUN] Skip download');
      continue;
    }

    if (!manga.source_url) {
      console.error('  ❌ No source_url — cannot scrape cover');
      failed++;
      continue;
    }

    try {
      const sourceUrl = rewriteSourceUrl(manga.source_url);
      console.log(`  → Fetching manga page: ${sourceUrl}`);

      const { html, statusCode } = await fetchHtmlViaBrowser(sourceUrl, { timeoutMs: 30_000 });
      if (!html || statusCode >= 400) {
        console.error(`  ❌ Failed to fetch page (HTTP ${statusCode})`);
        failed++;
        continue;
      }

      const coverUrl = extractCoverUrl(html);
      if (!coverUrl) {
        console.error('  ❌ No cover found (og:image / summary_image)');
        failed++;
        continue;
      }

      console.log(`  → Found cover: ${coverUrl}`);

      const { buffer, contentType } = await downloadImage(coverUrl, proxyPool, {
        maxRetries: 3,
        timeoutMs: 30_000,
        refererUrl: sourceUrl,
        useBrowserFallback: true,
      });

      if (!buffer || buffer.length === 0) {
        console.error('  ❌ Download returned empty buffer');
        failed++;
        continue;
      }

      const ext = contentType.includes('webp') ? 'webp'
        : contentType.includes('png') ? 'png'
        : 'jpg';
      const r2Key = `covers/${manga.id}.${ext}`;

      const publicUrl = await r2.upload(buffer, contentType, r2Key);
      console.log(`  ✅ Uploaded to R2: ${publicUrl} (${(buffer.length / 1024).toFixed(1)} KB)`);

      const { error: updateError } = await sb.from('manga')
        .update({ cover_url: publicUrl })
        .eq('id', manga.id);

      if (updateError) {
        console.error(`  ❌ DB update failed: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✅ DB updated: cover_url = ${publicUrl}`);
        fixed++;
      }

      await sleep(1000);
    } catch (err) {
      console.error(`  ❌ Error: ${err.message}`);
      failed++;
    }
  }

  await closeBrowser();

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  📊 SUMMARY`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`  ✅ Fixed:  ${fixed}`);
  console.log(`  ❌ Failed: ${failed}`);
  console.log(`  Total:    ${mangaList.length}`);
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});