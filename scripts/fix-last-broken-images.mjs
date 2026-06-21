#!/usr/bin/env node
/**
 * fix-last-broken-images.mjs
 *
 * Directly downloads gmbr.pro images using Playwright with spoofed Referer.
 * No need for source_url or manhwaland page — just set the right headers.
 *
 * gmbr.pro checks Referer header. By using Playwright's route interception,
 * we can set Referer to manhwaland.site and download directly.
 */

import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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

async function uploadToR2(key, buffer, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: buffer,
    ContentType: contentType || 'image/jpeg',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
}

/** Download a single image via Playwright with spoofed referer */
async function downloadImage(context, imageUrl) {
  const page = await context.newPage();

  let imageBuffer = null;
  let contentType = 'image/jpeg';

  // Intercept the response
  page.on('response', async (resp) => {
    if (resp.url() === imageUrl || resp.url().includes(imageUrl.split('/').pop())) {
      if (resp.status() === 200) {
        try {
          contentType = resp.headers()['content-type'] || 'image/jpeg';
          if (contentType.startsWith('image/')) {
            imageBuffer = await resp.body();
          }
        } catch {}
      }
    }
  });

  try {
    // Navigate directly to the image with spoofed referer
    await page.goto(imageUrl, {
      waitUntil: 'commit',
      timeout: 15000,
      referer: 'https://manhwaland.site/',
    });
    await sleep(1000);
  } catch (e) {
    // If goto fails (e.g. it's an image not a page), try alternative
    try {
      const resp = await page.request.get(imageUrl, {
        headers: {
          'Referer': 'https://manhwaland.site/',
          'User-Agent': UA,
        },
        timeout: 15000,
      });
      if (resp.ok()) {
        contentType = resp.headers()['content-type'] || 'image/jpeg';
        if (contentType.startsWith('image/')) {
          imageBuffer = await resp.body();
        }
      }
    } catch (e2) {
      // Failed
    }
  }

  await page.close();
  return imageBuffer ? { buffer: imageBuffer, contentType } : null;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  🔧 Fix ALL Broken Images (Direct Download)      ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  // Get ALL non-R2 images (paginate)
  let allBroken = [];
  let offset = 0;
  while (true) {
    const { data } = await sb.from('chapter_images')
      .select('id, number, image_url, chapter:chapters(id, number, manga:manga(slug, title))')
      .not('image_url', 'like', '%/api/r2/%')
      .range(offset, offset + 999);
    if (!data?.length) break;
    allBroken.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
  }

  console.log(`Found ${allBroken.length} broken images\n`);

  // Group by chapter
  const byChapter = {};
  for (const img of allBroken) {
    const chId = img.chapter?.id;
    if (!chId) continue;
    if (!byChapter[chId]) {
      byChapter[chId] = {
        mangaTitle: img.chapter?.manga?.title,
        chapterNumber: img.chapter?.number,
        images: [],
      };
    }
    byChapter[chId].images.push(img);
  }

  const chapterIds = Object.keys(byChapter);
  const chapterCount = chapterIds.length;
  console.log(`Across ${chapterCount} chapters\n`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1280, height: 720 },
    locale: 'id-ID',
    extraHTTPHeaders: {
      'Referer': 'https://manhwaland.site/',
    },
  });

  let totalFixed = 0;
  let totalFailed = 0;

  for (let chI = 0; chI < chapterCount; chI++) {
    const chapterId = chapterIds[chI];
    const info = byChapter[chapterId];
    const imgCount = info.images.length;

    console.log(`\n[${chI + 1}/${chapterCount}] 📖 ${info.mangaTitle} Ch${info.chapterNumber} (${imgCount} imgs)`);

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < info.images.length; i++) {
      const img = info.images[i];
      const url = img.image_url;

      if (!url.includes('gmbr.pro')) {
        console.log(`  ⏭️  p${img.number} skip (non-gmbr)`);
        failed++;
        continue;
      }

      // Download
      const result = await downloadImage(context, url);

      if (result && result.buffer.length > 1024) {
        const r2Key = `chapters/${chapterId}/${img.number}.jpg`;
        try {
          await uploadToR2(r2Key, result.buffer, result.contentType);
          await sb.from('chapter_images').update({ image_url: `/api/r2/image/${r2Key}` }).eq('id', img.id);
          fixed++;
          totalFixed++;
          process.stdout.write(`✅`);
        } catch (e) {
          failed++;
          totalFailed++;
          process.stdout.write(`❌`);
        }
      } else {
        failed++;
        totalFailed++;
        process.stdout.write(`💀`);
      }

      // Progress every 10 images
      if ((i + 1) % 10 === 0) process.stdout.write(` ${i + 1}/${imgCount} `);
    }

    // Update chapter thumbnail if needed
    if (fixed > 0) {
      try {
        const { data: ch } = await sb.from('chapters').select('thumbnail_url').eq('id', chapterId).single();
        if (ch?.thumbnail_url?.includes('gmbr.pro') || !ch?.thumbnail_url) {
          const thumbPage = info.images.find(i => i.number === 1) || info.images[0];
          const thumbKey = `chapters/${chapterId}/${thumbPage.number}.jpg`;
          await sb.from('chapters').update({
            thumbnail_url: `/api/r2/image/${thumbKey}`
          }).eq('id', chapterId);
        }
      } catch {}
    }

    console.log(`\n   ${fixed > 0 ? '✅' : '❌'} ${fixed}/${imgCount} fixed`);
  }

  await browser.close();

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 TOTAL: ${totalFixed} fixed | ${totalFailed} failed`);
  console.log(`${'═'.repeat(50)}`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });