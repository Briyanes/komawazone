/**
 * FAST PARALLEL Import chapters for manga that have NO chapters at all.
 *
 * Improvements:
 * - Parallel batch processing (10+ concurrent) instead of sequential
 * - Auto-resume (skips manga that already have chapters)
 * - Retry logic (3x with backoff)
 * - Progress checkpoint (saves to JSON file, can resume if interrupted)
 * - PAGINATED queries (bypasses Supabase 1000-row default limit)
 *
 * Usage:
 *   node scripts/import-missing-chapters.mjs              # all manga without chapters
 *   node scripts/import-missing-chapters.mjs --limit 50   # first 50 only
 *   node scripts/import-missing-chapters.mjs --slug xxx   # specific manga slug
 *   node scripts/import-missing-chapters.mjs --concurrency 20  # more aggressive
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Load .env.local ──────────────────────────────────────────────
const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ── Config ───────────────────────────────────────────────────────
const CONCURRENCY = parseInt(process.argv[process.argv.indexOf('--concurrency') + 1] || '10', 10);
const PROGRESS_FILE = path.resolve(process.cwd(), 'scripts/.import-progress.json');

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Paginate through ALL rows of a Supabase query (bypasses 1000-row default limit).
 */
async function fetchAll(table, select, filters = {}) {
  const PAGE = 1000;
  let all = [];
  let offset = 0;
  while (true) {
    let q = sb.from(table).select(select).range(offset, offset + PAGE - 1);
    for (const [key, val] of Object.entries(filters)) {
      if (val === null) {
        q = q.is(key, null);
      } else if (val === 'not-null') {
        q = q.not(key, 'is', null);
      } else if (Array.isArray(val)) {
        q = q.in(key, val);
      } else {
        q = q.eq(key, val);
      }
    }
    const { data, error } = await q;
    if (error) throw new Error(`fetchAll(${table}): ${error.message}`);
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return all;
}

function normalizeIndonesianDate(raw) {
  return raw
    .replace(/Januari/i, 'January')
    .replace(/Februari/i, 'February')
    .replace(/Maret/i, 'March')
    .replace(/Mei/i, 'May')
    .replace(/Juni/i, 'June')
    .replace(/Juli/i, 'July')
    .replace(/Agustus/i, 'August')
    .replace(/Oktober/i, 'October')
    .replace(/Desember/i, 'December');
}

/**
 * Parse chapter list from manhwaland.land HTML.
 */
function parseChapterListFromHtml(html) {
  const chapters = [];

  // Path 1: Madara theme with #chapterlist / .eplister
  if (html.includes('id="chapterlist"') || html.includes('class="eplister"')) {
    const liRe = /<li[^>]+data-num="(\d+(?:\.\d+)?)"[^>]*>([\s\S]*?)<\/li>/gi;
    let liMatch;
    while ((liMatch = liRe.exec(html)) !== null) {
      const dataNum = parseFloat(liMatch[1]);
      const block = liMatch[2];

      const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>/i);
      if (!aMatch) continue;
      const url = aMatch[1].trim();

      const numMatch = block.match(/<span[^>]+class="chapternum"[^>]*>\s*(?:Chapter\s*)?(\d+(?:\.\d+)?)/i);
      const number = numMatch ? parseFloat(numMatch[1]) : dataNum;

      // Always use "Chapter N" — manhwaland prepends manga title
      const title = `Chapter ${number}`;

      const dateRaw = block.match(/<span[^>]+class="chapterdate"[^>]*>([^<]+)/i)?.[1]?.trim() ?? null;
      let releasedAt = null;
      if (dateRaw) {
        try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
      }

      chapters.push({ number, title, url, releasedAt });
    }
    if (chapters.length > 0) return chapters.sort((a, b) => a.number - b.number);
  }

  // Path 2: Madara wp-manga-chapter fallback
  const liRe2 = /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let liMatch2;
  while ((liMatch2 = liRe2.exec(html)) !== null) {
    const block = liMatch2[1];
    const aMatch = block.match(/<a[^>]+href=["']([^"']+)["'][^>]*>\s*([\s\S]*?)\s*<\/a>/i);
    if (!aMatch) continue;
    const url = aMatch[1].trim();
    const rawTitle = aMatch[2].replace(/<[^>]+>/g, '').trim();
    const numFromUrl = url.match(/chapter[-_](\d+(?:\.\d+)?)/i);
    const numFromTitle = rawTitle.match(/chapter\s*(\d+(?:\.\d+)?)/i) ?? rawTitle.match(/^(\d+(?:\.\d+)?)/);
    const numStr = numFromUrl?.[1] ?? numFromTitle?.[1];
    const number = numStr ? parseFloat(numStr) : null;
    if (number === null) continue;
    const dateRaw = block.match(/<i[^>]*>([^<]+)<\/i>/i)?.[1]?.trim() ?? null;
    let releasedAt = null;
    if (dateRaw) {
      try { releasedAt = new Date(normalizeIndonesianDate(dateRaw)).toISOString(); } catch { /* ignore */ }
    }
    chapters.push({ number, title: `Chapter ${number}`, url, releasedAt });
  }

  return chapters.sort((a, b) => a.number - b.number);
}

function isBlockedPage(html) {
  return (
    html.includes('cf-browser-verification') ||
    html.includes('cf_chl_opt') ||
    html.includes('Just a moment') ||
    html.includes('Enable JavaScript and cookies to continue') ||
    html.includes('Checking if the site connection is secure') ||
    html.includes('DDoS protection by') ||
    html.includes('_cf_chl_tk') ||
    html.length < 2000
  );
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Fetch with retry ─────────────────────────────────────────────
async function fetchWithRetry(url, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        if (attempt < maxRetries - 1) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
        return { error: `HTTP ${res.status}` };
      }

      const html = await res.text();

      if (isBlockedPage(html)) {
        if (attempt < maxRetries - 1) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        return { error: 'CloudFlare blocked' };
      }

      return { html };
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      return { error: err.message };
    }
  }
  return { error: 'Max retries exceeded' };
}

// ── Process single manga ─────────────────────────────────────────
async function processManga(manga) {
  const { html, error } = await fetchWithRetry(manga.source_url);
  if (error) return { status: 'failed', error, chapters: 0 };

  const chapters = parseChapterListFromHtml(html);
  if (chapters.length === 0) return { status: 'skipped', error: 'No chapters', chapters: 0 };

  // Deduplicate by number
  const seen = new Set();
  const rows = [];
  for (const ch of chapters) {
    const key = ch.number;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      manga_id: manga.id,
      number: ch.number,
      title: ch.title || `Chapter ${ch.number}`,
      deleted_at: null,
      ...(ch.releasedAt ? { release_date: ch.releasedAt } : {}),
    });
  }

  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error: upsertErr } = await sb
      .from('chapters')
      .upsert(rows.slice(i, i + 50), { onConflict: 'manga_id,number' })
      .select('id');

    if (!upsertErr) {
      insertedCount += (data?.length ?? 0);
    }
  }

  return { status: 'ok', chapters: insertedCount };
}

// ── Progress checkpoint ──────────────────────────────────────────
function loadProgress() {
  try {
    if (fs.existsSync(PROGRESS_FILE)) {
      return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { completed: [], failed: [], lastRun: null };
}

function saveProgress(progress) {
  progress.lastRun = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

// ── Main ─────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : 0;
  const slugIdx = args.indexOf('--slug');
  const specificSlug = slugIdx !== -1 ? args[slugIdx + 1] : null;

  console.log('━'.repeat(60));
  console.log('🚀 FAST PARALLEL IMPORT — Missing Chapters');
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log('━'.repeat(60));

  // 1. Get all manga IDs that already have chapters (PAGINATED)
  console.log('📥 Fetching existing chapters (paginated)...');
  const existingChapters = await fetchAll('chapters', 'manga_id', { deleted_at: null });
  const mangaWithChapters = new Set(existingChapters.map(c => c.manga_id));
  console.log(`📊 Manga WITH chapters: ${mangaWithChapters.size}`);

  // 2. Get all manga with source_url (PAGINATED)
  console.log('📥 Fetching all manga (paginated)...');
  let allManga = await fetchAll('manga', 'id, slug, title, source_url', { deleted_at: null });
  allManga = allManga.filter(m => m.source_url != null);
  if (specificSlug) {
    allManga = allManga.filter(m => m.slug === specificSlug);
  }
  // Sort by title for consistent ordering
  allManga.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  console.log(`📊 Total manga with source_url: ${allManga.length}`);

  // 3. Filter manga without chapters
  let targets = allManga.filter(m => !mangaWithChapters.has(m.id));
  console.log(`📊 Manga WITHOUT chapters: ${targets.length}`);

  if (targets.length === 0) {
    console.log('✅ All manga already have chapters!');
    return;
  }

  // 4. Load progress (skip already completed from previous runs)
  const progress = loadProgress();
  const completedSet = new Set(progress.completed);
  const beforeSkip = targets.length;
  targets = targets.filter(m => !completedSet.has(m.id));
  if (beforeSkip > targets.length) {
    console.log(`⏭️  Skipping ${beforeSkip - targets.length} already completed (from checkpoint)`);
  }

  if (limit > 0) {
    targets = targets.slice(0, limit);
  }

  console.log(`🎯 Will process: ${targets.length} manga`);
  console.log('━'.repeat(60));
  console.log('');

  // 5. Process in parallel batches
  let processed = 0;
  let totalChaptersAdded = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    const batch = targets.slice(i, i + CONCURRENCY);

    const results = await Promise.all(
      batch.map(async (manga) => {
        const result = await processManga(manga);
        return { manga, ...result };
      })
    );

    for (const r of results) {
      processed++;
      const prefix = `[${processed}/${targets.length}]`;
      const title = r.manga.title?.slice(0, 35) ?? r.manga.slug;

      if (r.status === 'ok') {
        totalChaptersAdded += r.chapters;
        progress.completed.push(r.manga.id);
        console.log(`${prefix} ✅ ${title} — ${r.chapters} chapters`);
      } else if (r.status === 'skipped') {
        skipped++;
        progress.completed.push(r.manga.id);
        console.log(`${prefix} ⚠️  ${title} — ${r.error}`);
      } else {
        failed++;
        progress.failed.push({ id: r.manga.id, slug: r.manga.slug, error: r.error });
        console.log(`${prefix} ❌ ${title} — ${r.error}`);
      }
    }

    saveProgress(progress);

    if (processed % CONCURRENCY === 0 || processed === targets.length) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const rate = (processed / (elapsed || 1)).toFixed(1);
      const eta = Math.ceil((targets.length - processed) / (rate || 1));
      console.log(`  📈 ${processed}/${targets.length} (${rate}/s) | Ch: ${totalChaptersAdded} | Fail: ${failed} | ETA: ${eta}s`);
    }

    await sleep(200);
  }

  console.log('');
  console.log('━'.repeat(60));
  console.log('📊 FINAL SUMMARY');
  console.log('━'.repeat(60));
  console.log(`  Processed   : ${processed}`);
  console.log(`  Chapters    : ${totalChaptersAdded} added`);
  console.log(`  Skipped     : ${skipped} (no chapters on source)`);
  console.log(`  Failed      : ${failed}`);
  console.log(`  Time        : ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
  console.log('━'.repeat(60));

  if (failed > 0) {
    console.log(`\n💡 ${failed} manga failed. Run script again to retry — it will auto-skip completed ones.`);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});