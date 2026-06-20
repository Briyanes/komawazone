import { gotScraping } from 'got-scraping';

// Get manga page to find chapter URLs
const mangaUrl = 'https://04x.manhwaland.land/manga/from-weakling-to-nemesis/';
console.log('Fetching manga page:', mangaUrl);

const r = await gotScraping({
  url: mangaUrl,
  responseType: 'text',
  timeout: { request: 15000 },
  headerGeneratorOptions: {
    browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
    devices: ['desktop'],
    operatingSystems: ['macos'],
  },
});

console.log('Status:', r.statusCode);

// Find chapter links
const chapterLinks = r.body.match(/href="([^"]*chapter[^"]*)"/gi) || [];
console.log('\nChapter links found:', chapterLinks.length);
console.log('First 3:');
chapterLinks.slice(0, 3).forEach(l => console.log('  ', l));
console.log('Last 3:');
chapterLinks.slice(-3).forEach(l => console.log('  ', l));

// Try chapter-1 URL  
const ch1Match = chapterLinks.find(l => l.includes('chapter-1"') || l.includes('chapter-1/'));
if (ch1Match) {
  const url = ch1Match.match(/href="([^"]*)"/)?.[1];
  console.log('\nChapter 1 URL:', url);
  
  // Fetch it
  const r2 = await gotScraping({
    url,
    responseType: 'text',
    timeout: { request: 15000 },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
      devices: ['desktop'],
      operatingSystems: ['macos'],
    },
  });
  console.log('Chapter 1 status:', r2.statusCode);
  
  // Parse ts_reader
  const m = r2.body.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (m) {
    const data = JSON.parse(m[1]);
    const images = data?.sources?.[0]?.images ?? [];
    console.log('✅ Total images in Chapter 1:', images.length);
    console.log('First 5:', images.slice(0, 5));
  } else {
    // Count images in entry-content
    const contentMatch = r2.body.match(/<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (contentMatch) {
      const imgs = contentMatch[1].match(/<img[^>]+src=["']([^"']+)["']/gi) || [];
      console.log('Images in entry-content:', imgs.length);
    }
    console.log('No ts_reader found. HTML length:', r2.body.length);
  }
}
