#!/usr/bin/env node
/**
 * Diagnostic: Investigate why 68 manga from fix-p1.txt get 0 chapters.
 * Fetches first 2 URLs and dumps HTML for analysis.
 */

import { loadEnv, fetchHtml, fetchHtmlViaBrowser, scrapeChapterList, ProxyPool, rewriteSourceUrl } from './lib/local-import-utils.mjs';
import fs from 'fs';

loadEnv();

const proxyPool = new ProxyPool(false);
proxyPool.init();

const urls = fs.readFileSync('fix-p1.txt', 'utf8')
  .split('\n')
  .filter(l => l.trim() && !l.startsWith('#'))
  .slice(0, 2);

console.log(`\n📊 Testing ${urls.length} URLs for chapter detection...\n`);

for (const rawUrl of urls) {
  const url = rewriteSourceUrl(rawUrl.trim());
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`URL: ${url}`);
  console.log(`${'═'.repeat(70)}`);

  // --- Step 1: Try undici (static fetch) ---
  console.log('\n━━━ Method 1: undici (static HTML) ━━━');
  let staticHtml = '';
  let staticStatus = 0;
  try {
    const result = await fetchHtml(url, proxyPool, { maxRetries: 1, timeoutMs: 20_000 });
    staticHtml = result.html;
    staticStatus = result.statusCode;
    console.log(`  Status: ${staticStatus}`);
    console.log(`  HTML size: ${staticHtml.length} bytes`);
    
    // Check for Cloudflare challenge
    if (staticHtml.includes('cf-challenge') || staticHtml.includes('Just a moment') || staticHtml.includes('cf-browser-verification')) {
      console.log(`  ⚠️ CLOUDFLARE CHALLENGE DETECTED!`);
    }
    if (staticHtml.includes('eplister')) console.log(`  ✅ Found 'eplister' class`);
    if (staticHtml.includes('chapterlist')) console.log(`  ✅ Found 'chapterlist' id`);
    if (staticHtml.includes('wp-manga-chapter')) console.log(`  ✅ Found 'wp-manga-chapter' class`);
    if (staticHtml.includes('data-num')) console.log(`  ✅ Found 'data-num' attribute`);
    
    // Dump HTML for inspection
    const dumpPath = `/tmp/diag-static-${url.split('/').slice(-2).join('-').replace(/[^a-z0-9]/gi, '')}.html`;
    fs.writeFileSync(dumpPath, staticHtml);
    console.log(`  📄 HTML dumped to: ${dumpPath}`);
  } catch (err) {
    console.log(`  ❌ Failed: ${err.message}`);
  }

  // --- Step 2: Run scrapeChapterList on static HTML ---
  const staticChapters = scrapeChapterList(staticHtml);
  console.log(`  Chapters found: ${staticChapters.length}`);

  // --- Step 3: Try Playwright browser ---
  console.log('\n━━━ Method 2: Playwright browser (JS render) ━━━');
  try {
    const browserResult = await fetchHtmlViaBrowser(url, { timeoutMs: 30_000 });
    const browserHtml = browserResult.html;
    console.log(`  Status: ${browserResult.statusCode}`);
    console.log(`  HTML size: ${browserHtml.length} bytes`);

    if (browserHtml.includes('cf-challenge') || browserHtml.includes('Just a moment')) {
      console.log(`  ⚠️ CLOUDFLARE CHALLENGE DETECTED in browser too!`);
    }
    if (browserHtml.includes('eplister')) console.log(`  ✅ Browser found 'eplister' class`);
    if (browserHtml.includes('chapterlist')) console.log(`  ✅ Browser found 'chapterlist' id`);
    if (browserHtml.includes('data-num')) console.log(`  ✅ Browser found 'data-num' attribute`);

    // Dump browser HTML
    const dumpPath = `/tmp/diag-browser-${url.split('/').slice(-2).join('-').replace(/[^a-z0-9]/gi, '')}.html`;
    fs.writeFileSync(dumpPath, browserHtml);
    console.log(`  📄 Browser HTML dumped to: ${dumpPath}`);

    // Extract section around 'chapter' or 'eplister'
    const chapterIdx = browserHtml.indexOf('eplister');
    if (chapterIdx === -1) {
      const altIdx = browserHtml.indexOf('chapterlist');
      if (altIdx !== -1) {
        console.log(`\n  📋 Context around 'chapterlist' (offset ${altIdx}):`);
        console.log(browserHtml.slice(Math.max(0, altIdx - 200), altIdx + 500));
      } else {
        console.log(`\n  ⚠️ Neither 'eplister' nor 'chapterlist' found in browser HTML!`);
        // Look for any chapter-like links
        const chapterLinkIdx = browserHtml.indexOf('chapter');
        if (chapterLinkIdx !== -1) {
          console.log(`  📋 Context around first 'chapter' mention:`);
          console.log(browserHtml.slice(Math.max(0, chapterLinkIdx - 200), chapterLinkIdx + 500));
        }
      }
    } else {
      console.log(`\n  📋 Context around 'eplister' (offset ${chapterIdx}):`);
      console.log(browserHtml.slice(chapterIdx, chapterIdx + 1000));
    }

    const browserChapters = scrapeChapterList(browserHtml);
    console.log(`  Browser chapters found: ${browserChapters.length}`);
  } catch (err) {
    console.log(`  ❌ Browser failed: ${err.message}`);
  }

  // Small delay between URLs
  await new Promise(r => setTimeout(r, 3000));
}

console.log('\n\n✅ Diagnostic complete. Check /tmp/diag-*.html for full HTML dumps.');
process.exit(0);