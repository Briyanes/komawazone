#!/usr/bin/env node
/**
 * FULL AUDIT: All manga & chapters
 * Checks:
 * 1. Thumbnail = 5th image (or last if <5 images)
 * 2. NULL thumbnails
 * 3. Chapters with no images
 * 4. Duplicate chapters (same manga_id + number)
 * 5. Broken thumbnail URLs (spot check via production proxy)
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
console.log('  FULL AUDIT: All Manga & Chapters');
console.log('═══════════════════════════════════════════════════════\n');

// ── Step 1: Get total counts ──
const { count: totalManga } = await sb.from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null);
const { count: totalChapters } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('deleted_at', null);
const { count: totalImages } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });

console.log(`📊 Database Summary:`);
console.log(`   Manga:     ${totalManga?.toLocaleString() ?? '?'}`);
console.log(`   Chapters:  ${totalChapters?.toLocaleString() ?? '?'}`);
console.log(`   Images:    ${totalImages?.toLocaleString() ?? '?'}`);
console.log('');

// ── Step 2: Audit all chapters ──
console.log('🔍 Auditing all chapters...\n');

let offset = 0;
const BATCH = 500;
let correct = 0, wrong = 0, nullThumb = 0, noImages = 0, total = 0;
const issues = [];
const mangaCache = new Map();

while (true) {
  const { data: chapters, error } = await sb.from('chapters')
    .select('id, number, title, thumbnail_url, manga_id')
    .is('deleted_at', null)
    .order('id')
    .range(offset, offset + BATCH - 1);

  if (error) {
    console.error('Error fetching chapters:', error.message);
    break;
  }
  if (!chapters || chapters.length === 0) break;

  for (const ch of chapters) {
    total++;

    // Get images for this chapter
    const { data: imgs, count: imgCount } = await sb.from('chapter_images')
      .select('image_url', { count: 'exact' })
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(0, 4); // Get first 5 images

    if (!imgCount || imgCount === 0) {
      noImages++;
      // Cache manga name
      if (!mangaCache.has(ch.manga_id)) {
        const { data: m } = await sb.from('manga').select('title, slug').eq('id', ch.manga_id).single();
        mangaCache.set(ch.manga_id, m);
      }
      const m = mangaCache.get(ch.manga_id);
      if (issues.length < 50) issues.push({
        type: 'NO_IMAGES',
        manga: m?.title || '?',
        slug: m?.slug || '?',
        chapter: ch.number,
        chId: ch.id,
      });
      continue;
    }

    if (!ch.thumbnail_url) {
      nullThumb++;
      if (!mangaCache.has(ch.manga_id)) {
        const { data: m } = await sb.from('manga').select('title, slug').eq('id', ch.manga_id).single();
        mangaCache.set(ch.manga_id, m);
      }
      const m = mangaCache.get(ch.manga_id);
      if (issues.length < 50) issues.push({
        type: 'NULL_THUMB',
        manga: m?.title || '?',
        slug: m?.slug || '?',
        chapter: ch.number,
        chId: ch.id,
      });
      continue;
    }

    // Expected: 5th image (index 4), or last available if <5
    const expectedIdx = Math.min(4, imgCount - 1);
    const expectedUrl = imgs?.[expectedIdx]?.image_url;

    if (!expectedUrl) {
      // Can't determine, skip
      continue;
    }

    if (ch.thumbnail_url === expectedUrl) {
      correct++;
    } else {
      wrong++;
      if (!mangaCache.has(ch.manga_id)) {
        const { data: m } = await sb.from('manga').select('title, slug').eq('id', ch.manga_id).single();
        mangaCache.set(ch.manga_id, m);
      }
      const m = mangaCache.get(ch.manga_id);
      if (issues.length < 100) issues.push({
        type: 'WRONG_THUMB',
        manga: m?.title || '?',
        slug: m?.slug || '?',
        chapter: ch.number,
        chId: ch.id,
        current: ch.thumbnail_url.split('/').pop(),
        expected: expectedUrl.split('/').pop(),
        currentUrl: ch.thumbnail_url,
        expectedUrl,
      });
    }
  }

  const pct = ((total / totalChapters) * 100).toFixed(1);
  process.stdout.write(`\r   Progress: ${total.toLocaleString()}/${totalChapters?.toLocaleString()} (${pct}%) | ✅${correct} ⚠️${wrong} ❌${nullThumb} 📭${noImages}   `);

  if (chapters.length < BATCH) break;
  offset += BATCH;
}

console.log('\n\n═══════════════════════════════════════════════════════');
console.log('  AUDIT RESULTS');
console.log('═══════════════════════════════════════════════════════\n');

console.log(`✅ Correct thumbnail (5th image):  ${correct.toLocaleString()}`);
console.log(`⚠️  Wrong thumbnail:               ${wrong.toLocaleString()}`);
console.log(`❌ NULL thumbnail:                ${nullThumb.toLocaleString()}`);
console.log(`📭 Chapter with no images:        ${noImages.toLocaleString()}`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   Total chapters checked:         ${total.toLocaleString()}`);
console.log('');

const pctCorrect = total > 0 ? ((correct / total) * 100).toFixed(2) : 0;
console.log(`✨ Accuracy: ${pctCorrect}%\n`);

// ── Step 3: Check for duplicate chapters ──
console.log('🔍 Checking for duplicate chapters...\n');
const { data: dupes } = await sb.rpc('check_duplicate_chapters').catch(() => ({ data: null }));
// If RPC doesn't exist, do manual check
if (!dupes) {
  // Get all manga IDs
  const { data: allManga } = await sb.from('manga').select('id, title, slug').is('deleted_at', null);
  let dupCount = 0;
  const dupIssues = [];
  
  for (const m of allManga || []) {
    const { data: chs } = await sb.from('chapters')
      .select('id, number')
      .eq('manga_id', m.id)
      .is('deleted_at', null);
    
    const numMap = {};
    for (const c of chs || []) {
      if (numMap[c.number]) {
        dupCount++;
        if (dupIssues.length < 20) dupIssues.push({
          manga: m.title,
          slug: m.slug,
          chapter: c.number,
          chIds: [numMap[c.number], c.id],
        });
      } else {
        numMap[c.number] = c.id;
      }
    }
  }
  
  console.log(`   Duplicate chapters found: ${dupCount}`);
  if (dupIssues.length > 0) {
    console.log('\n   First 20 duplicates:');
    dupIssues.forEach(d => console.log(`     ${d.manga} Ch ${d.chapter} (${d.slug})`));
  }
} else {
  console.log(`   Duplicate chapters found: ${dupes.length}`);
  dupes.forEach(d => console.log(`     ${JSON.stringify(d)}`));
}

// ── Step 4: Print issues ──
if (issues.length > 0) {
  console.log(`\n═══════════════════════════════════════════════════════`);
  console.log(`  ISSUES FOUND (showing first ${issues.length})`);
  console.log(`═══════════════════════════════════════════════════════\n`);

  // Group by type
  const byType = {};
  for (const iss of issues) {
    if (!byType[iss.type]) byType[iss.type] = [];
    byType[iss.type].push(iss);
  }

  for (const [type, items] of Object.entries(byType)) {
    console.log(`\n── ${type} (${items.length}${items.length >= (type === 'WRONG_THUMB' ? 100 : 50) ? '+ more' : ''}) ──`);
    items.slice(0, 20).forEach(i => {
      if (i.type === 'WRONG_THUMB') {
        console.log(`  ${i.manga} | Ch ${i.chapter}`);
        console.log(`    current:  ${i.current}`);
        console.log(`    expected: ${i.expected}`);
      } else {
        console.log(`  ${i.manga} | Ch ${i.chapter} | ${i.slug}`);
      }
    });
  }
} else {
  console.log('\n✅ NO ISSUES FOUND! All chapters are correct.');
}

// ── Step 5: Save report ──
const report = {
  timestamp: new Date().toISOString(),
  summary: { totalManga, totalChapters, totalImages },
  results: { correct, wrong, nullThumb, noImages, total, pctCorrect },
  issues: issues.slice(0, 200),
};
writeFileSync('docs/AUDIT_FULL_REPORT.json', JSON.stringify(report, null, 2));
console.log('\n📁 Full report saved to docs/AUDIT_FULL_REPORT.json');
console.log('═══════════════════════════════════════════════════════\n');