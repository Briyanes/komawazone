import { gotScraping } from 'got-scraping';

const domains = [
  'https://manhwaland.in',
  'https://manhwaland.com',
  'https://manhwaland.land',
  'https://04x.manhwaland.land',
  'https://manhwaland.fun',
  'https://manhwaland.me',
];

for (const domain of domains) {
  try {
    const r = await gotScraping({
      url: domain,
      responseType: 'text',
      timeout: { request: 10000 },
      headerGeneratorOptions: {
        browsers: [{ name: 'chrome', minVersion: 112, maxVersion: 124 }],
        devices: ['desktop'],
        operatingSystems: ['macos'],
      },
    });
    const title = r.body.match(/<title>([^<]*)<\/title>/)?.[1] || '?';
    console.log(`✅ ${domain} → ${r.statusCode} | ${title.slice(0, 50)}`);
  } catch (e) {
    console.log(`❌ ${domain} → ${e.message.slice(0, 60)}`);
  }
}
