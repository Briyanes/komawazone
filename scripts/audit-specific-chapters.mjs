#!/usr/bin/env node
/**
 * Audit specific chapters for image completeness + project-wide scan for ≤1 image chapters.
 *
 * Usage:
 *   node scripts/audit-specific-chapters.mjs --chapters="uuid1,uuid2,uuid3"
 *   node scripts/audit-specific-chapters.mjs --scan-all          # Find ALL chapters with ≤1 image
 *   node scripts/audit-specific-chapters.mjs --manga="manga-slug" # Audit all chapters in a manga
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── Parse Args ───
const args = process.argv.slice(2);
const chaptersArg = args.find(a => a.startsWith('--chapters='));
const scanAll = args.includes('--scan-all');
const mangaArg = args.find(a => a.startsWith('--manga='));

const specificChapterIds = chaptersArg
  ? chaptersArg.replace('--chapters=', '').split(',').map(s => s.trim()).filter(Boolean)
  : [];

// ─── Helpers ───
async function getChapterImages(chapterId) {
  const { data, error } = await supabase
    .from('chapter_images')
    .select('id, number, image_url')
    .eq('chapter_id', chapterId)
    .order('number', { ascending: true });
  if (error) throw error;
  return data || [];
}

async function getChapterInfo(chapterId) {
  const { data, error } = await supabase
    .from('chapters')
    .select('id, number, title, source_url, manga_id, thumbnail_url')
    .eq('id', chapterId)
    .single();
  if (error) throw error;
  return data;
}

async function getMangaInfo(mangaId) {
  const { data, error } = await supabase
    .from('manga')
    .select('id, title, slug, source_url')
    .eq('id', mangaId)
    .single();
  if (error) throw error;
  return data;
}

function classifyImageUrl(url) {
  if (!url) return 'null';
  if (url.includes('r2.dev') || url.includes('olluq.xyz') || url.includes('cloudflarestorage') || url.includes('/r2/')) return 'r2';
  if (url.includes('gmbr.co') || url.includes('manhwaland') || url.includes('kimcartoon') || url.includes('i0.wp.com')) return 'source';
  return 'other';
}

async function checkR2Url(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return { status: res.status, ok: res.ok, contentType: res.headers.get('content-type'), size: res.headers.get('content-length') };
  } catch (err) {
    return { status: 0, ok: false, error: err.message };
  }
}

// ─── Audit Specific Chapter ───
async function auditSpecificChapter(chapterId) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔍 AUDIT CHAPTER: ${chapterId}`);
  console.log('═'.repeat(70));

  // 1. Chapter info
  const ch = await getChapterInfo(chapterId);
  if (!ch) {
    console.log(`❌ Chapter not found in database!`);
    return null;
  }

  const manga = await getMangaInfo(ch.manga_id);
  console.log(`📖 Manga:    ${manga?.title || 'Unknown'} (${manga?.slug || '?'})`);
  console.log(`📄 Chapter:  #${ch.number} — ${ch.title || '(no title)'}`);
  console.log(`🔗 Source:   ${ch.source_url || '(none)'}`);
  console.log(`🖼️  Thumb:   ${ch.thumbnail_url || '(none)'}`);

  // 2. Images in DB
  const images = await getChapterImages(chapterId);
  console.log(`\n📊 Images in DB: ${images.length}`);

  if (images.length === 0) {
    console.log(`🚨 CRITICAL: Chapter has ZERO images!`);
    return { chapterId, manga: manga?.title, number: ch.number, imageCount: 0, status: 'EMPTY', sourceUrl: ch.source_url };
  }

  // 3. Classify images
  const byType = {};
  for (const img of images) {
    const type = classifyImageUrl(img.image_url);
    byType[type] = (byType[type] || 0) + 1;
  }
  console.log(`   Breakdown:`, byType);

  // 4. Show first 5 and last 5
  console.log(`\n   First 5 images:`);
  for (const img of images.slice(0, 5)) {
    console.log(`     #${img.number}: ${img.image_url?.substring(0, 80)}...`);
  }
  if (images.length > 10) {
    console.log(`   ... (${images.length - 10} more)`);
    console.log(`   Last 5 images:`);
    for (const img of images.slice(-5)) {
      console.log(`     #${img.number}: ${img.image_url?.substring(0, 80)}...`);
    }
  }

  // 5. Check R2 health (sample 3 images)
  const r2Images = images.filter(i => classifyImageUrl(i.image_url) === 'r2');
  if (r2Images.length > 0) {
    console.log(`\n🩺 R2 Health Check (sampling 3 images):`);
    const sample = [r2Images[0], r2Images[Math.floor(r2Images.length / 2)], r2Images[r2Images.length - 1]];
    for (const img of sample) {
      const health = await checkR2Url(img.image_url);
      const icon = health.ok ? '✅' : '❌';
      console.log(`   ${icon} #${img.number}: ${health.status} ${health.contentType || ''} ${health.size ? `(${(health.size / 1024).toFixed(0)}KB)` : ''}`);
      if (!health.ok) console.log(`      Error: ${health.error || 'HTTP error'}`);
    }
  }

  // 6. Determine status
  let status = 'OK';
  if (images.length === 0) status = 'EMPTY';
  else if (images.length === 1) status = 'SINGLE_IMAGE';
  else if (images.length < 5) status = 'LOW_IMAGES';
  else if (byType.source > 0) status = 'HAS_SOURCE_URLS';

  console.log(`\n📌 Status: ${status}`);

  return {
    chapterId,
    manga: manga?.title,
    mangaSlug: manga?.slug,
    number: ch.number,
    imageCount: images.length,
    status,
    sourceUrl: ch.source_url,
    byType,
  };
}

// ─── Scan All: Find chapters with ≤1 image ───
async function scanAllProblematicChapters() {
  console.log('\n\n' + '═'.repeat(70));
  console.log('🔍 PROJECT-WIDE SCAN: Finding chapters with ≤1 image');
  console.log('═'.repeat(70) + '\n');

  // Step 1: Get all chapter IDs
  console.log('📦 Fetching all chapters...');
  let allChapters = [];
  let offset = 0;
  while (offset < 60000) {
    const { data: batch, error } = await supabase
      .from('chapters')
      .select('id, number, manga_id, source_url, title')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) throw error;
    if (!batch || batch.length === 0) break;
    allChapters.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  console.log(`📦 Total active chapters: ${allChapters.length}`);

  // Step 2: Count images per chapter via chapter_images
  console.log('📦 Counting images per chapter (this may take a while)...');
  const imageCountMap = {};
  offset = 0;
  let totalImages = 0;
  while (offset < 500000) {
    const { data: batch, error } = await supabase
      .from('chapter_images')
      .select('chapter_id')
      .range(offset, offset + 999);
    if (error) throw error;
    if (!batch || batch.length === 0) break;
    for (const row of batch) {
      imageCountMap[row.chapter_id] = (imageCountMap[row.chapter_id] || 0) + 1;
      totalImages++;
    }
    if (batch.length < 1000) break;
    offset += 1000;
    if (offset % 10000 === 0) process.stdout.write(`\r   Processed ${totalImages} images...`);
  }
  console.log(`\n   Total images across all chapters: ${totalImages}`);

  // Step 3: Find problematic chapters
  const empty = [];      // 0 images
  const single = [];     // 1 image
  const low = [];        // 2-4 images

  for (const ch of allChapters) {
    const count = imageCountMap[ch.id] || 0;
    if (count === 0) empty.push({ ...ch, imageCount: 0 });
    else if (count === 1) single.push({ ...ch, imageCount: 1 });
    else if (count < 5) low.push({ ...ch, imageCount: count });
  }

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 AUDIT RESULTS`);
  console.log('═'.repeat(70));
  console.log(`  📦 Total chapters:     ${allChapters.length}`);
  console.log(`  ✅ With images (5+):   ${allChapters.length - empty.length - single.length - low.length}`);
  console.log(`  ⚠️  Low (2-4 images):   ${low.length}`);
  console.log(`  🚨 Single image:       ${single.length}`);
  console.log(`  💀 Empty (0 images):   ${empty.length}`);
  console.log(`  ─────────────────`);
  console.log(`  📊 Total problematic:  ${empty.length + single.length + low.length}`);

  // Group by manga
  function groupByManga(list) {
    const map = {};
    for (const ch of list) {
      if (!map[ch.manga_id]) map[ch.manga_id] = [];
      map[ch.manga_id].push(ch);
    }
    return map;
  }

  // Show empty chapters by manga
  if (empty.length > 0) {
    const byManga = groupByManga(empty);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`💀 EMPTY CHAPTERS (0 images) — ${empty.length} total`);
    console.log('─'.repeat(70));
    // Fetch manga titles for top 15
    const topEmpty = Object.entries(byManga).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    for (const [mangaId, chapters] of topEmpty) {
      const { data: m } = await supabase.from('manga').select('title, slug').eq('id', mangaId).single();
      console.log(`\n  📖 ${m?.title || mangaId} — ${chapters.length} empty chapters`);
      for (const ch of chapters.slice(0, 5)) {
        console.log(`     Ch ${ch.number}: ${ch.source_url || '(no source)'}`);
      }
      if (chapters.length > 5) console.log(`     ... and ${chapters.length - 5} more`);
    }
  }

  // Show single image chapters by manga
  if (single.length > 0) {
    const byManga = groupByManga(single);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`🚨 SINGLE IMAGE CHAPTERS — ${single.length} total`);
    console.log('─'.repeat(70));
    const topSingle = Object.entries(byManga).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    for (const [mangaId, chapters] of topSingle) {
      const { data: m } = await supabase.from('manga').select('title, slug').eq('id', mangaId).single();
      console.log(`\n  📖 ${m?.title || mangaId} — ${chapters.length} single-image chapters`);
      for (const ch of chapters.slice(0, 5)) {
        console.log(`     Ch ${ch.number}: ${ch.source_url || '(no source)'}`);
      }
      if (chapters.length > 5) console.log(`     ... and ${chapters.length - 5} more`);
    }
  }

  // Show low image chapters (summary only)
  if (low.length > 0) {
    const byManga = groupByManga(low);
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`⚠️  LOW IMAGE CHAPTERS (2-4 images) — ${low.length} total`);
    console.log('─'.repeat(70));
    const topLow = Object.entries(byManga).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    for (const [mangaId, chapters] of topLow) {
      const { data: m } = await supabase.from('manga').select('title, slug').eq('id', mangaId).single();
      console.log(`  📖 ${m?.title || mangaId}: ${chapters.length} chapters with 2-4 images`);
    }
  }

  // Save full report
  const fs = await import('fs/promises');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalChapters: allChapters.length,
      empty: empty.length,
      singleImage: single.length,
      lowImages: low.length,
      totalProblematic: empty.length + single.length + low.length,
    },
    emptyChapters: empty,
    singleImageChapters: single,
    lowImageChapters: low,
  };
  await fs.writeFile('scripts/data/chapter-audit-report.json', JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: scripts/data/chapter-audit-report.json`);
  console.log(`\n💡 To fix: npm run import:local:backfill-empty`);
}

// ─── Audit by Manga slug ───
async function auditByMangaSlug(slug) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🔍 AUDIT MANGA: ${slug}`);
  console.log('═'.repeat(70));

  const { data: manga, error: mErr } = await supabase
    .from('manga')
    .select('id, title, slug, source_url')
    .eq('slug', slug)
    .single();
  if (mErr || !manga) {
    console.log(`❌ Manga not found: ${slug}`);
    return;
  }

  console.log(`📖 ${manga.title} (${manga.id})`);
  console.log(`🔗 Source: ${manga.source_url}`);

  const { data: chapters, error: cErr } = await supabase
    .from('chapters')
    .select('id, number, title, source_url')
    .eq('manga_id', manga.id)
    .is('deleted_at', null)
    .order('number', { ascending: true });
  if (cErr) throw cErr;

  console.log(`📦 Total chapters: ${chapters.length}\n`);

  const results = [];
  for (const ch of chapters) {
    const images = await getChapterImages(ch.id);
    const status = images.length === 0 ? '💀' : images.length === 1 ? '🚨' : images.length < 5 ? '⚠️' : '✅';
    console.log(`  ${status} Ch ${ch.number}: ${images.length} images — ${ch.source_url || '(no source)'}`);
    results.push({ chapterId: ch.id, number: ch.number, imageCount: images.length, status });
  }

  const problematic = results.filter(r => r.imageCount < 5);
  console.log(`\n📊 Summary: ${problematic.length}/${chapters.length} chapters may have issues`);

  if (problematic.length > 0) {
    console.log(`\n💡 Fix: npm run import:local -- full --url="${manga.source_url}" --limit=50`);
  }
}

// ─── Main ───
async function main() {
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '  🔍 CHAPTER IMAGE AUDIT TOOL'.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');

  if (specificChapterIds.length > 0) {
    const results = [];
    for (const id of specificChapterIds) {
      const result = await auditSpecificChapter(id);
      if (result) results.push(result);
    }

    // Summary
    console.log('\n\n' + '═'.repeat(70));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(70));
    for (const r of results) {
      const icon = r.status === 'EMPTY' ? '💀' : r.status === 'SINGLE_IMAGE' ? '🚨' : r.status === 'LOW_IMAGES' ? '⚠️' : '✅';
      console.log(`  ${icon} ${r.manga} Ch ${r.number}: ${r.imageCount} images [${r.status}]`);
    }
  } else if (scanAll) {
    await scanAllProblematicChapters();
  } else if (mangaArg) {
    const slug = mangaArg.replace('--manga=', '');
    await auditByMangaSlug(slug);
  } else {
    console.log('\nUsage:');
    console.log('  node scripts/audit-specific-chapters.mjs --chapters="uuid1,uuid2,uuid3"');
    console.log('  node scripts/audit-specific-chapters.mjs --scan-all');
    console.log('  node scripts/audit-specific-chapters.mjs --manga="manga-slug"');
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});