#!/usr/bin/env node
/**
 * Backfill chapter images for "Im the Only Man on the Military Base"
 *
 * Problem: 56 chapters were imported metadata-only (no images).
 * The lazy-load mechanism in getChapterWithImages() tries to scrape +
 * download images on-the-fly when a reader opens a chapter, but this
 * can timeout on Vercel (10s Hobby / 60s Pro) because downloading
 * 30+ images to R2 takes time.
 *
 * This script pre-downloads images for ALL empty chapters so the
 * reader works instantly without relying on lazy-load.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ─── Load env ───────────────────────────────────────────────────────────────
const envPath = path.join(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const i = line.indexOf('=');
  if (i === -1) continue;
  env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const MANGA_SLUG = 'im-the-only-man-on-the-military-base';
const SOURCE_ORIGIN = 'https://04x.manhwaland.land';

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseChapterImages(html) {
  const urls = [];
  const readerareaIdx = html.indexOf('id="readerarea"');
  const section = readerareaIdx !== -1 ? html.slice(readerareaIdx, readerareaIdx + 80_000) : html;

  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m;
  while ((m = noscriptRe.exec(section)) !== null) {
    const srcRe = /src=['"]([^'"]+)['"]/g;
    let s;
    while ((s = srcRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }

  if (urls.length === 0) {
    const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dataSrcRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  if (urls.length === 0) {
    const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = imgSrcRe.exec(section)) !== null) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /chapter|manga[-_.]images|upload/i.test(u)) {
        urls.push(u);
      }
    }
  }

  return urls.map((u) => {
    try {
      const parsed = new URL(u);
      if (parsed.protocol === 'http:' && parsed.hostname.includes('gmbr.pro')) {
        parsed.protocol = 'https:';
        return parsed.toString();
      }
      return u;
    } catch {
      return u;
    }
  });
}

async function scrapeChapterImages(chapterUrl) {
  const res = await fetch(chapterUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      Referer: SOURCE_ORIGIN + '/',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseChapterImages(html);
}

async function downloadAndUploadToR2(imageUrls, folder, prefix) {
  const results = [];

  // Get R2 config
  const r2AccountId = env.CLOUDFLARE_ACCOUNT_ID || env.R2_ACCOUNT_ID;
  const r2AccessKey = env.R2_ACCESS_KEY_ID || env.R2_ACCESS_KEY;
  const r2SecretKey = env.R2_SECRET_ACCESS_KEY || env.R2_SECRET_KEY;
  const r2Bucket = env.R2_BUCKET || env.R2_BUCKET_NAME || 'manga-zone';
  const r2PublicUrl = env.R2_PUBLIC_URL || env.NEXT_PUBLIC_R2_PUBLIC_URL;

  if (!r2AccountId || !r2AccessKey || !r2SecretKey) {
    throw new Error('R2 credentials not found in env');
  }

  // Import S3 client
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: r2AccessKey, secretAccessKey: r2SecretKey },
  });

  for (let i = 0; i < imageUrls.length; i++) {
    const sourceUrl = imageUrls[i];
    const ext = sourceUrl.match(/\.(jpg|jpeg|png|webp|gif)/i)?.[1]?.toLowerCase() || 'jpg';
    const paddedNum = String(i + 1).padStart(3, '0');
    const key = `${folder}/${prefix}-${paddedNum}.${ext}`;
    const publicUrl = r2PublicUrl
      ? `${r2PublicUrl.replace(/\/$/, '')}/${key}`
      : `https://pub-xxx.r2.dev/${key}`;

    try {
      const imgRes = await fetch(sourceUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
          Referer: SOURCE_ORIGIN + '/',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!imgRes.ok) {
        console.log(`  ⚠️  Image ${i + 1}: HTTP ${imgRes.status} — using source URL as fallback`);
        results.push({ url: sourceUrl, success: false });
        continue;
      }

      const buffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get('content-type') || `image/${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: r2Bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      results.push({ url: publicUrl, success: true });
      process.stdout.write(`  ✅ Image ${i + 1}/${imageUrls.length} (${ext})\r`);
    } catch (err) {
      console.log(`  ⚠️  Image ${i + 1}: ${err.message} — using source URL as fallback`);
      results.push({ url: sourceUrl, success: false });
    }
  }

  console.log('');
  return results;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('  Backfill Chapter Images — Im the Only Man on the Military Base');
  console.log('═'.repeat(70));

  // Get manga
  const { data: manga } = await sb.from('manga').select('id, slug, title, source_url').eq('slug', MANGA_SLUG).single();
  if (!manga) {
    console.error('❌ Manga not found:', MANGA_SLUG);
    process.exit(1);
  }
  console.log(`📖 Manga: ${manga.title} (${manga.id})`);
  console.log(`🔗 Source: ${manga.source_url || 'N/A'}\n`);

  // Get all chapters
  const { data: chapters } = await sb
    .from('chapters')
    .select('id, number, title, source_url, thumbnail_url')
    .eq('manga_id', manga.id)
    .is('deleted_at', null)
    .order('number', { ascending: true });

  if (!chapters || chapters.length === 0) {
    console.error('❌ No chapters found');
    process.exit(1);
  }
  console.log(`📚 Total chapters: ${chapters.length}\n`);

  // Find empty chapters (no images)
  const emptyChapters = [];
  for (const ch of chapters) {
    const { count } = await sb
      .from('chapter_images')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', ch.id);

    if (count === 0) {
      emptyChapters.push(ch);
    }
  }

  console.log(`🔍 Chapters without images: ${emptyChapters.length}`);
  console.log(`✅ Chapters with images: ${chapters.length - emptyChapters.length}\n`);

  if (emptyChapters.length === 0) {
    console.log('🎉 All chapters already have images!');
    process.exit(0);
  }

  console.log('─'.repeat(70));
  console.log('Starting backfill...\n');

  let success = 0;
  let failed = 0;

  for (const ch of emptyChapters) {
    console.log(`\n📖 Chapter ${ch.number} (ID: ${ch.id})`);

    // Build candidate URLs
    const candidates = [];
    if (ch.source_url) candidates.push(ch.source_url);

    const intNum = Math.floor(ch.number);
    const paddedNum = String(intNum).padStart(2, '0');
    if (intNum !== ch.number) {
      candidates.push(`${SOURCE_ORIGIN}/${MANGA_SLUG}-chapter-${ch.number}/`);
    } else if (intNum < 100) {
      candidates.push(`${SOURCE_ORIGIN}/${MANGA_SLUG}-chapter-${intNum}/`);
      candidates.push(`${SOURCE_ORIGIN}/${MANGA_SLUG}-chapter-${paddedNum}/`);
    } else {
      candidates.push(`${SOURCE_ORIGIN}/${MANGA_SLUG}-chapter-${intNum}/`);
    }

    // Try each candidate URL
    let sourceImageUrls = [];
    let matchedUrl = null;
    for (const url of candidates) {
      try {
        process.stdout.write(`  🔍 Trying ${url}... `);
        sourceImageUrls = await scrapeChapterImages(url);
        if (sourceImageUrls.length > 0) {
          matchedUrl = url;
          console.log(`✅ ${sourceImageUrls.length} images`);
          break;
        } else {
          console.log('❌ 0 images');
        }
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }

    if (sourceImageUrls.length === 0) {
      console.log(`  ⛔ No images found from any candidate URL`);
      failed++;
      continue;
    }

    // Download and upload to R2
    console.log(`  ⬇️  Downloading ${sourceImageUrls.length} images to R2...`);
    const r2Results = await downloadAndUploadToR2(
      sourceImageUrls,
      'pages',
      `${MANGA_SLUG}-ch${ch.number}`
    );

    const finalUrls = r2Results.map((r) => r.url);

    // Insert chapter_images
    const imageRows = finalUrls.map((url, i) => ({
      chapter_id: ch.id,
      image_url: url,
      number: i + 1,
    }));

    const { error: insertErr } = await sb
      .from('chapter_images')
      .upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

    if (insertErr) {
      console.log(`  ⚠️  Insert error: ${insertErr.message}`);
      failed++;
      continue;
    }

    // Update thumbnail (5th image or last)
    const lazyThumb =
      r2Results.length >= 5 ? r2Results[4].url : r2Results[r2Results.length - 1]?.url;

    const chapterUpdate = { thumbnail_url: lazyThumb ?? null };
    if (matchedUrl) chapterUpdate.source_url = matchedUrl;

    await sb.from('chapters').update(chapterUpdate).eq('id', ch.id);

    console.log(`  ✅ Chapter ${ch.number}: ${finalUrls.length} images saved`);
    success++;

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`  DONE: ${success} chapters processed, ${failed} failed`);
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});