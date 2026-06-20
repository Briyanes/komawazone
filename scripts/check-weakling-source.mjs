import { gotScraping } from 'got-scraping';

const url = 'https://04x.manhwaland.land/manga/from-weakling-to-nemesis/chapter-1/';
console.log('Fetching:', url);

try {
  const r = await gotScraping({
    url,
    responseType: 'text',
    timeout: { request: 25000 },
    headerGeneratorOptions: {
      browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
      devices: ['desktop'],
      operatingSystems: ['macos'],
      locales: ['id-ID', 'en-US'],
    },
  });

  console.log('Status:', r.statusCode);
  console.log('HTML length:', r.body.length);

  if (r.body.includes('Just a moment') || r.body.includes('cf_chl_opt')) {
    console.log('❌ BLOCKED by Cloudflare');
    process.exit(0);
  }

  // Parse ts_reader
  const m = r.body.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (m) {
    const data = JSON.parse(m[1]);
    const images = data?.sources?.[0]?.images ?? [];
    console.log('\n✅ ts_reader found!');
    console.log('Total images from source:', images.length);
    console.log('First 5:');
    images.slice(0, 5).forEach((u, i) => console.log(`  ${i + 1}. ${u}`));
    console.log('Last 3:');
    images.slice(-3).forEach((u, i) => console.log(`  ${images.length - 2 + i}. ${u}`));
  } else {
    console.log('\n❌ No ts_reader found');
    // Count img in reading-content
    const imgMatches = r.body.match(/<img[^>]+src=["'][^"']+["']/gi) || [];
    console.log('Total <img> tags:', imgMatches.length);
    
    // Check entry-content
    const contentMatch = r.body.match(/class="[^"]*entry-content[^"]*"/);
    console.log('Has entry-content:', contentMatch ? 'YES' : 'NO');
  }
} catch (e) {
  console.log('Error:', e.message);
}
