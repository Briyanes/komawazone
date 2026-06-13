#!/usr/bin/env node
import { gotScraping } from 'got-scraping';

(async () => {
  const r = await gotScraping({
    url: 'https://04x.manhwaland.land/boku-nerai-no-onee-san-chapter-1/',
    responseType: 'text',
    timeout: { request: 20000 },
    headerGeneratorOptions: { browsers: [{ name: 'chrome', minVersion: 112 }], devices: ['desktop'], operatingSystems: ['macos'] },
  });

  console.log('Status:', r.statusCode, 'Body length:', r.body.length);

  // Find ts_reader JSON
  const m = r.body.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)/);
  if (m) {
    const data = JSON.parse(m[1]);
    const imgs = data?.sources?.[0]?.images ?? data?.resources?.[0]?.images;
    if (imgs) {
      console.log('Image CDN hosts found:');
      const hosts = new Set(imgs.map(u => { try { return new URL(u).hostname; } catch { return '?'; } }));
      hosts.forEach(h => console.log('  ', h));
      console.log('Sample:', imgs[0]);
      console.log('Total images:', imgs.length);
    }
  } else {
    console.log('No ts_reader found');
    const imgMatches = r.body.match(/https?:\/\/[^\s"']+\/uploads\/manga[^\s"']+\.(jpg|png|webp)/gi);
    if (imgMatches) {
      console.log('Found image URLs:');
      const hosts = new Set(imgMatches.map(u => { try { return new URL(u).hostname; } catch { return '?'; } }));
      hosts.forEach(h => console.log('  ', h));
      console.log('Sample:', imgMatches[0]);
      console.log('Total:', imgMatches.length);
    }
  }
})();