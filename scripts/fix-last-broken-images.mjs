#!/usr/bin/env node
/**
 * fix-last-broken-images.mjs
 *
 * Handles the last ~20 broken images that lack source_url.
 * Constructs manhwaland.land URL from gmbr.pro URL pattern.
 * Uses Playwright intercept to bypass 403.
 *
 * gmbr.pro URL pattern:
 *   https://api-l.gmbr.pro/manga/{slug}/ch-{num}/{page}.jpg
 * manhwaland URL:
 *   https://manhwaland.land/manga/{slug}/chapter-{num}/
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function pageNumFromUrl(url) {
  const m = url.match(/(\d+)\.(jpg|jpeg|png|webp)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Construct manhwaland URL from gmbr.pro URL */
function constructSourceUrl(gmbrUrl) {
  // https://api-l.gmbr.pro/manga/wait-im-a-married-woman/ch-30/018.jpg
  const m = gmbrUrl.match(/gmbr\.pro\/manga\/([^\/]+)\/ch-(\d+)/i);
  if (!m) return null;
  const [, slug, chNum] = m;
  return `https://manhwaland.land/manga/${slug}/chapter-${chNum}/`;
}

async function r2Exists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return `/api/r2/image/${key}`;
}

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  🔧 Fix Last Broken Images (Playwright)     ║');
  console.log('╚══════════════════════════════════════════════╝\n');

  // Get all non-R2 images
  const { data: brokenImages, error } = await sb.from('chapter_images')
    .select('id, number, image_url, chapter:chapters(id, number, manga:manga(slug, title))')
    .not('image_url', 'like', '%/api/r2/%')
    .limit(100);

  if (error || !brokenImages?.length) {
    console.log('No broken images found!');
    return;
  }

  console.log(`Found ${brokenImages.length} broken images\n`);

  // Group by chapter
  const byChapter = {};
  for (const img of brokenImages) {
    const chId = img.chapter?.id;
    if (!chId) continue;
    if (!byChapter[chId]) {
      byChapter[chId] = {
        mangaTitle: img.chapter?.manga?.title,
        mangaSlug: img.chapter?.manga?.slug,
        chapterNumber: img.chapter?.number,
        images: [],
      };
    }
    byChapter[chId].images.push(img);
  }

  console.log(`Across ${Object.keys(byChapter).length} chapters:\n`);
  for (const [, info] of Object.entries(byChapter)) {
    const domain = info.images[0].image_url.includes('gmbr.pro') ? 'gmbr.pro' : info.images[0].image_url.includes('uwakjawa') ? 'uwakjawa' : 'other';
    console.log(`  📖 ${info.mangaTitle} Ch${info.chapterNumber} — ${info.images.length} imgs (${domain})`);
  }
  console.log('');

  // Launch browser
  const browser = await chromium.launch({ headless: true });

  let totalFixed = 0;
  let totalFailed = 0;

  for (const [chapterId, info] of Object.entries(byChapter)) {
    const firstUrl = info.images[0].image_url;

    // Only handle gmbr.pro (uwakjawa is likely dead)
    if (!firstUrl.includes('gmbr.pro')) {
      console.log(`⏭️  Skipping ${info.mangaTitle} Ch${info.chapterNumber} (non-gmbr domain, likely dead)`);
      totalFailed += info.images.length;
      continue;
    }

    const sourceUrl = constructSourceUrl(firstUrl);
    if (!sourceUrl) {
      console.log(`❌ Can't construct source URL for ${firstUrl}`);
      totalFailed += info.images.length;
      continue;
    }

    console.log(`\n📖 ${info.mangaTitle} Ch${info.chapterNumber} (${info.images.length} imgs)`);
    console.log(`   Source: ${sourceUrl}`);

    const context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 720 },
      locale: 'id-ID',
    });

    const page = await context.newPage();

    // Intercept gmbr.pro responses
    const captured = new Map();
    page.on('response', async (resp) => {
      const url = resp.url();
      if (!url.includes('gmbr.pro')) return;
      if (resp.status() !== 200) return;
      try {
        const ct = resp.headers()['content-type'] || '';
        if (!ct.startsWith('image/')) return;
        const body = await resp.body();
        if (body.length < 1024) return;
        const pageNum = pageNumFromUrl(url);
        if (pageNum) {
          captured.set(pageNum, { buffer: Buffer.from(body), contentType: ct });
          process.stdout.write(`📥 p${pageNum} `);
        }
      } catch {}
    });

    try {
      await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } catch (e) {
      console.log(`  ⚠️ Navigation: ${e.message.substring(0, 60)}`);
    }

    await sleep(3000);

    // Scroll to trigger lazy load
    for (let i = 0; i < 40; i++) {
      const atBottom = await page.evaluate(() => {
        window.scrollBy(0, 600);
        return (window.innerHeight + window.scrollY) >= document.body.scrollHeight - 100;
      });
      await sleep(400);
      if (atBottom && i > 5) break;
    }
    await sleep(2000);

    console.log(`\n   Captured: ${captured.size}/${info.images.length}`);

    // Upload
    let fixed = 0;
    for (const img of info.images) {
      const data = captured.get(img.number);
      if (!data) {
        console.log(`  ❌ p${img.number} not captured`);
        totalFailed++;
        continue;
      }
      const r2Key = `chapters/${chapterId}/${img.number}.jpg`;
      try {
        await uploadToR2(r2Key, data.buffer, data.contentType);
        await sb.from('chapter_images').update({ image_url: `/api/r2/image/${r2Key}` }).eq('id', img.id);
        fixed++;
        totalFixed++;
      } catch (e) {
        console.log(`  ❌ Upload p${img.number}: ${e.message.substring(0, 50)}`);
        totalFailed++;
      }
    }

    // Update chapter thumbnail
    if (fixed > 0) {
      const { data: ch } = await sb.from('chapters').select('thumbnail_url').eq('id', chapterId).single();
      if (ch?.thumbnail_url?.includes('gmbr.pro') || !ch?.thumbnail_url) {
        const thumbPage = info.images.find(i => i.number === 1) || info.images[0];
        await sb.from('chapters').update({
          thumbnail_url: `/api/r2/image/chapters/${chapterId}/${thumbPage.number}.jpg`
        }).eq('id', chapterId);
      }
    }

    console.log(`   ✅ ${fixed}/${info.images.length} fixed`);
    await page.close();
    await context.close();
  }

  await browser.close();

  console.log(`\n📊 RESULTS: ${totalFixed} fixed | ${totalFailed} failed`);
  console.log('✅ Done!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });