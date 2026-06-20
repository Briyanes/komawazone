#!/usr/bin/env node
/**
 * FAST Backfill: Just scrape image URLs and store them directly.
 *
 * The app already has /api/proxy/image?url=... that serves gmbr.pro images
 * through a proxy pool. We do NOT need to download to R2.
 * Just store the source CDN URLs in chapter_images — the app handles the rest.
 *
 * This is ~50x faster than downloading images.
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

const SOURCE_ORIGIN = 'https://04x.manhwaland.land';
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

  // Upgrade HTTP → HTTPS for gmbr.pro
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
      'User-Agent': UA,
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

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const mangaSlug = process.argv[2] || 'im-the-only-man-on-the-military-base';

  console.log('═'.repeat(70));
  console.log(`  FAST Backfill Chapter Images — ${mangaSlug}`);
  console.log('═'.repeat(70));

  // Get manga
  const { data: manga } = await sb.from('manga').select('id, slug, title, source_url').eq('slug', mangaSlug).single();
  if (!manga) {
    console.error('❌ Manga not found:', mangaSlug);
    process.exit(1);
  }
  console.log(`📖 Manga: ${manga.title} (${manga.id})`);
  console.log(`🔗 Source: ${manga.source_url || 'N/A'}\n`);

  // Determine source origin from manga source_url
  let sourceOrigin = SOURCE_ORIGIN;
  if (manga.source_url) {
    try {
      sourceOrigin = new URL(manga.source_url).origin;
    } catch {}
  }
  console.log(`🌐 Using source origin: ${sourceOrigin}\n`);

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

  // Find empty chapters
  const emptyChapters = [];
  for (const ch of chapters) {
    const { count } = await sb
      .from('chapter_images')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', ch.id);
    if (count === 0) emptyChapters.push(ch);
  }

  console.log(`📚 Total chapters: ${chapters.length}`);
  console.log(`🔍 Chapters without images: ${emptyChapters.length}`);
  console.log(`✅ Chapters with images: ${chapters.length - emptyChapters.length}\n`);

  if (emptyChapters.length === 0) {
    console.log('🎉 All chapters already have images!');
    process.exit(0);
  }

  console.log('─'.repeat(70));
  console.log('Starting FAST backfill (no R2 download, just scraping URLs)...\n');

  let success = 0;
  let failed = 0;

  for (const ch of emptyChapters) {
    // Build candidate URLs
    const candidates = [];
    if (ch.source_url) candidates.push(ch.source_url);

    const intNum = Math.floor(ch.number);
    const paddedNum = String(intNum).padStart(2, '0');
    candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${ch.number}/`);
    if (intNum !== ch.number) {
      // already added above
    } else if (intNum < 100) {
      candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`);
      candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${paddedNum}/`);
    } else {
      candidates.push(`${sourceOrigin}/${mangaSlug}-chapter-${intNum}/`);
    }

    // Deduplicate
    const uniqueCandidates = [...new Set(candidates)];

    let imageUrls = [];
    let matchedUrl = null;

    for (const url of uniqueCandidates) {
      try {
        process.stdout.write(`  Ch${ch.number} 🔍 ${url}... `);
        imageUrls = await scrapeChapterImages(url);
        if (imageUrls.length > 0) {
          matchedUrl = url;
          console.log(`✅ ${imageUrls.length} images`);
          break;
        } else {
          console.log('❌ 0 images');
        }
      } catch (err) {
        console.log(`❌ ${err.message}`);
      }
    }

    if (imageUrls.length === 0) {
      console.log(`  ⛔ Ch${ch.number}: No images found\n`);
      failed++;
      continue;
    }

    // Insert chapter_images directly with source URLs
    const imageRows = imageUrls.map((url, i) => ({
      chapter_id: ch.id,
      image_url: url,
      number: i + 1,
    }));

    const { error: insertErr } = await sb
      .from('chapter_images')
      .upsert(imageRows, { onConflict: 'chapter_id,number', ignoreDuplicates: true });

    if (insertErr) {
      console.log(`  ⚠️  Ch${ch.number}: Insert error: ${insertErr.message}\n`);
      failed++;
      continue;
    }

    // Update thumbnail (5th image or last available)
    const thumb = imageUrls.length >= 5 ? imageUrls[4] : imageUrls[imageUrls.length - 1];
    const chapterUpdate = { thumbnail_url: thumb };
    if (matchedUrl) chapterUpdate.source_url = matchedUrl;

    await sb.from('chapters').update(chapterUpdate).eq('id', ch.id);

    console.log(`  ✅ Ch${ch.number}: ${imageUrls.length} images stored\n`);
    success++;

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('═'.repeat(70));
  console.log(`  DONE: ${success} chapters processed, ${failed} failed`);
  console.log(`  Total: ${chapters.length} chapters, ${chapters.length - emptyChapters.length + success} with images`);
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});