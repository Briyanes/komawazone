#!/usr/bin/env node
/**
 * Test chapter parsing from a manga source page.
 */
import { gotScraping } from 'got-scraping';

const url = 'https://04x.manhwaland.land/manga/share-boy-friend/';
console.log('Fetching:', url);

const response = await gotScraping({
  url,
  responseType: 'text',
  timeout: { request: 20000 },
  retry: { limit: 0 },
  headerGeneratorOptions: {
    browsers: [{ name: 'chrome', minVersion: 112 }],
    devices: ['desktop'],
    operatingSystems: ['macos'],
  },
});

console.log('Status:', response.statusCode);
console.log('Body length:', response.body.length);

const html = response.body;

// Check if blocked
if (html.length < 2000) {
  console.log('⚠️  Page too short — likely blocked');
  process.exit(1);
}

// Parse chapters — eplister/chapterlist format
const chapters = [];

// Try eplister format: <li data-num="N">...<a href="URL">...<span class="chapternum">Title</span>
const liRe = /<li[^>]+data-num="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/li>/gi;
let m;
while ((m = liRe.exec(html)) !== null) {
  const dataNum = parseFloat(m[1]);
  const block = m[2];
  const aMatch = block.match(/<a[^>]+href="([^"]+)"[^>]*>/i);
  const chUrl = aMatch ? aMatch[1].trim() : '';
  const titleMatch = block.match(/<span[^>]+class="chapternum"[^>]*>([^<]+)/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Ch ' + dataNum;
  chapters.push({ num: dataNum, title, url: chUrl });
}

console.log('\nFound', chapters.length, 'chapters:');
for (const c of chapters) {
  console.log(`  Ch ${c.num} — ${c.title}`);
  console.log(`    URL: ${c.url}`);
}

// Also extract cover for verification
const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i);
console.log('\nCover on source page:', wpPostImg?.[1] || 'not found');