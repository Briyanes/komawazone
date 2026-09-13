#!/usr/bin/env node
/**
 * Test script: Verify Referer fix for browser fallback (HTTP 403 anti-hotlink bypass).
 *
 * Problem:
 *   - gmbr.pro CDN returns 403 for images without correct Referer
 *   - Previous code: browser fallback didn't set Referer → also 403
 *   - Fix: Pass refererUrl (chapter page URL) to downloadImageViaBrowser()
 *
 * Run: node scripts/test-referer-fix.mjs
 */

import {
  loadEnv,
  downloadImage,
  downloadImageViaBrowser,
  closeBrowser,
} from './lib/local-import-utils.mjs';

async function main() {
  await loadEnv();

  // A real gmbr.pro image from production (use a known-working chapter URL as referer)
  // Using the image from local-import test. This is a placeholder — will try multiple.
  const testCases = [
    {
      name: 'gmbr.pro with chapter referer',
      imageUrl: 'https://gmbr.pro/04x-1s.manhwaland.land/wp-content/uploads/2024/03/hyperstrong.jpg',
      refererUrl: 'https://04x-1s.manhwaland.land/manga/hyperstrong/',
    },
  ];

  const proxyPool = { pick: () => null, agentFor: () => undefined, markBad: () => {} };

  for (const tc of testCases) {
    console.log(`\n📋 Test: ${tc.name}`);
    console.log(`   Image:   ${tc.imageUrl}`);
    console.log(`   Referer: ${tc.refererUrl}`);

    // 1. Test full downloadImage() flow (undici → browser fallback)
    try {
      console.log('   ⏳ Testing downloadImage() (full flow with browser fallback)...');
      const result = await downloadImage(tc.imageUrl, proxyPool, {
        maxRetries: 2,
        timeoutMs: 15_000,
        refererUrl: tc.refererUrl,
        useBrowserFallback: true,
      });
      console.log(`   ✅ downloadImage() SUCCESS: ${result.buffer.length} bytes (${result.contentType})`);
    } catch (err) {
      console.log(`   ❌ downloadImage() FAILED: ${err.message}`);
    }

    // 2. Test browser fallback directly
    try {
      console.log('   ⏳ Testing downloadImageViaBrowser() directly with referer...');
      const result = await downloadImageViaBrowser(tc.imageUrl, {
        timeoutMs: 15_000,
        retries: 1,
        refererUrl: tc.refererUrl,
      });
      if (result) {
        console.log(`   ✅ downloadImageViaBrowser() SUCCESS: ${result.buffer.length} bytes (${result.contentType})`);
      } else {
        console.log(`   ❌ downloadImageViaBrowser() returned null`);
      }
    } catch (err) {
      console.log(`   ❌ downloadImageViaBrowser() ERROR: ${err.message}`);
    }

    // 3. Test browser WITHOUT referer (should fail — proving the fix is needed)
    try {
      console.log('   ⏳ Testing downloadImageViaBrowser() WITHOUT referer (baseline)...');
      const result = await downloadImageViaBrowser(tc.imageUrl, {
        timeoutMs: 15_000,
        retries: 1,
        // No refererUrl — should fail for anti-hotlink protected CDN
      });
      if (result) {
        console.log(`   ⚠️  No-referer succeeded too: ${result.buffer.length} bytes (CDN may not check referer)`);
      } else {
        console.log(`   📊 No-referer failed as expected (proves fix is needed)`);
      }
    } catch (err) {
      console.log(`   📊 No-referer error as expected: ${err.message}`);
    }
  }

  await closeBrowser();
  console.log('\n✅ Test complete');
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});