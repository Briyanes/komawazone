#!/usr/bin/env node
/**
 * Batch: Scrape image URLs for ALL chapters with 0 images.
 * Stores source CDN URLs in chapter_images (no R2 download here).
 * The existing R2 migration (migrate-gmbr-to-r2-direct.mjs) will handle R2 upload later.
 *
 * Usage: node scripts/backfill-all-empty-images.mjs
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

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

async function scrapeChapterImages(chapterUrl, sourceOrigin) {
  const res = await fetch(chapterUrl, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
      Referer: sourceOrigin + '/',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  return parseChapterImages(html);
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('  BATCH BACKFILL: All Empty Chapter Images');
  console.log('═'.repeat(70));

  // Get all chapters with their manga info
  console.log('🔍 Loading chapters...');
  const { data: allChapters } = await sb
    .from('chapters')
    .select('id, number, title, source_url, manga_id, manga:manga(slug, title, source_url)')
    .is('deleted_at', null)
    .order('manga_id', { ascending: true })
    .limit(50000);

  if (!allChapters || allChapters.length === 0) {
    console.log('❌ No chapters found in DB');
    process.exit(1);
  }
  console.log(`📚 Total chapters in DB: ${allChapters.length}`);

  // Get all chapter_ids that ALREADY have images (batch query)
  const { data: chaptersWithImages } = await sb
    .from('chapter_images')
    .select('chapter_id')
    .limit(100000);

  const hasImagesSet = new Set((chaptersWithImages || []).map((r) => r.chapter_id));
  const emptyChapters = allChapters.filter((ch) => !hasImagesSet.has(ch.id));

  if (emptyChapters.length === 0) {
    console.log('🎉 All chapters already have images!');
    process.exit(0);
  }

  console.log(`📊 Total chapters without images: ${emptyChapters.length}\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let currentManga = null;
  const startTime = Date.now();

  for (let i = 0; i < emptyChapters.length; i++) {
    const ch = emptyChapters[i];
    const mangaSlug = ch.manga?.slug || ch.manga_slug;
    const mangaTitle = ch.manga?.title || ch.manga_title || mangaSlug;
    let sourceOrigin = 'https://04x.manhwaland.land';
    try {
      if (ch.manga?.source_url) sourceOrigin = new URL(ch.manga.source_url).origin;
      else if (ch.source_url) sourceOrigin = new URL(ch.source_url).origin;
    } catch {}

    if (mangaSlug !== currentManga) {
      currentManga = mangaSlug;
      if (i > 0) console.log('');
      console.log(`📖 [${i + 1}/${emptyChapters.length}] ${mangaTitle}`);
    }

    // Build candidate URLs
    const candidates = [];
    if (ch.source_url) candidates.push(ch.source_url);
    const intNum = Math.floor(ch.number);
    const paddedNum = String(intNum).padStart(2, '0');
    candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${ch.number}/`);
    if (intNum < 100) {
      candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`);
      candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${paddedNum}/`);
    }
    const uniqueCandidates = [...new Set(candidates)];

    let imageUrls = [];
    let matchedUrl = null;

    for (const url of uniqueCandidates) {
      try {
        imageUrls = await scrapeChapterImages(url, sourceOrigin);
        if (imageUrls.length > 0) {
          matchedUrl = url;
          break;
        }
      } catch (err) {
        // try next
      }
    }

    if (imageUrls.length === 0) {
      console.log(`  ⚠️  Ch${ch.number}: No images`);
      failed++;
      await sleep(200);
      continue;
    }

    // Insert
    const imageRows = imageUrls.map((url, idx) => ({
      chapter_id: ch.id,
      image_url: url,
      number: idx + 1,
    }));

    const { error: insertErr } = await sb
      .from('chapter_images')
      .upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

    if (insertErr) {
      console.log(`  ❌ Ch${ch.number}: ${insertErr.message}`);
      failed++;
      continue;
    }

    // Update thumbnail
    const thumb = imageUrls.length >= 5 ? imageUrls[4] : imageUrls[imageUrls.length - 1];
    const chapterUpdate = { thumbnail_url: thumb };
    if (matchedUrl) chapterUpdate.source_url = matchedUrl;
    await sb.from('chapters').update(chapterUpdate).eq('id', ch.id);

    console.log(`  ✅ Ch${ch.number}: ${imageUrls.length} images`);
    success++;

    await sleep(300);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
  console.log('\n' + '═'.repeat(70));
  console.log('  📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Processed : ${emptyChapters.length}`);
  console.log(`  Success   : ${success}`);
  console.log(`  Failed    : ${failed}`);
  console.log(`  Time      : ${elapsed}s`);
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});