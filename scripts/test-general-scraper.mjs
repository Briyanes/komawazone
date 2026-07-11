#!/usr/bin/env node
/**
 * test-general-scraper.mjs
 *
 * Test the updated Madara generic parser against multiple general (SFW) sources.
 * Verifies that title, description, cover, genres, author, status, and type
 * are all extracted correctly — not just for manhwaland.land.
 *
 * Usage:
 *   node scripts/test-general-scraper.mjs
 *   node scripts/test-general-scraper.mjs https://manhwaindo.my/manga/some-title/
 */

import { scrapeMangaFromUrl, parseChapterListFromHtml, scrapeChapterImages } from '../src/lib/scrapers/manga-scraper.ts';
import { detectMangaSource } from '../src/lib/scrapers/detector.ts';

// ─── Test URLs (General/SFW sources) ────────────────────────────────
const DEFAULT_TEST_URLS = [
  // manhwaindo.my — General/SFW manhwa
  'https://manhwaindo.my/manga/',
  // Add specific manga URLs below once confirmed accessible
];

async function testSingleUrl(url) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  🧪 Testing: ${url}`);
  console.log(`${'═'.repeat(60)}\n`);

  // 1. Detect source
  const source = detectMangaSource(url);
  console.log(`📌 Source detected: ${source ? `${source.name} (${source.country})` : '❌ NOT DETECTED'}`);
  if (source) {
    console.log(`   Type: ${source.type}`);
  }

  // 2. Scrape manga metadata
  try {
    console.log('\n⏳ Scraping manga metadata...');
    const scraped = await scrapeMangaFromUrl(url);
    console.log('\n✅ Scrape Results:');
    console.log(`   📖 Title:       "${scraped.title}"`);
    console.log(`   📝 Description: ${scraped.description.slice(0, 100)}${scraped.description.length > 100 ? '...' : ''}`);
    console.log(`   🖼️  Cover:       ${scraped.cover_url ? '✅ Found' : '❌ Missing'}`);
    console.log(`   🏷️  Genres:      ${scraped.genres.length > 0 ? scraped.genres.join(', ') : '(none)'}`);
    console.log(`   ✍️  Author:      ${scraped.author || '(not found)'}`);
    console.log(`   🎨 Artist:      ${scraped.artist || '(not found)'}`);
    console.log(`   📊 Status:      ${scraped.status}`);
    console.log(`   📦 Type:        ${scraped.type}`);

    // Score the result
    const fields = ['title', 'description', 'cover_url', 'genres', 'author', 'status', 'type'];
    const filled = fields.filter(f => scraped[f] && (Array.isArray(scraped[f]) ? scraped[f].length > 0 : true));
    const score = Math.round((filled.length / fields.length) * 100);
    console.log(`\n📊 Extraction Score: ${score}% (${filled.length}/${fields.length} fields)`);

    if (score === 100) {
      console.log('🎉 PERFECT — All fields extracted!');
    } else if (score >= 70) {
      console.log('✅ GOOD — Most fields extracted');
    } else {
      console.log('⚠️  PARTIAL — Some fields missing, may need source-specific parser');
    }
  } catch (err) {
    console.error(`\n❌ Scrape failed: ${err.message}`);
  }
}

async function main() {
  const urls = process.argv.slice(2);

  if (urls.length > 0) {
    // Test specific URLs passed via CLI
    for (const url of urls) {
      await testSingleUrl(url);
    }
  } else {
    console.log('═'.repeat(60));
    console.log('  🔍 General Source Scraper Test');
    console.log('═'.repeat(60));
    console.log('\n⚠️  No URL specified. Usage:');
    console.log('   node scripts/test-general-scraper.mjs <manga-url>');
    console.log('\n   Example:');
    console.log('   node scripts/test-general-scraper.mjs https://manhwaindo.my/manga/solo-leveling/');
    process.exit(0);
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log('  ✅ Test Complete');
  console.log(`${'═'.repeat(60)}\n`);
}

main().catch(err => {
  console.error('💥 Fatal error:', err);
  process.exit(1);
});