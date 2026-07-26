#!/usr/bin/env node
/**
 * Local Sitemap Watcher
 *
 * Berjalan secara periodik (via PM2 / launchd / cron) untuk:
 * 1. Ambil semua source aktif dari DB (table manga_sources)
 * 2. Parse sitemap setiap source
 * 3. Bandingkan dengan snapshot sebelumnya
 * 4. Jika ada manga baru → jalankan local-import.mjs sitemap --url <sitemap_url>
 * 5. Jalankan auto-update untuk cek chapter baru di manga yang sudah ada
 *
 * Usage:
 *   node scripts/local-sitemap-watcher.mjs              # single run
 *   node scripts/local-sitemap-watcher.mjs --watch      # loop mode (interval 10 menit)
 *   node scripts/local-sitemap-watcher.mjs --watch --interval=5  # custom interval (menit)
 *
 * Flags:
 *   --skip-auto-update   Skip chapter auto-update after sitemap scan
 *   --dry-run            Detect new URLs but don't trigger import
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');
const SNAPSHOT_DIR = join(PROJECT_ROOT, '.sitemap-snapshots');

// --- Load env ---
function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    const p = join(PROJECT_ROOT, f);
    if (existsSync(p)) {
      for (const line of readFileSync(p, 'utf8').split('\n')) {
        const m = line.match(/^([A-Z_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}
loadEnv();

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

if (!existsSync(SNAPSHOT_DIR)) mkdirSync(SNAPSHOT_DIR, { recursive: true });

// --- Parse args ---
const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDryRun = args.includes('--dry-run');
const skipAutoUpdate = args.includes('--skip-auto-update');
const intervalArg = args.find(a => a.startsWith('--interval='));
const intervalMin = intervalArg ? parseInt(intervalArg.split('=')[1], 10) : 10;

// --- Helpers ---
async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) MangaZoneBot/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      console.warn(`  ⚠️  ${sitemapUrl} → HTTP ${res.status}`);
      return [];
    }
    const xml = await res.text();

    const urls = [];
    const locMatches = xml.matchAll(/<loc>(.*?)<\/loc>/g);
    for (const m of locMatches) {
      const url = m[1].trim();
      if (url) urls.push(url);
    }
    return urls;
  } catch (err) {
    console.warn(`  ⚠️  ${sitemapUrl} → ${err.message}`);
    return [];
  }
}

function getSnapshotPath(sourceId) {
  return join(SNAPSHOT_DIR, `${sourceId}.json`);
}

function loadSnapshot(sourceId) {
  const p = getSnapshotPath(sourceId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function saveSnapshot(sourceId, urls) {
  writeFileSync(getSnapshotPath(sourceId), JSON.stringify({
    urlCount: urls.length,
    urls,
    updatedAt: new Date().toISOString(),
  }, null, 2));
}

function runImport(args) {
  const cmd = `node "${join(PROJECT_ROOT, 'scripts', 'local-import.mjs')}" ${args}`;
  console.log(`  🚀 Running: ${cmd}`);
  if (isDryRun) {
    console.log(`  🔍 DRY-RUN — skipping actual import`);
    return;
  }
  try {
    execSync(cmd, { cwd: PROJECT_ROOT, stdio: 'pipe', timeout: 600_000 });
    console.log(`  ✅ Import done`);
  } catch (err) {
    console.error(`  ❌ Import failed: ${err.message}`);
  }
}

// --- Main ---
async function checkAllSources() {
  console.log(`\n[${new Date().toISOString()}] 🔍 Scanning all active sources...`);

  const { data: sources, error } = await supabase
    .from('manga_sources')
    .select('id, name, slug, sitemap_urls')
    .eq('is_active', true);

  if (error) {
    console.error('❌ Failed to fetch sources:', error.message);
    return;
  }

  if (!sources || sources.length === 0) {
    console.log('ℹ️  No active sources found in manga_sources table.');
    console.log('   Tambahkan source via Admin Dashboard → Sources, atau jalankan:');
    console.log('   supabase migration: 053_multi_source_architecture.sql');
    return;
  }

  let totalNewUrls = 0;

  for (const source of sources) {
    console.log(`\n📡 Source: ${source.name} (${source.slug})`);

    const sitemapUrls = source.sitemap_urls || [];
    if (sitemapUrls.length === 0) {
      console.log('  ⏭️  No sitemap URLs configured, skipping');
      continue;
    }

    // Collect all current URLs from all sitemaps
    let allUrls = [];
    for (const sm of sitemapUrls) {
      const urls = await fetchSitemapUrls(sm);
      allUrls = allUrls.concat(urls);
    }

    // Dedupe & filter (manga-like URLs)
    allUrls = [...new Set(allUrls)].filter(u => u.includes('/manga/') || u.match(/\/[a-z0-9-]+\/?$/));

    const prev = loadSnapshot(source.id);
    if (!prev) {
      console.log(`  📝 First run — saving snapshot (${allUrls.length} URLs), skipping import`);
      saveSnapshot(source.id, allUrls);
      continue;
    }

    const prevSet = new Set(prev.urls || []);
    const newUrls = allUrls.filter(u => !prevSet.has(u));

    if (newUrls.length === 0) {
      console.log(`  ✅ No new manga detected (${allUrls.length} total)`);
    } else {
      console.log(`  🆕 ${newUrls.length} new URL(s) detected!`);
      for (const u of newUrls.slice(0, 5)) console.log(`     • ${u}`);
      if (newUrls.length > 5) console.log(`     ... and ${newUrls.length - 5} more`);

      totalNewUrls += newUrls.length;

      // Trigger sitemap import (uses the source's first sitemap URL)
      const primarySitemap = sitemapUrls[0];
      runImport(`sitemap --url "${primarySitemap}"`);
    }

    saveSnapshot(source.id, allUrls);
  }

  console.log(`\n[${new Date().toISOString()}] ✅ Scan complete. ${totalNewUrls} new URL(s) across all sources.`);

  // Run chapter auto-update for existing manga (unless skipped)
  if (!skipAutoUpdate) {
    console.log('\n🔄 Running chapter auto-update for existing manga...');
    runImport('auto-update --skip-images');
  }
}

async function main() {
  if (isWatch) {
    console.log(`🔄 Watch mode enabled — interval: ${intervalMin} min`);
    if (isDryRun) console.log('🔍 DRY-RUN mode: will detect but not import');
    await checkAllSources();
    setInterval(checkAllSources, intervalMin * 60 * 1000);
  } else {
    await checkAllSources();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});