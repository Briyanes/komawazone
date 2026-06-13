#!/usr/bin/env node
import { gotScraping } from 'got-scraping';

const testUrl = 'https://gmbr.manhwaland.in/uploads/manga-images/b/boku-nerai-no-onee-san/chapter-1/1-67f8d6fa9a6a8.jpg';

(async () => {
  try {
    const r = await gotScraping({
      url: testUrl,
      responseType: 'buffer',
      timeout: { request: 15000 },
      retry: { limit: 0 },
      headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 112 }], devices: ['desktop'], operatingSystems: ['macos'] },
      headers: {
        Referer: 'https://04x.manhwaland.land/',
        Accept: 'image/*,*/*',
      },
    });
    console.log('Status:', r.statusCode);
    console.log('Content-Type:', r.headers['content-type']);
    console.log('Size:', r.body.length, 'bytes');
    console.log('✅ CDN is ALIVE');
  } catch (err) {
    console.log('❌ CDN error:', err.message);
    console.log('Code:', err.code);
  }
  
  // Also try with plain fetch
  console.log('\n--- Testing with plain fetch ---');
  try {
    const r2 = await fetch(testUrl, {
      headers: { Referer: 'https://04x.manhwaland.land/' },
    });
    console.log('Status:', r2.status);
    console.log('Content-Type:', r2.headers.get('content-type'));
    const buf = Buffer.from(await r2.arrayBuffer());
    console.log('Size:', buf.length, 'bytes');
    console.log('✅ CDN is ALIVE (plain fetch)');
  } catch (err) {
    console.log('❌ Plain fetch error:', err.message);
  }
})();