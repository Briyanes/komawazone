#!/usr/bin/env node
/**
 * 🚀 BATCH IMPORT CHAPTERS untuk manga chapterless
 *
 * Setelah cleanup 22,701 phantom chapters, 1,263+ manga jadi chapterless.
 * Script ini auto-import ulang semua chapter dari source_url.
 *
 * Fitur:
 *   ✓ Rotasi 10 proxy (anti-block CDN)
 *   ✓ Rate limiting intelligent (1.5-3s delay)
 *   ✓ Resume capability (skip manga yang sudah punya chapter)
 *   ✓ Metadata-only insert (cepat, gambar lazy-load saat user baca)
 *   ✓ Progress tracking
 *
 * Usage:
 *   node --env-file=.env.local scripts/batch-import-chapterless.mjs              # ALL chapterless
 *   node --env-file=.env.local scripts/batch-import-chapterless.mjs --dry-run    # preview only
 *   node --env-file=.env.local scripts/batch-import-chapterless.mjs --limit=50   # batch 50
 *   node --env-file=.env.local scripts/batch-import-chapterless.mjs --slug=park-moojik-hit-the-jackpot
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

// ============ CONFIG ============
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const slugArg = args.find(a => a.startsWith('--slug='))?.split('=')[1];
const limitArg = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '0', 10);
const BATCH_SIZE = 50;
const DELAY_MIN = 1500;
const DELAY_MAX = 3500;

// Load .env.local
const envTxt = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envTxt.split('\n')) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// ============ PROXY ROTATION ============
// Format: http://user:pass@host:port
const PROXIES = (env.PROXY_LIST || '').split(',').map(s => s.trim()).filter(Boolean);
let proxyIdx = 0;
function nextProxy() {
  if (PROXIES.length === 0) return null;
  const p = PROXIES[proxyIdx % PROXIES.length];
  proxyIdx++;
  return p;
}

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============ FETCH WITH PROXY ROTATION ============
async function fetchWithProxyRotation(url, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const proxy = nextProxy();
    try {
      const fetchOptions = {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
          'Cache-Control': 'no-cache',
        },
        signal: AbortSignal.timeout(20000),
        redirect: 'follow',
      };

      // Node 25+ supports proxy via dispatcher, but fetch native doesn't.
      // Use undici if available, otherwise direct fetch (proxies optional)
      if (proxy) {
        try {
          const { ProxyAgent } = await import('undici');
          fetchOptions.dispatcher = new ProxyAgent(proxy);
        } catch {
          // undici not available, skip proxy
        }
      }

      const res = await fetch(url, fetchOptions);
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status === 503) {
        console.log(`   ⚠️  Rate limited (HTTP ${res.status}), switching proxy...`);
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === maxRetries - 1) throw err;
      console.log(`   ⚠️  Retry ${attempt + 1}/${maxRetries}: ${err.message}`);
      await sleep(2000 * (attempt + 1));
    }
  }
}

// ============ CHAPTER PARSER (multi-source) ============
function parseChapters(html, sourceUrl) {
  const chapters = [];
  const seen = new Set();

  // Pattern 1: manhwaland/style: /xxx-chapter-N
  const linkRegex1 = /href="(https?:\/\/[^"]*\/[^"]*-chapter-(\d+(?:\.\d+)?)[^"]*)"/gi;

  // Pattern 2: gmbr.pro/style: /chapter-N or data-chapter
  const linkRegex2 = /href="(https?:\/\/[^"]*\/(?:chapter|ch)[-/]?(\d+(?:\.\d+)?)[^"]*)"/gi;

  // Pattern 3: data-url="/ch/N"
  const linkRegex3 = /data-(?:url|chapter-url)="([^"]+)"/gi;

  let match;
  const allRegexes = [linkRegex1, linkRegex2];
  for (const regex of allRegexes) {
    while ((match = regex.exec(html)) !== null) {
      const url = match[1];
      const num = parseFloat(match[2]);
      if (seen.has(num)) continue;
      seen.add(num);
      chapters.push({ number: num, url, title: `Chapter ${num}` });
    }
  }

  chapters.sort((a, b) => b.number - a.number);
  return chapters;
}

// ============ IMPORT ONE MANGA ============
async function importChaptersForManga(manga, idx, total) {
  const tag = `[${idx + 1}/${total}]`;
  console.log(`\n${tag} 📚 ${manga.title} (${manga.slug})`);

  if (!manga.source_url) {
    console.log(`   ⚠️  No source_url — skipping`);
    return { slug: manga.slug, status: 'no_source', count: 0 };
  }

  try {
    const html = await fetchWithProxyRotation(manga.source_url);
    const chapters = parseChapters(html, manga.source_url);

    if (chapters.length === 0) {
      console.log(`   ⚠️  No chapters found in HTML (source may be down or pattern changed)`);
      return { slug: manga.slug, status: 'no_chapters', count: 0 };
    }

    console.log(`   Found ${chapters.length} chapters at source`);

    if (dryRun) {
      console.log(`   [DRY RUN] Would insert ch.${chapters[chapters.length - 1].number} → ch.${chapters[0].number}`);
      return { slug: manga.slug, status: 'dry_run', count: chapters.length };
    }

    // Insert metadata-only (images lazy-load on first read via /api/v1/admin/scrape/chapter)
    const rows = chapters.map(ch => ({
      manga_id: manga.id,
      number: ch.number,
      title: ch.title,
    }));

    let insertedCount = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const { error: insertErr } = await supabase.from('chapters').insert(batch);

      if (insertErr) {
        if (insertErr.code === '23505') {
          // Duplicate — try one by one, skip existing
          for (const row of batch) {
            const { error: e2 } = await supabase.from('chapters').insert(row);
            if (!e2) insertedCount++;
          }
        } else {
          console.error(`   ❌ Insert error:`, insertErr.message);
        }
      } else {
        insertedCount += batch.length;
      }
    }

    console.log(`   ✅ Inserted ${insertedCount}/${chapters.length} chapters`);
    return { slug: manga.slug, status: 'success', count: insertedCount };
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
    return { slug: manga.slug, status: 'error', count: 0, error: err.message };
  }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ============ MAIN ============
async function main() {
  console.log('═'.repeat(60));
  console.log('🚀 BATCH IMPORT CHAPTERS — Manga Zone');
  console.log('═'.repeat(60));
  console.log(`Mode: ${dryRun ? '🔍 DRY RUN (preview)' : '⚡ LIVE (will insert!)'}`);
  console.log(`Proxy: ${PROXIES.length > 0 ? `${PROXIES.length} proxies configured` : '⚠️  No PROXY_LIST — direct fetch'}`);
  if (slugArg) console.log(`Filter: slug=${slugArg}`);
  if (limitArg) console.log(`Limit: ${limitArg} manga`);
  console.log('');

  // Step 1: Get all manga with source_url (paginate to bypass 1000-row default)
  console.log('📖 Step 1: Fetching all manga with source_url...');
  const allManga = [];
  let mangaPage = 0;
  while (true) {
    let q = supabase
      .from('manga')
      .select('id, slug, title, source_url, status')
      .is('deleted_at', null)
      .not('source_url', 'is', null)
      .order('title')
      .range(mangaPage * 1000, (mangaPage + 1) * 1000 - 1);
    if (slugArg) q = q.eq('slug', slugArg);
    const { data: pageData, error: mangaErr } = await q;
    if (mangaErr) {
      console.error('❌ Failed to fetch manga:', mangaErr.message);
      process.exit(1);
    }
    if (!pageData || pageData.length === 0) break;
    allManga.push(...pageData);
    if (pageData.length < 1000) break;
    mangaPage++;
    process.stdout.write(`   → fetched ${allManga.length} manga\r`);
  }
  console.log(`   → total ${allManga.length} manga with source_url`);

  // Step 2: Get set of manga_ids that already have chapters
  console.log('📖 Step 2: Finding manga that already have chapters...');
  const mangaWithChapters = new Set();
  let page = 0;
  while (true) {
    const { data: pageData } = await supabase
      .from('chapters')
      .select('manga_id')
      .is('deleted_at', null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!pageData || pageData.length === 0) break;
    for (const c of pageData) mangaWithChapters.add(c.manga_id);
    if (pageData.length < 1000) break;
    page++;
    process.stdout.write(`   → scanned ${mangaWithChapters.size} manga with chapters\r`);
  }
  console.log(`   → ${mangaWithChapters.size} manga already have chapters`);

  // Step 3: Filter chapterless manga
  const chapterless = allManga.filter(m => !mangaWithChapters.has(m.id));
  console.log(`\n📊 Summary:`);
  console.log(`   Total manga with source_url: ${allManga.length}`);
  console.log(`   Manga with chapters:         ${mangaWithChapters.size}`);
  console.log(`   🚨 Chapterless manga:        ${chapterless.length}`);

  let toProcess = chapterless;
  if (limitArg > 0) {
    toProcess = chapterless.slice(0, limitArg);
    console.log(`   Processing limit:            ${limitArg}`);
  }

  if (toProcess.length === 0) {
    console.log('\n✅ No chapterless manga to process!');
    return;
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`🚀 Starting import for ${toProcess.length} manga...`);
  console.log(`${'─'.repeat(60)}\n`);

  const results = [];
  let success = 0, errors = 0, noSource = 0, noChapters = 0, totalChapters = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const result = await importChaptersForManga(toProcess[i], i, toProcess.length);
    results.push(result);

    switch (result.status) {
      case 'success': success++; totalChapters += result.count; break;
      case 'error': errors++; break;
      case 'no_source': noSource++; break;
      case 'no_chapters': noChapters++; break;
    }

    // Progress every 10
    if ((i + 1) % 10 === 0) {
      console.log(`\n📈 Progress: ${i + 1}/${toProcess.length} | ✅ ${success} | ❌ ${errors} | chapters: ${totalChapters}\n`);
    }

    // Rate limit delay
    await sleep(DELAY_MIN + Math.random() * (DELAY_MAX - DELAY_MIN));
  }

  // Final summary
  console.log('\n' + '═'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('═'.repeat(60));
  console.log(`Manga processed:     ${toProcess.length}`);
  console.log(`✅ Success:          ${success}`);
  console.log(`⚠️  No source URL:    ${noSource}`);
  console.log(`⚠️  No chapters:      ${noChapters} (source changed/down)`);
  console.log(`❌ Errors:           ${errors}`);
  console.log(`📚 Chapters added:   ${totalChapters}`);

  if (errors > 0) {
    console.log('\nErrors:');
    results.filter(r => r.status === 'error').slice(0, 20).forEach(r => {
      console.log(`  - ${r.slug}: ${r.error}`);
    });
    if (errors > 20) console.log(`  ... and ${errors - 20} more`);
  }

  console.log('\n✨ Done! Images will lazy-load when users read chapters.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});