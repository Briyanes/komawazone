#!/usr/bin/env node
/**
 * Scrape covers for manga that have no cover_url.
 * Uses got-scraping to bypass Cloudflare.
 *
 * Usage:
 *   node scripts/scrape-missing-covers.mjs              # scrape all
 *   node scripts/scrape-missing-covers.mjs --limit=50   # only 50
 *   node scripts/scrape-missing-covers.mjs --dry-run    # preview
 */

import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { gotScraping } from 'got-scraping';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

const envPath = path.join(__dirname, '..', '.env.local');
const env = loadEnv(envPath);

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    })
);
const DRY_RUN = args['dry-run'] === true || args['dry-run'] === 'true';
const LIMIT = args['limit'] ? parseInt(args['limit']) : null;

// ── Clients ───────────────────────────────────────────────────────────────────
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const R2_BASE = (env.R2_PUBLIC_BASE_URL ?? '').replace(/\/$/, '');
const R2_BUCKET = env.R2_BUCKET;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('');
  console.log('🖼️   Cover Scraper for Restored Manga');
  console.log('══════════════════════════════════════');
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  if (LIMIT) console.log(`   Limit: ${LIMIT}`);
  console.log('');

  // Fetch all manga without cover_url
  console.log('📥 Fetching manga without cover...');
  const all = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from('manga')
      .select('id, slug, title, source_url')
      .is('cover_url', null)
      .is('deleted_at', null)
      .not('source_url', 'is', null)
      .order('id')
      .range(offset, offset + 999);
    if (error) { console.error('Query error:', error.message); break; }
    if (!data?.length) break;
    all.push(...data);
    offset += 1000;
  }
  console.log(`   Total without cover: ${all.length}`);
  if (LIMIT) { all.length = LIMIT; console.log(`   Limited to: ${LIMIT}`); }
  console.log('');

  let scraped = 0, failed = 0;
  const BATCH = 5;

  for (let i = 0; i < all.length; i += BATCH) {
    const batch = all.slice(i, i + BATCH);

    const results = await Promise.allSettled(batch.map(async (m) => {
      try {
        // Fetch manga page
        const response = await gotScraping({
          url: m.source_url,
          responseType: 'text',
          timeout: { request: 20000 },
          retry: { limit: 0 },
          headerGeneratorOptions: {
            browsers: [{ name: 'chrome', minVersion: 112 }],
            devices: ['desktop'],
            operatingSystems: ['macos'],
            locales: ['id-ID', 'en-US'],
          },
        });

        if (response.statusCode !== 200 || response.body.length < 2000) return { id: m.id, ok: false };

        const html = response.body;

        // Extract cover URL
        let coverUrl = null;
        const wpPostImg = html.match(/<img[^>]+src="([^"]+)"[^>]+class="[^"]*wp-post-image[^"]*"/i)
          ?? html.match(/<img[^>]+class="[^"]*wp-post-image[^"]*"[^>]+src="([^"]+)"/i);
        if (wpPostImg?.[1]) coverUrl = wpPostImg[1];
        if (!coverUrl) {
          const og = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
            ?? html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
          if (og?.[1]) coverUrl = og[1];
        }

        if (!coverUrl) return { id: m.id, ok: false };

        if (DRY_RUN) return { id: m.id, ok: true };

        // Download image
        const imgResponse = await gotScraping({
          url: coverUrl,
          responseType: 'buffer',
          timeout: { request: 15000 },
          retry: { limit: 0 },
          headerGeneratorOptions: {
            browsers: [{ name: 'chrome', minVersion: 112 }],
            devices: ['desktop'],
            operatingSystems: ['macos'],
          },
          headers: {
            Referer: new URL(m.source_url).origin + '/',
            Accept: 'image/*,*/*',
          },
        });

        if (imgResponse.statusCode !== 200) return { id: m.id, ok: false };
        const ct = (imgResponse.headers['content-type'] || 'image/jpeg').split(';')[0].trim();
        if (!ct.startsWith('image/')) return { id: m.id, ok: false };

        const ext = ct.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
        const key = `covers/${m.id}.${ext}`;

        await s3.send(new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: imgResponse.body,
          ContentType: ct,
          CacheControl: 'public, max-age=31536000, immutable',
        }));

        const r2Url = R2_BASE
          ? `${R2_BASE}/${key}`
          : `https://${R2_BUCKET}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

        await supabase.from('manga').update({ cover_url: r2Url }).eq('id', m.id);
        return { id: m.id, ok: true };
      } catch {
        return { id: m.id, ok: false };
      }
    }));

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value?.ok) scraped++; else failed++;
      } else {
        failed++;
      }
    }

    if ((i + BATCH) % 50 === 0 || i + BATCH >= all.length) {
      const pct = ((i + BATCH) / all.length * 100).toFixed(1);
      console.log(`[${i + BATCH}/${all.length}] ${pct}% | ✅ ${scraped} | ❌ ${failed}`);
    }

    // Delay between batches
    await sleep(1000 + Math.random() * 500);
  }

  console.log('');
  console.log('══════════════════════════════════════');
  console.log('📊  COVER SCRAPE SUMMARY');
  console.log('══════════════════════════════════════');
  console.log(`   Total processed : ${all.length}`);
  console.log(`   Covers scraped  : ${scraped}`);
  console.log(`   Covers failed   : ${failed}`);
  if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — nothing was actually changed.');
  console.log('');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});