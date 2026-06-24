#!/usr/bin/env node
/**
 * Robust backfill: Scrape the manga's source page to get REAL chapter URLs,
 * then backfill images for chapters that are missing them.
 *
 * This is more reliable than guessing URL patterns because it reads the
 * actual chapter list from the source site.
 *
 * Usage:
 *   node scripts/backfill-from-manga-page.mjs --manga=SLUG   # Single manga
 *   node scripts/backfill-from-manga-page.mjs                # All affected manga
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

const args = process.argv.slice(2);
const MANGA_FILTER = args.find(a => a.startsWith('--manga='))?.split('=')[1];
const DELAY_MS = 500; // delay between chapter fetches
const CONCURRENCY = 3;  // parallel chapter fetches per manga

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ─── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Scrape manga page and extract all chapter URLs with their numbers.
 * Returns Map<chapterNumber: string, chapterUrl: string>
 */
async function scrapeMangaChapterList(mangaUrl) {
  const origin = new URL(mangaUrl).origin;
  const res = await fetch(mangaUrl, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'id,en-US;q=0.9,en;q=0.8',
    },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${mangaUrl}`);
  const html = await res.text();

  const chapters = new Map();

  // Strategy 1: Find all <a> tags with href containing "chapter" inside the manga page
  // Pattern: href="https://domain/manga-slug-chapter-N/" or relative URLs
  const slug = mangaUrl.trim().split('/').filter(Boolean).pop() || '';

  // Match links like: /slug-chapter-N/ or full URL
  const chapterLinkRe = new RegExp(
    `href=["']([^"']*${escapeRegex(slug)}[^"']*chapter-[^"']+)["'][^>]*>`,
    'gi'
  );

  let m;
  while ((m = chapterLinkRe.exec(html)) !== null) {
    let url = m[1];
    // Make absolute
    if (url.startsWith('/')) url = origin + url;
    if (!url.startsWith('http')) continue;

    // Extract chapter number from URL
    const numMatch = url.match(/chapter-(\d+\.?\d*)/i);
    if (numMatch) {
      const num = parseFloat(numMatch[1]);
      // Keep first occurrence (usually the most relevant)
      if (!chapters.has(num)) {
        chapters.set(num, url);
      }
    }
  }

  // Strategy 2: Broader pattern if Strategy 1 found nothing
  if (chapters.size === 0) {
    const broadRe = /href=["']([^"']*-chapter-(\d+\.?\d*)\/?)["']/gi;
    while ((m = broadRe.exec(html)) !== null) {
      let url = m[1];
      if (url.startsWith('/')) url = origin + url;
      if (!url.startsWith('http')) continue;
      const num = parseFloat(m[2]);
      if (!chapters.has(num)) {
        chapters.set(num, url);
      }
    }
  }

  return chapters;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Parse images from a chapter page
 */
function parseChapterImages(html) {
  const urls = [];
  const readerareaIdx = html.indexOf('id="readerarea"');
  const section = readerareaIdx !== -1 ? html.slice(readerareaIdx, readerareaIdx + 80_000) : html;

  // Try noscript tags first
  const noscriptRe = /<noscript>([\s\S]*?)<\/noscript>/g;
  let m;
  while ((m = noscriptRe.exec(section)) !== null) {
    const srcRe = /src=['"]([^'"]+)['"]/g;
    let s;
    while ((s = srcRe.exec(m[1])) !== null) {
      if (/^https?:\/\//i.test(s[1])) urls.push(s[1]);
    }
  }

  // Try data-src
  if (urls.length === 0) {
    const dataSrcRe = /data-src=['"]([^'"]+)['"]/g;
    while ((m = dataSrcRe.exec(section)) !== null) {
      if (/^https?:\/\//i.test(m[1])) urls.push(m[1]);
    }
  }

  // Try regular img src
  if (urls.length === 0) {
    const imgSrcRe = /<img[^>]+src=['"]([^'"]+)['"]/g;
    while ((m = imgSrcRe.exec(section)) !== null) {
      const u = m[1];
      if (/^https?:\/\//i.test(u) && /chapter|manga[-_.]images|upload/i.test(u)) {
        urls.push(u);
      }
    }
  }

  return urls.map(u => {
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

// ─── Process one manga ──────────────────────────────────────────────────────

async function processManga(manga) {
  const result = { manga: manga.title, total: 0, success: 0, failed: 0, skipped: 0 };

  // Get all chapters for this manga
  const allChapters = [];
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('chapters')
      .select('id, number, source_url, thumbnail_url')
      .eq('manga_id', manga.id)
      .is('deleted_at', null)
      .order('number', { ascending: true })
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    allChapters.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  result.total = allChapters.length;

  // Find chapters that need images (no images in chapter_images)
  const { data: existingImgs } = await sb
    .from('chapter_images')
    .select('chapter_id')
    .in('chapter_id', allChapters.map(c => c.id))
    .limit(50000);

  const hasImages = new Set((existingImgs || []).map(r => r.chapter_id));
  const needImages = allChapters.filter(c => !hasImages.has(c.id));

  if (needImages.length === 0) {
    result.skipped = allChapters.length;
    console.log(`  ✅ All ${allChapters.length} chapters already have images`);
    return result;
  }

  console.log(`  📊 ${needImages.length}/${allChapters.length} chapters need images`);

  // Scrape manga page to get real chapter URLs
  let chapterUrlMap = new Map();
  if (manga.source_url) {
    try {
      console.log(`  🔍 Scraping manga page: ${manga.source_url}`);
      chapterUrlMap = await scrapeMangaChapterList(manga.source_url);
      console.log(`  📋 Found ${chapterUrlMap.size} chapter URLs from source`);
    } catch (err) {
      console.log(`  ⚠️  Failed to scrape manga page: ${err.message}`);
    }
  }

  // For chapters that already have source_url, add to map
  for (const ch of allChapters) {
    if (ch.source_url) {
      if (!chapterUrlMap.has(ch.number)) {
        chapterUrlMap.set(ch.number, ch.source_url);
      }
    }
  }

  const origin = manga.source_url ? new URL(manga.source_url).origin : 'https://04x.manhwaland.land';

  // Process chapters in batches with concurrency
  for (let i = 0; i < needImages.length; i += CONCURRENCY) {
    const batch = needImages.slice(i, i + CONCURRENCY);

    await Promise.allSettled(batch.map(async (ch) => {
      // Try real URL from manga page first
      const realUrl = chapterUrlMap.get(ch.number) || chapterUrlMap.get(Math.floor(ch.number));

      // Build fallback URLs
      const candidates = [];
      if (realUrl) candidates.push(realUrl);
      if (ch.source_url) candidates.push(ch.source_url);
      const mangaSlug = manga.slug;
      candidates.push(`${origin}/${mangaSlug}-chapter-${ch.number}/`);
      const intNum = Math.floor(ch.number);
      if (intNum < 100) {
        candidates.push(`${origin}/${mangaSlug}-chapter-${intNum}/`);
        candidates.push(`${origin}/${mangaSlug}-chapter-${String(intNum).padStart(2, '0')}/`);
      }
      const uniqueCandidates = [...new Set(candidates)];

      let imageUrls = [];
      let matchedUrl = null;

      for (const url of uniqueCandidates) {
        try {
          imageUrls = await scrapeChapterImages(url, origin);
          if (imageUrls.length > 0) {
            matchedUrl = url;
            break;
          }
        } catch {
          // try next
        }
      }

      if (imageUrls.length === 0) {
        console.log(`  ⚠️  Ch${ch.number}: No images found`);
        result.failed++;
        return;
      }

      // Insert images
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
        result.failed++;
        return;
      }

      // Update thumbnail + source_url
      const thumb = imageUrls.length >= 5 ? imageUrls[4] : imageUrls[imageUrls.length - 1];
      const update = { thumbnail_url: thumb };
      if (matchedUrl) update.source_url = matchedUrl;
      await sb.from('chapters').update(update).eq('id', ch.id);

      console.log(`  ✅ Ch${ch.number}: ${imageUrls.length} images${matchedUrl ? ' (from manga page)' : ''}`);
      result.success++;
    }));

    await sleep(DELAY_MS);
  }

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('═'.repeat(70));
  console.log('  ROBUST BACKFILL: Scrape manga page → Get real chapter URLs');
  console.log('═'.repeat(70));

  if (MANGA_FILTER) {
    // Single manga mode
    const { data: manga, error } = await sb
      .from('manga')
      .select('id, title, slug, source_url')
      .eq('slug', MANGA_FILTER)
      .single();

    if (error || !manga) {
      console.error(`❌ Manga not found: ${MANGA_FILTER}`);
      process.exit(1);
    }

    console.log(`📖 ${manga.title} (${manga.slug})`);
    console.log(`🔗 Source: ${manga.source_url}\n`);

    const result = await processManga(manga);
    console.log(`\n📊 Result: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`);
    return;
  }

  // Global mode: find all manga with chapters missing source_url
  console.log('🔍 Finding manga with chapters missing source_url...\n');

  // Get all affected manga IDs
  const affectedMangaIds = new Set();
  let offset = 0;
  while (true) {
    const { data } = await sb
      .from('chapters')
      .select('manga_id')
      .is('source_url', null)
      .is('deleted_at', null)
      .range(offset, offset + 999);
    if (!data || data.length === 0) break;
    for (const r of data) affectedMangaIds.add(r.manga_id);
    if (data.length < 1000) break;
    offset += 1000;
  }

  console.log(`Found ${affectedMangaIds.size} manga to process\n`);

  // Get manga details in batches
  const mangaIds = [...affectedMangaIds];
  let totalSuccess = 0;
  let totalFailed = 0;
  let totalMangaDone = 0;

  for (let i = 0; i < mangaIds.length; i += 50) {
    const batchIds = mangaIds.slice(i, i + 50);
    const { data: mangaBatch } = await sb
      .from('manga')
      .select('id, title, slug, source_url')
      .in('id', batchIds)
      .not('source_url', 'is', null); // Only process manga that HAVE a source_url

    for (const manga of mangaBatch || []) {
      console.log(`\n📖 [${totalMangaDone + 1}/${mangaIds.length}] ${manga.title}`);
      console.log(`   🔗 ${manga.source_url}`);

      try {
        const result = await processManga(manga);
        totalSuccess += result.success;
        totalFailed += result.failed;
        totalMangaDone++;
      } catch (err) {
        console.log(`  ❌ Error: ${err.message}`);
        totalFailed++;
      }

      // Delay between manga to avoid rate limiting
      await sleep(1000);
    }
  }

  console.log('\n' + '═'.repeat(70));
  console.log('  📊 FINAL SUMMARY');
  console.log('═'.repeat(70));
  console.log(`  Manga processed : ${totalMangaDone}`);
  console.log(`  Chapters fixed  : ${totalSuccess}`);
  console.log(`  Chapters failed : ${totalFailed}`);
  console.log('═'.repeat(70));
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});