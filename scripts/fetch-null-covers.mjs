#!/usr/bin/env node
/**
 * Fetch covers for manga with NULL cover_url by scraping source pages.
 *
 * Usage:
 *   node --env-file=.env.local scripts/fetch-null-covers.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gotScraping } from 'got-scraping';

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || 'komawazone';
const R2_DOMAIN = 'https://pub-918f7d0651d64a29a87deb04073b5fa1.r2.dev';
const MIN_COVER_SIZE = 2000;

const SCRAPE_OPTS = {
  timeout: { request: 15000 },
  retry: { limit: 0 },
  headerGeneratorOptions: {
    browsers: [{ name: 'chrome', minVersion: 112 }],
    devices: ['desktop'],
    operatingSystems: ['macos'],
    locales: ['id-ID', 'en-US'],
  },
};

async function findCoverUrl(sourceUrl) {
  try {
    const response = await gotScraping({ url: sourceUrl, responseType: 'text', ...SCRAPE_OPTS });
    if (response.statusCode !== 200) return null;
    const html = response.body;

    // Try wp-post-image
    const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
      ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
    if (wpPostImg?.[1]) return wpPostImg[1].startsWith('//') ? 'https:' + wpPostImg[1] : wpPostImg[1];

    // Try og:image
    const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
    if (og?.[1]) return og[1].startsWith('//') ? 'https:' + og[1] : og[1];

    return null;
  } catch { return null; }
}

async function tryDownload(url, referer) {
  try {
    const r = await gotScraping({
      url, responseType: 'buffer', ...SCRAPE_OPTS,
      headers: { Referer: referer || new URL(url).origin + '/', Accept: 'image/*,*/*' },
    });
    if (r.statusCode !== 200) return null;
    if (r.body.length < MIN_COVER_SIZE) return null;
    const ct = (r.headers['content-type'] || '').split(';')[0].trim();
    if (!ct.startsWith('image/')) return null;
    return { buffer: r.body, contentType: ct };
  } catch { return null; }
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Fetch Null Covers — Source Scraper');
  console.log('═══════════════════════════════════════════════════\n');

  // Fetch all null-cover manga
  const allManga = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('manga')
      .select('id, slug, title, source_url')
      .is('cover_url', null)
      .order('id')
      .range(offset, offset + 999);
    if (!data?.length) break;
    allManga.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Found ${allManga.length} manga with null covers\n`);

  let fixed = 0, failed = 0;

  for (const m of allManga) {
    if (!m.source_url) { console.log(`  ⏭️  ${m.title} — no source`); failed++; continue; }

    process.stdout.write(`  🔄 ${m.title}...`);

    try {
      // Step 1: Find cover URL from source page
      const coverUrl = await findCoverUrl(m.source_url);

      let result = null;

      // Step 2: Try the found URL
      if (coverUrl) {
        result = await tryDownload(coverUrl, m.source_url);
      }

      // Step 3: Try manhwaland CDN fallback patterns
      if (!result && m.source_url.includes('manhwaland')) {
        const sourceSlug = m.source_url.match(/\/manga\/([^/]+)\//)?.[1];
        if (sourceSlug) {
          const months = ['2025/07', '2025/06', '2025/05', '2025/04', '2025/03', '2025/02', '2025/01', '2024/12', '2024/11', '2024/10'];
          for (const month of months) {
            for (const ext of ['jpg', 'webp']) {
              const altUrl = `https://02.manhwaland.land/wp-content/uploads/${month}/${sourceSlug}.${ext}`;
              result = await tryDownload(altUrl, m.source_url);
              if (result) break;
            }
            if (result) break;
          }
        }
      }

      if (!result) {
        console.log(' ❌ No cover found');
        failed++;
        continue;
      }

      // Step 4: Upload to R2
      const ext = result.contentType.split('/')[1]?.replace('jpeg', 'jpg') || 'webp';
      const key = `covers/${m.id}.${ext}`;

      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: result.buffer,
        ContentType: result.contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      // Step 5: Update DB
      const newUrl = `${R2_DOMAIN}/${key}`;
      await sb.from('manga').update({ cover_url: newUrl }).eq('id', m.id);

      console.log(` ✅ ${key.split('/').pop()} (${result.buffer.length} bytes)`);
      fixed++;

      // Rate limit
      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.log(` ❌ ${e.message}`);
      failed++;
    }
  }

  console.log(`\n───────────────────────────────────────────────────`);
  console.log(`Done! Fixed: ${fixed}, Failed: ${failed}`);
}

main().catch(console.error);