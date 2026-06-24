#!/usr/bin/env node
/**
 * COMPREHENSIVE AUDIT v2
 * Efficiently audits ALL manga using batch queries (no per-manga loops)
 * 
 * Checks:
 * 1. Manga with 0 chapters
 * 2. Incomplete chapter sequences (gaps)
 * 3. Chapters with NULL/empty images
 * 4. Non-R2 cover URLs (gmbr.pro, etc.)
 * 5. Chapters still using lazy-load (no source_url)
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('═══════════════════════════════════════════════════════');
console.log('  COMPREHENSIVE AUDIT v2 — All Manga');
console.log('═══════════════════════════════════════════════════════\n');

// ── Step 1: Get all manga (paginated) ──
console.log('Fetching all manga...');
const PAGE = 1000;
let allManga = [];
let mOffset = 0;
let count = 0;

while (true) {
  const { data: batch, count: cnt } = await sb.from('manga')
    .select('id,slug,title,source_url,cover_url,status', { count: 'exact' })
    .is('deleted_at', null)
    .range(mOffset, mOffset + PAGE - 1)
    .order('title');
  
  if (!batch || batch.length === 0) break;
  allManga = allManga.concat(batch);
  count = count || cnt || 0;
  process.stdout.write(`\r  Fetched ${allManga.length}/${count} manga...`);
  if (batch.length < PAGE) break;
  mOffset += PAGE;
}
console.log(`\r  Total manga: ${allManga.length}          \n`);

// Build manga lookup map
const mangaMap = new Map();
for (const m of allManga) mangaMap.set(m.id, m);

// ── Step 2: Get ALL chapters in batches ──
console.log('Fetching all chapters...');
const BATCH = 1000;
let allChapters = [];
let offset = 0;

while (true) {
  const { data: batch, error } = await sb.from('chapters')
    .select('id,manga_id,chapter_number,chapter_images,source_url,thumbnail')
    .is('deleted_at', null)
    .range(offset, offset + BATCH - 1)
    .order('manga_id')
    .order('chapter_number');
  
  if (error) { console.error('Batch error:', error.message); break; }
  if (!batch || batch.length === 0) break;
  allChapters = allChapters.concat(batch);
  process.stdout.write(`\r  Fetched ${allChapters.length} chapters...`);
  if (batch.length < BATCH) break;
  offset += BATCH;
}
console.log(`\r  Total chapters fetched: ${allChapters.length}          \n`);

// ── Step 3: Group chapters by manga_id ──
const chaptersByManga = new Map();
for (const ch of allChapters) {
  if (!chaptersByManga.has(ch.manga_id)) chaptersByManga.set(ch.manga_id, []);
  chaptersByManga.get(ch.manga_id).push(ch);
}

// ── Step 4: Analyze ──
const zeroChapters = [];
const incompleteSeq = [];
const deadImages = [];
const missingSourceUrl = [];
const badCovers = [];
const nonR2Images = [];

for (const [mangaId, manga] of mangaMap) {
  const chapters = chaptersByManga.get(mangaId) || [];
  
  // Check 0 chapters
  if (chapters.length === 0) {
    zeroChapters.push({ slug: manga.slug, title: manga.title, source: manga.source_url, status: manga.status });
  } else {
    // Check incomplete sequence
    const numbers = chapters.map(c => c.chapter_number).sort((a, b) => a - b);
    let hasGap = false;
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1 && !Number.isInteger(numbers[i]) === false) {
        // Only flag if the expected number is missing
        if (!numbers.includes(i + 1)) { hasGap = true; break; }
      }
    }
    // Simpler check: first should be 1, last should be >= length
    if (numbers[0] !== 1 || numbers[numbers.length - 1] < numbers.length) {
      hasGap = true;
    }
    if (hasGap) {
      incompleteSeq.push({ 
        slug: manga.slug, 
        title: manga.title, 
        chapters: numbers.join(','), 
        count: chapters.length,
        first: numbers[0],
        last: numbers[numbers.length - 1]
      });
    }
  }
  
  // Check cover
  if (!manga.cover_url) {
    badCovers.push({ slug: manga.slug, title: manga.title, cover: 'NULL' });
  } else if (!manga.cover_url.startsWith('/api/r2/') && !manga.cover_url.includes('r2.dev') && !manga.cover_url.includes('pub-')) {
    badCovers.push({ slug: manga.slug, title: manga.title, cover: manga.cover_url.substring(0, 100) });
  }
}

// Check dead images & missing source_url across all chapters
for (const ch of allChapters) {
  const manga = mangaMap.get(ch.manga_id);
  if (!manga) continue;
  
  const imgCount = ch.chapter_images ? (Array.isArray(ch.chapter_images) ? ch.chapter_images.length : 0) : 0;
  
  if (imgCount === 0 || ch.chapter_images === null) {
    deadImages.push({ 
      slug: manga.slug, 
      title: manga.title, 
      chapter: ch.chapter_number,
      hasSource: !!ch.source_url
    });
  }
  
  if (!ch.source_url) {
    missingSourceUrl.push({ slug: manga.slug, chapter: ch.chapter_number });
  }
  
  // Check for non-R2 images
  if (ch.chapter_images && Array.isArray(ch.chapter_images)) {
    for (const url of ch.chapter_images) {
      if (typeof url === 'string' && !url.startsWith('/api/r2/') && !url.includes('r2.dev') && !url.includes('pub-') && url !== '') {
        nonR2Images.push({ slug: manga.slug, chapter: ch.chapter_number, url: url.substring(0, 80) });
        break; // One per chapter is enough
      }
    }
  }
}

// ── Step 5: Report ──
const report = {
  totalManga: count,
  totalChapters: allChapters.length,
  zeroChapters: zeroChapters.length,
  incompleteSeq: incompleteSeq.length,
  deadImageChapters: deadImages.length,
  missingSourceUrl: missingSourceUrl.length,
  badCovers: badCovers.length,
  nonR2Images: nonR2Images.length,
};

console.log('═══════════════════════════════════════════════════════');
console.log('  AUDIT SUMMARY');
console.log('═══════════════════════════════════════════════════════');
console.log(JSON.stringify(report, null, 2));
console.log('');

console.log(`\n── ZERO CHAPTERS (${zeroChapters.length}) ──`);
zeroChapters.forEach(m => console.log(`  ${m.slug} | ${m.title} | src: ${m.source || 'NONE'}`));

console.log(`\n── INCOMPLETE SEQUENCE (${incompleteSeq.length}) ──`);
incompleteSeq.slice(0, 30).forEach(m => console.log(`  ${m.slug} | ${m.title} | chs: ${m.first}-${m.last} (${m.count} total)`));
if (incompleteSeq.length > 30) console.log(`  ... and ${incompleteSeq.length - 30} more`);

console.log(`\n── DEAD IMAGES (${deadImages.length} chapters) ──`);
// Group by manga
const deadByManga = {};
for (const d of deadImages) {
  if (!deadByManga[d.slug]) deadByManga[d.slug] = { title: d.title, count: 0, chapters: [] };
  deadByManga[d.slug].count++;
  deadByManga[d.slug].chapters.push(d.chapter);
}
Object.entries(deadByManga).slice(0, 20).forEach(([slug, info]) => {
  console.log(`  ${slug} | ${info.title} | ${info.count} dead chapters: [${info.chapters.join(',')}]`);
});
if (Object.keys(deadByManga).length > 20) console.log(`  ... and ${Object.keys(deadByManga).length - 20} more manga`);

console.log(`\n── BAD/MISSING COVERS (${badCovers.length}) ──`);
badCovers.slice(0, 20).forEach(m => console.log(`  ${m.slug} | ${m.title} | cover: ${m.cover}`));
if (badCovers.length > 20) console.log(`  ... and ${badCovers.length - 20} more`);

console.log(`\n── NON-R2 IMAGES (${nonR2Images.length} chapters) ──`);
nonR2Images.slice(0, 20).forEach(m => console.log(`  ${m.slug} ch${m.chapter} | ${m.url}`));
if (nonR2Images.length > 20) console.log(`  ... and ${nonR2Images.length - 20} more`);

// Save full report
writeFileSync('audit-comprehensive-v2.json', JSON.stringify({
  report,
  zeroChapters,
  incompleteSeq,
  deadImages: deadImages.slice(0, 500),
  badCovers,
  nonR2Images: nonR2Images.slice(0, 500),
}, null, 2));

console.log('\n✅ Full report saved to audit-comprehensive-v2.json');