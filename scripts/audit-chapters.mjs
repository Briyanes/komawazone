#!/usr/bin/env node
/**
 * Comprehensive chapter audit + re-download tool (FAST version).
 *
 * Uses bulk queries instead of N+1, so 1000+ manga finish in seconds.
 *
 * Usage:
 *   node scripts/audit-chapters.mjs                    # audit only
 *   node scripts/audit-chapters.mjs --manga <slug>     # audit specific manga
 *   node scripts/audit-chapters.mjs --fix              # auto-trigger backfill
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// --- Load env -------------------------------------------------------------
function loadEnv() {
  for (const p of ['.env.local', '.env']) {
    const fp = resolve(process.cwd(), p);
    if (existsSync(fp)) {
      const txt = readFileSync(fp, 'utf8');
      for (const line of txt.split('\n')) {
        const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) {
          let v = m[2].trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          process.env[m[1]] = v;
        }
      }
      break;
    }
  }
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CDN_PATTERNS = ['gmbr.pro', 'gmbar.xyz', 'manhwaland', 'kambingjantan'];
function isDeadCdn(url) {
  if (!url) return false;
  return CDN_PATTERNS.some(p => url.includes(p));
}
function isR2(url) {
  if (!url) return false;
  return url.includes('/api/r2/image/') || url.includes('.r2.dev') || url.includes('.r2.cloudflarestorage.com');
}

const argv = process.argv.slice(2);
const mangaSlug = (argv.find(a => a.startsWith('--manga=')) || '').split('=')[1] || null;
const doFix = argv.includes('--fix');

async function main() {
  console.log('🔍 Manga Zone — Chapter Audit\n' + '='.repeat(50));

  // 1. Fetch all manga
  let mangaQ = supabase.from('manga').select('id, title, slug').is('deleted_at', null);
  if (mangaSlug) mangaQ = mangaQ.eq('slug', mangaSlug);
  const { data: mangas, error: mErr } = await mangaQ.order('title');
  if (mErr) { console.error(mErr); process.exit(1); }
  console.log(`📚 Found ${mangas.length} manga(s)`);

  // 2. Fetch ALL chapters for these manga in batched queries
  //    (Supabase .in() has URL length limits, so we batch 200 at a time)
  const mangaIds = mangas.map(m => m.id);
  console.log(`📖 Fetching chapters (batched)...`);
  const allChapters = [];
  const CHAPTER_BATCH = 200;
  for (let i = 0; i < mangaIds.length; i += CHAPTER_BATCH) {
    const slice = mangaIds.slice(i, i + CHAPTER_BATCH);
    const { data: chs, error: cErr } = await supabase
      .from('chapters')
      .select('id, number, title, thumbnail_url, manga_id')
      .in('manga_id', slice)
      .is('deleted_at', null)
      .order('number');
    if (cErr) { console.error('Chapter fetch error:', cErr); process.exit(1); }
    if (chs) allChapters.push(...chs);
    process.stdout.write(`\r   → fetched chapters for ${Math.min(i + CHAPTER_BATCH, mangaIds.length)}/${mangaIds.length} manga`);
  }
  console.log('\n   → done');
  console.log(`   → ${allChapters.length} chapters found`);

  // 3. Fetch ALL chapter_images in one query (no N+1)
  console.log(`🖼️  Fetching all chapter images (bulk)...`);
  const chapterIds = allChapters.map(c => c.id);
  const allImages = [];
  const BATCH = 500;
  for (let i = 0; i < chapterIds.length; i += BATCH) {
    const slice = chapterIds.slice(i, i + BATCH);
    const { data: imgs } = await supabase
      .from('chapter_images')
      .select('chapter_id, image_url, number')
      .in('chapter_id', slice)
      .order('number');
    if (imgs) allImages.push(...imgs);
    process.stdout.write(`\r   → fetched ${Math.min(i + BATCH, chapterIds.length)}/${chapterIds.length} chapters' images`);
  }
  console.log('\n   → done');

  // 4. Build lookup maps
  const mangaMap = new Map(mangas.map(m => [m.id, m]));
  const chaptersByManga = new Map();
  for (const ch of allChapters) {
    if (!chaptersByManga.has(ch.manga_id)) chaptersByManga.set(ch.manga_id, []);
    chaptersByManga.get(ch.manga_id).push(ch);
  }
  const imagesByChapter = new Map();
  for (const img of allImages) {
    if (!imagesByChapter.has(img.chapter_id)) imagesByChapter.set(img.chapter_id, []);
    imagesByChapter.get(img.chapter_id).push(img);
  }

  // 5. Analyze
  let totalChapters = allChapters.length;
  let emptyChapters = 0;
  let chaptersWithDeadCdn = 0;
  let totalDeadPages = 0;
  let duplicateUrls = 0;
  const brokenChapters = [];

  for (const ch of allChapters) {
    const imgs = imagesByChapter.get(ch.id) || [];
    const manga = mangaMap.get(ch.manga_id);

    if (imgs.length === 0) {
      emptyChapters++;
      brokenChapters.push({ manga: manga?.title || '?', ch: ch.number, chId: ch.id, mangaId: ch.manga_id, issue: 'EMPTY (0 images)' });
      continue;
    }

    const deadPages = imgs.filter(i => isDeadCdn(i.image_url) && !isR2(i.image_url));
    if (deadPages.length > 0) {
      chaptersWithDeadCdn++;
      totalDeadPages += deadPages.length;
      brokenChapters.push({
        manga: manga?.title || '?',
        ch: ch.number,
        chId: ch.id,
        mangaId: ch.manga_id,
        issue: `${deadPages.length}/${imgs.length} pages still on dead CDN`,
      });
    }

    // duplicate detection: same image_url within same chapter
    const urlCount = new Map();
    for (const i of imgs) urlCount.set(i.image_url, (urlCount.get(i.image_url) || 0) + 1);
    for (const [, c] of urlCount) if (c > 1) duplicateUrls++;
  }

  // 6. Report
  console.log('\n' + '='.repeat(50));
  console.log('📊 AUDIT RESULTS');
  console.log('='.repeat(50));
  console.log(`Total manga audited   : ${mangas.length}`);
  console.log(`Total chapters        : ${totalChapters}`);
  console.log(`Total chapter images  : ${allImages.length}`);
  console.log(`Empty chapters (0 img): ${emptyChapters}`);
  console.log(`Chapters w/ dead CDN  : ${chaptersWithDeadCdn} (${totalDeadPages} dead pages)`);
  console.log(`Duplicate image URLs  : ${duplicateUrls}`);

  if (brokenChapters.length > 0) {
    console.log('\n🚨 BROKEN CHAPTERS (first 50):');
    for (const b of brokenChapters.slice(0, 50)) {
      console.log(`  • [${b.manga}] Ch ${b.ch} (${b.chId.slice(0, 8)}…) → ${b.issue}`);
    }
    if (brokenChapters.length > 50) {
      console.log(`  … and ${brokenChapters.length - 50} more`);
    }
  } else {
    console.log('\n✅ No broken chapters found!');
  }

  if (doFix && brokenChapters.length > 0) {
    console.log('\n🔧 Auto-fix mode: triggering backfill for broken chapters...');
    const fixedMangaIds = new Set();
    for (const b of brokenChapters) {
      if (b.mangaId) fixedMangaIds.add(b.mangaId);
    }
    console.log(`   → ${fixedMangaIds.size} unique manga to backfill`);
    for (const mid of fixedMangaIds) {
      console.log(`  → backfill manga ${mid}`);
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://olluq.xyz';
      try {
        const res = await fetch(`${baseUrl}/api/v1/admin/storage/backfill`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'chapters', mangaId: mid, limit: 200 }),
        });
        console.log(`    status: ${res.status}`);
      } catch (e) {
        console.log(`    ⚠️ Could not reach API (${e.message}). Run backfill manually from admin dashboard.`);
      }
    }
  }

  console.log('\n✅ Audit complete.');
}

main().catch(e => { console.error(e); process.exit(1); });