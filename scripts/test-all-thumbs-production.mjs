/**
 * Test ALL chapter thumbnails for a manga via the production R2 proxy.
 * Reports which ones return transparent pixel (broken) vs real image.
 *
 * Usage: node scripts/test-all-thumbs-production.mjs <slug>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PROD_BASE = 'https://olluq.xyz';
const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node scripts/test-all-thumbs-production.mjs <slug>');
  process.exit(1);
}

// Get manga
const { data: manga, error: mErr } = await sb.from('manga').select('id, title').eq('slug', slug).single();
if (mErr || !manga) {
  console.error('Manga not found:', slug);
  process.exit(1);
}

// Get ALL chapters
const { data: chapters, error: cErr } = await sb
  .from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .order('number', { ascending: true });

if (cErr || !chapters) {
  console.error('Error:', cErr?.message);
  process.exit(1);
}

console.log(`\n📋 ${manga.title} — ${chapters.length} chapters`);
console.log(`   Testing via ${PROD_BASE}/api/r2/image/...\n`);

// Extract R2 object key from URL
function extractKey(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

let okCount = 0;
let brokenCount = 0;
const brokenChapters = [];

// Test with limited concurrency
const CONCURRENCY = 8;
const queue = [...chapters];

async function worker() {
  while (queue.length > 0) {
    const ch = queue.shift();
    if (!ch) break;

    const key = extractKey(ch.thumbnail_url);
    if (!key) {
      brokenCount++;
      brokenChapters.push({ number: ch.number, reason: 'null/invalid URL' });
      continue;
    }

    const proxyUrl = `${PROD_BASE}/api/r2/image/${key}`;
    try {
      const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(15000) });
      // Must read the actual body — the R2 route uses chunked transfer
      // encoding (no Content-Length header), so header-based checks fail.
      const buf = await res.arrayBuffer();
      const size = buf.byteLength;
      // Transparent 1x1 pixel is 67-82 bytes; real thumbnails are 30KB+
      if (res.ok && size > 500) {
        okCount++;
      } else {
        brokenCount++;
        brokenChapters.push({ number: ch.number, size, status: res.status, key });
      }
    } catch (e) {
      brokenCount++;
      brokenChapters.push({ number: ch.number, error: e.message.slice(0, 50), key });
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log(`=== RESULTS ===`);
console.log(`  ✓ OK (real image):     ${okCount}/${chapters.length}`);
console.log(`  ✗ Broken (pixel/err):  ${brokenCount}/${chapters.length}\n`);

if (brokenChapters.length > 0) {
  console.log(`Broken chapters:`);
  for (const b of brokenChapters.slice(0, 30)) {
    console.log(`  Ch.${b.number}: ${b.reason || b.error || `HTTP ${b.status}, ${b.size}b`} → ${b.key || ''}`);
  }
  if (brokenChapters.length > 30) {
    console.log(`  ... and ${brokenChapters.length - 30} more`);
  }
}