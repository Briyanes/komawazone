#!/usr/bin/env node
/**
 * FIX AUDIT ISSUES — Generate prioritized fix list untuk manga bermasalah
 *
 * Query DB untuk:
 *   1. Manga dengan 0 chapters
 *   2. Manga dengan chapters yang tidak punya images (chapter_images count = 0)
 *
 * Output: audit-fix-list.txt (format URL per baris untuk batch import)
 *
 * Cara pakai setelah generate:
 *   npm run import:local -- batch --file audit-fix-list.txt --proxy --delay 1500
 *
 * Atau untuk auto-prioritas:
 *   node scripts/fix-audit-issues.mjs --run   # langsung jalankan via subprocess
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';
import { exec } from 'child_process';

// ── Load env ──
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BATCH = 1000;
const autoRun = process.argv.includes('--run');
const limitManga = process.argv.includes('--limit') 
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10) 
  : 0; // 0 = no limit

console.log('═══════════════════════════════════════════════════════');
console.log('  🔧 FIX AUDIT ISSUES — Generate Priority Fix List');
console.log('═══════════════════════════════════════════════════════\n');

// ── 1. Fetch all manga ──
console.log('📥 Fetching manga...');
const allManga = [];
let offset = 0;
while (true) {
  const { data, error } = await sb.from('manga')
    .select('id, slug, title, source_url')
    .not('source_url', 'is', null)
    .is('deleted_at', null)
    .order('title')
    .range(offset, offset + BATCH - 1);
  if (error) { console.error('Manga fetch error:', error.message); break; }
  if (!data?.length) break;
  allManga.push(...data);
  if (data.length < BATCH) break;
  offset += BATCH;
}
console.log(`   ✅ ${allManga.length} manga with source_url\n`);

// ── 2. Fetch chapter counts per manga + image status ──
console.log('📥 Fetching chapters...');
const chapterMap = new Map(); // manga_id → { total, withImages, withoutImages }
offset = 0;
while (true) {
  const { data, error } = await sb.from('chapters')
    .select('id, manga_id, thumbnail_url')
    .is('deleted_at', null)
    .order('id')
    .range(offset, offset + BATCH - 1);
  if (error) { console.error('Chapter fetch error:', error.message); break; }
  if (!data?.length) break;
  for (const ch of data) {
    if (!chapterMap.has(ch.manga_id)) {
      chapterMap.set(ch.manga_id, { total: 0, withImages: 0, withoutImages: 0 });
    }
    const entry = chapterMap.get(ch.manga_id);
    entry.total++;
    if (ch.thumbnail_url) entry.withImages++;
    else entry.withoutImages++;
  }
  process.stdout.write(`\r   Fetched ${offset + data.length} chapters...`);
  if (data.length < BATCH) break;
  offset += BATCH;
}
console.log(' ✅\n');

// ── 3. Identify problematic manga ──
console.log('🔍 Identifying problematic manga...\n');

const mangaNoChapters = [];     // Priority 1: 0 chapters
const mangaPartialImages = [];  // Priority 2: chapters without images
const mangaComplete = [];       // OK

for (const m of allManga) {
  const stats = chapterMap.get(m.id) || { total: 0, withImages: 0, withoutImages: 0 };
  if (stats.total === 0) {
    mangaNoChapters.push({ ...m, ...stats });
  } else if (stats.withoutImages > 0) {
    mangaPartialImages.push({ ...m, ...stats, missingRatio: stats.withoutImages / stats.total });
  } else {
    mangaComplete.push(m);
  }
}

// Sort partial by missing ratio (highest first)
mangaPartialImages.sort((a, b) => b.missingRatio - a.missingRatio);

console.log(`   ❌ Manga dengan 0 chapter:          ${mangaNoChapters.length}`);
console.log(`   ⚠️  Manga dengan chapter no-images:  ${mangaPartialImages.length}`);
console.log(`   ✅ Manga lengkap:                    ${mangaComplete.length}`);
console.log('');

// Apply limit if specified
let listNoChapters = mangaNoChapters;
let listPartial = mangaPartialImages;
if (limitManga > 0) {
  listNoChapters = mangaNoChapters.slice(0, limitManga);
  const remaining = Math.max(0, limitManga - listNoChapters.length);
  listPartial = mangaPartialImages.slice(0, remaining);
  console.log(`   📊 Dibatasi ke ${limitManga} manga total\n`);
}

// ── 4. Generate fix list ──
const fixListPath = 'audit-fix-list.txt';
let fixList = `# AUTO-GENERATED FIX LIST\n`;
fixList += `# Generated: ${new Date().toISOString()}\n`;
fixList += `# Total URLs: ${listNoChapters.length + listPartial.length}\n`;
fixList += `# Priority 1: ${listNoChapters.length} manga dengan 0 chapter\n`;
fixList += `# Priority 2: ${listPartial.length} manga dengan chapter tanpa images\n`;
fixList += `#\n`;
fixList += `# Cara pakai:\n`;
fixList += `#   npm run import:local -- batch --file ${fixListPath} --proxy --delay 1500\n`;
fixList += `#\n`;
fixList += `# Atau per-prioritas:\n`;
fixList += `#   Priority 1 (0 chapter): gunakan mode 'full' karena perlu import ulang\n`;
fixList += `#   Priority 2 (no images): gunakan mode 'chapters' karena manga sudah ada\n\n`;

fixList += `# ═══ PRIORITY 1: MANGA DENGAN 0 CHAPTER (${listNoChapters.length}) ═══\n`;
fixList += `# Mode: full (import manga metadata + chapters + images)\n`;
for (const m of listNoChapters) {
  fixList += `${m.source_url}\n`;
}

fixList += `\n# ═══ PRIORITY 2: MANGA DENGAN CHAPTER TANPA IMAGES (${listPartial.length}) ═══\n`;
fixList += `# Mode: chapters (re-download images untuk chapter yang missing)\n`;
for (const m of listPartial) {
  fixList += `${m.source_url}  # ${m.withoutImages}/${m.total} chapters tanpa images\n`;
}

writeFileSync(fixListPath, fixList);
console.log(`📁 Fix list written: ${fixListPath}`);
console.log(`   Total URLs: ${listNoChapters.length + listPartial.length}\n`);

// ── 5. Print top 10 problematic ──
console.log('─── Top 10 Priority 1 (0 chapter) ───');
for (const m of listNoChapters.slice(0, 10)) {
  console.log(`   • ${m.title}`);
}
if (listNoChapters.length > 10) console.log(`   ... dan ${listNoChapters.length - 10} lainnya`);
console.log('');

console.log('─── Top 10 Priority 2 (chapter no images) ───');
for (const m of listPartial.slice(0, 10)) {
  console.log(`   • ${m.title} — ${m.withoutImages}/${m.total} chapters tanpa images (${(m.missingRatio * 100).toFixed(0)}%)`);
}
if (listPartial.length > 10) console.log(`   ... dan ${listPartial.length - 10} lainnya`);
console.log('');

// ── 6. Auto-run mode ──
if (autoRun) {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🚀 AUTO-RUN MODE — Starting fix via local-import');
  console.log('═══════════════════════════════════════════════════════\n');

  const allUrls = [...listNoChapters, ...listPartial].map(m => m.source_url);
  let success = 0, failed = 0;

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];
    const isPriority1 = i < listNoChapters.length;
    const mode = isPriority1 ? 'full' : 'chapters';
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  [${i + 1}/${allUrls.length}] ${mode.toUpperCase()} — ${url}`);
    console.log(`${'═'.repeat(60)}\n`);

    const cmd = `npm run import:local -- ${mode} --url "${url}" --delay 1500`;
    
    await new Promise((resolve) => {
      const proc = exec(cmd, { cwd: process.cwd() }, (err) => {
        if (err) {
          failed++;
          console.error(`  ❌ Failed: ${err.message}`);
        } else {
          success++;
        }
        resolve();
      });
      proc.stdout?.pipe(process.stdout);
      proc.stderr?.pipe(process.stderr);
    });
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  📊 FIX SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  ✅ Success: ${success}`);
  console.log(`  ❌ Failed:  ${failed}`);
  console.log(`  📦 Total:   ${allUrls.length}`);
  console.log('═'.repeat(60) + '\n');
} else {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  📋 NEXT STEPS');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log('Option 1 — Fix semua sekaligus (semalam):');
  console.log(`  npm run import:local -- batch --file ${fixListPath} --proxy --delay 1500\n`);
  console.log('Option 2 — Auto-run (script ini handle):');
  console.log(`  node scripts/fix-audit-issues.mjs --run\n`);
  console.log('Option 3 — Priority 1 dulu (68 manga tanpa chapter):');
  console.log(`  head -n $(grep -n "PRIORITY 2" ${fixListPath} | head -1 | cut -d: -f1) ${fixListPath} | grep "^http" > fix-priority1.txt`);
  console.log(`  npm run import:local -- batch --file fix-priority1.txt --proxy\n`);
  console.log('Option 4 — Auto-update mode (scan semua manga, fix yang perlu):');
  console.log(`  npm run import:local -- auto-update --proxy --delay 1500\n`);
  console.log('═══════════════════════════════════════════════════════\n');
}