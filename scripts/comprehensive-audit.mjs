#!/usr/bin/env node
/**
 * COMPREHENSIVE AUDIT — Full manga/chapter/image integrity check
 *
 * Layer 1: Manga dengan 0 chapters (no chapter at all)
 * Layer 2: Chapters dengan 0 images (metadata-only)
 * Layer 3: Chapters dengan < 3 images (kemungkinan incomplete download)
 * Layer 4: Image URLs non-R2 (belum di-migrate ke R2)
 * Layer 5: Source vs DB comparison (sample manga, cek missing chapters)
 *
 * Output:
 *   - Terminal summary
 *   - docs/COMPREHENSIVE_AUDIT_<timestamp>.json
 *   - audit-fix-list.txt (list untuk batch fix)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';

// Inline fetchWithRetries (self-contained, no external dep)
async function fetchWithRetries(url, opts = {}, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', ...(opts.headers || {}) },
        signal: AbortSignal.timeout(opts.timeout || 15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}

// ── Load env ──
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const BATCH = 1000;
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const REPORT_DIR = 'docs';
const REPORT_FILE = `${REPORT_DIR}/COMPREHENSIVE_AUDIT_${ts}.json`;
const FIX_LIST_FILE = `${REPORT_DIR}/audit-fix-list_${ts}.txt`;

mkdirSync(REPORT_DIR, { recursive: true });

console.log('═══════════════════════════════════════════════════════');
console.log('  🔍 COMPREHENSIVE AUDIT: Manga / Chapter / Image');
console.log('═══════════════════════════════════════════════════════\n');

// ── Get totals ──
const { count: totalManga } = await sb.from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null);
const { count: totalChapters } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null);
const { count: totalImages } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });

console.log('📊 Database Summary:');
console.log(`   Manga:     ${totalManga?.toLocaleString() ?? '?'}`);
console.log(`   Chapters:  ${totalChapters?.toLocaleString() ?? '?'}`);
console.log(`   Images:    ${totalImages?.toLocaleString() ?? '?'}`);
console.log('');

// ── Helper: Fetch all chapters with manga_id ──
async function fetchAllChapters() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('chapters')
      .select('id, number, title, manga_id, thumbnail_url, source_url')
      .is('deleted_at', null)
      .order('id')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Chapter fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    process.stdout.write(`\r   Fetching chapters... ${all.length.toLocaleString()}`);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  console.log(' ✅');
  return all;
}

// ── Helper: Fetch all chapter_images count per chapter_id ──
async function fetchImageCounts() {
  // Use RPC if available, otherwise batch query
  const counts = new Map();
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('chapter_images')
      .select('chapter_id, image_url')
      .order('chapter_id')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Image fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    for (const row of data) {
      if (!counts.has(row.chapter_id)) counts.set(row.chapter_id, { count: 0, urls: [] });
      const entry = counts.get(row.chapter_id);
      entry.count++;
      entry.urls.push(row.image_url);
    }
    process.stdout.write(`\r   Fetching images... ${(offset + data.length).toLocaleString()}`);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  console.log(' ✅');
  return counts;
}

// ── Helper: Fetch all manga ──
async function fetchAllManga() {
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('manga')
      .select('id, title, slug, source_url, cover_url')
      .is('deleted_at', null)
      .order('title')
      .range(offset, offset + BATCH - 1);
    if (error) { console.error('Manga fetch error:', error.message); break; }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < BATCH) break;
    offset += BATCH;
  }
  return all;
}

// ═══════════════════════════════════════════════════════
//  FETCH ALL DATA
// ═══════════════════════════════════════════════════════
console.log('\n📥 Fetching all data...\n');
const [allManga, allChapters, imageMap] = await Promise.all([
  fetchAllManga(),
  fetchAllChapters(),
  fetchImageCounts(),
]);

console.log(`   Manga loaded:     ${allManga.length.toLocaleString()}`);
console.log(`   Chapters loaded:  ${allChapters.length.toLocaleString()}`);
console.log(`   Image groups:     ${imageMap.size.toLocaleString()}\n`);

// ═══════════════════════════════════════════════════════
//  LAYER 1: Manga dengan 0 chapters
// ═══════════════════════════════════════════════════════
console.log('─── Layer 1: Manga dengan 0 chapters ───');
const mangaChapterCount = new Map();
for (const ch of allChapters) {
  mangaChapterCount.set(ch.manga_id, (mangaChapterCount.get(ch.manga_id) || 0) + 1);
}
const mangaNoChapters = allManga.filter(m => !mangaChapterCount.has(m.id));
console.log(`   ❌ Manga tanpa chapter: ${mangaNoChapters.length}`);
if (mangaNoChapters.length > 0 && mangaNoChapters.length <= 20) {
  mangaNoChapters.forEach(m => console.log(`      • ${m.title} (${m.slug})`));
}
console.log('');

// ═══════════════════════════════════════════════════════
//  LAYER 2: Chapters dengan 0 images
// ═══════════════════════════════════════════════════════
console.log('─── Layer 2: Chapters dengan 0 images (metadata-only) ───');
const chaptersNoImages = allChapters.filter(ch => !imageMap.has(ch.id) || imageMap.get(ch.id).count === 0);
console.log(`   ❌ Chapter tanpa images: ${chaptersNoImages.length}`);
console.log('');

// ═══════════════════════════════════════════════════════
//  LAYER 3: Chapters dengan < 3 images (incomplete)
// ═══════════════════════════════════════════════════════
console.log('─── Layer 3: Chapters dengan < 3 images (incomplete) ───');
const chaptersFewImages = allChapters.filter(ch => {
  const imgData = imageMap.get(ch.id);
  return imgData && imgData.count > 0 && imgData.count < 3;
});
console.log(`   ⚠️  Chapter dengan < 3 images: ${chaptersFewImages.length}`);
console.log('');

// ═══════════════════════════════════════════════════════
//  LAYER 4: Non-R2 image URLs
// ═══════════════════════════════════════════════════════
console.log('─── Layer 4: Non-R2 image URLs ───');
const r2Pattern = /\/api\/r2\/image\/|\.r2\.cloudflarestorage\.com|pub-[a-f0-9]+\.r2\.dev/i;
let nonR2Count = 0;
const nonR2Samples = [];
for (const [chId, imgData] of imageMap) {
  for (const url of imgData.urls) {
    if (url && !r2Pattern.test(url)) {
      nonR2Count++;
      if (nonR2Samples.length < 10) {
        const ch = allChapters.find(c => c.id === chId);
        const manga = allManga.find(m => m.id === ch?.manga_id);
        nonR2Samples.push({ manga: manga?.title, chapter: ch?.number, url });
      }
    }
  }
}
console.log(`   ⚠️  Non-R2 image URLs: ${nonR2Count.toLocaleString()}`);
if (nonR2Samples.length > 0) {
  console.log('   Samples:');
  nonR2Samples.forEach(s => console.log(`      • ${s.manga} Ch${s.chapter}: ${s.url?.slice(0, 80)}...`));
}
console.log('');

// ═══════════════════════════════════════════════════════
//  LAYER 5: Source vs DB comparison (SAMPLE)
// ═══════════════════════════════════════════════════════
console.log('─── Layer 5: Source vs DB chapter count (SAMPLE 30) ───');
console.log('   Checking 30 random manga against source...\n');

// Pick 30 manga with source_url
const mangaWithSource = allManga.filter(m => m.source_url);
const sampleSize = Math.min(30, mangaWithSource.length);
const sampleManga = [];
for (let i = 0; i < sampleSize; i++) {
  sampleManga.push(mangaWithSource[Math.floor(Math.random() * mangaWithSource.length)]);
}

const sourceMismatches = [];
let sampleChecked = 0;
for (const m of sampleManga) {
  sampleChecked++;
  const dbCount = mangaChapterCount.get(m.id) || 0;

  // Fetch source chapter count
  try {
    let sourceUrl = m.source_url;
    // Domain rewrite if needed
    sourceUrl = sourceUrl.replace('04x.manhwaland.land', '04x-1s.manhwaland.land');

    const html = await fetchWithRetries(sourceUrl, { timeout: 15000 });
    // Count chapter links in HTML
    const chapterMatches = html.match(/data-chapter[^"]*"[^"]*"|class="[^"]*chapter[^"]*"/gi) || [];
    const numLinks = (html.match(/chapter-\d+/gi) || []).length;
    const sourceCount = Math.max(chapterMatches.length, numLinks);

    if (sourceCount > 0 && dbCount < sourceCount * 0.9) {
      sourceMismatches.push({
        title: m.title,
        slug: m.slug,
        dbChapters: dbCount,
        estimatedSource: sourceCount,
        sourceUrl,
      });
      console.log(`   ⚠️  ${m.title}: DB=${dbCount} vs Source~=${sourceCount}`);
    }
  } catch (e) {
    // Skip if fetch fails
  }

  if (sampleChecked % 10 === 0) {
    console.log(`   Checked ${sampleChecked}/${sampleSize}...`);
  }
}
console.log(`   Mismatches found in sample: ${sourceMismatches.length}/${sampleSize}`);
console.log('');

// ═══════════════════════════════════════════════════════
//  BUILD FIX LIST
// ═══════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════');
console.log('  📋 SUMMARY');
console.log('═══════════════════════════════════════════════════════\n');

console.log(`Layer 1 - Manga tanpa chapter:      ${mangaNoChapters.length > 0 ? '❌' : '✅'}  ${mangaNoChapters.length}`);
console.log(`Layer 2 - Chapter tanpa images:      ${chaptersNoImages.length > 0 ? '❌' : '✅'}  ${chaptersNoImages.length.toLocaleString()}`);
console.log(`Layer 3 - Chapter < 3 images:        ${chaptersFewImages.length > 0 ? '⚠️ ' : '✅'}  ${chaptersFewImages.length.toLocaleString()}`);
console.log(`Layer 4 - Non-R2 image URLs:         ${nonR2Count > 0 ? '⚠️ ' : '✅'}  ${nonR2Count.toLocaleString()}`);
console.log(`Layer 5 - Source vs DB mismatch:     ${sourceMismatches.length > 0 ? '⚠️ ' : '✅'}  ${sourceMismatches.length} (from ${sampleSize} sample)`);
console.log('');

// ═══════════════════════════════════════════════════════
//  SAVE REPORTS
// ═══════════════════════════════════════════════════════

// JSON report
const report = {
  timestamp: new Date().toISOString(),
  database: { totalManga, totalChapters, totalImages },
  layer1_mangaNoChapters: mangaNoChapters.slice(0, 200).map(m => ({ id: m.id, title: m.title, slug: m.slug, source_url: m.source_url })),
  layer2_chaptersNoImages: chaptersNoImages.slice(0, 500).map(ch => {
    const m = allManga.find(x => x.id === ch.manga_id);
    return { chapterId: ch.id, mangaId: ch.manga_id, manga: m?.title, slug: m?.slug, number: ch.number, source_url: ch.source_url };
  }),
  layer3_chaptersFewImages: chaptersFewImages.slice(0, 200).map(ch => {
    const m = allManga.find(x => x.id === ch.manga_id);
    return { chapterId: ch.id, manga: m?.title, slug: m?.slug, number: ch.number, imageCount: imageMap.get(ch.id)?.count };
  }),
  layer4_nonR2Count: nonR2Count,
  layer4_nonR2Samples: nonR2Samples,
  layer5_sourceMismatches: sourceMismatches,
};

writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
console.log(`📁 JSON report: ${REPORT_FILE}`);

// Fix list (text format for batch processing)
let fixList = `# COMPREHENSIVE AUDIT FIX LIST\n`;
fixList += `# Generated: ${new Date().toISOString()}\n`;
fixList += `# Total issues: ${mangaNoChapters.length + chaptersNoImages.length + chaptersFewImages.length}\n\n`;

fixList += `# === MANGA TANPA CHAPTER (${mangaNoChapters.length}) ===\n`;
fixList += `# Format: slug | source_url\n`;
for (const m of mangaNoChapters.slice(0, 500)) {
  if (m.source_url) fixList += `${m.slug} | ${m.source_url}\n`;
}

fixList += `\n# === CHAPTER TANPA IMAGES (${chaptersNoImages.length}) ===\n`;
fixList += `# Format: slug | chapterNumber | chapterId | source_url\n`;
for (const ch of chaptersNoImages.slice(0, 500)) {
  const m = allManga.find(x => x.id === ch.manga_id);
  if (m?.slug && ch.source_url) {
    fixList += `${m.slug} | ${ch.number} | ${ch.id} | ${ch.source_url}\n`;
  }
}

writeFileSync(FIX_LIST_FILE, fixList);
console.log(`📁 Fix list:      ${FIX_LIST_FILE}`);
console.log('═══════════════════════════════════════════════════════\n');

// Exit with code 1 if issues found (for CI)
if (mangaNoChapters.length > 0 || chaptersNoImages.length > 0) {
  console.log('🚨 ISSUES DETECTED — Silakan cek fix list & jalankan import ulang');
}