/**
 * Diagnostic: check if thumbnail objects actually exist in the R2 bucket.
 * Uses S3 HeadObject API (same as the /api/r2/image route does).
 *
 * Usage: node scripts/diagnose-r2-objects.mjs <slug>
 */
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucket = process.env.R2_BUCKET;
const publicBase = process.env.R2_PUBLIC_BASE_URL || '';

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node diagnose-r2-objects.mjs <slug>');
  process.exit(1);
}

// Extract object key from an R2 URL (handles both public base + r2.dev formats)
function extractKey(url) {
  if (!url) return null;
  if (publicBase && url.startsWith(publicBase)) {
    return url.slice(publicBase.length).replace(/^\//, '');
  }
  try {
    const parsed = new URL(url);
    return parsed.pathname.replace(/^\//, '');
  } catch {
    return null;
  }
}

async function checkObjectExists(key) {
  try {
    const cmd = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);
    return { exists: true, size: res.ContentLength, type: res.ContentType };
  } catch (e) {
    const name = e?.name || '';
    if (name === 'NotFound' || name === 'NoSuchKey') return { exists: false };
    return { exists: false, error: name || e?.message?.slice(0, 60) };
  }
}

// Get manga
const { data: manga, error: mErr } = await sb.from('manga').select('id, title').eq('slug', slug).single();
if (mErr || !manga) {
  console.error('Manga not found:', slug);
  process.exit(1);
}

console.log(`\n📋 Manga: ${manga.title}`);
console.log(`   R2 Bucket: ${bucket}`);
console.log(`   R2 Public Base: ${publicBase || '(not set)'}\n`);

const { data: chapters } = await sb
  .from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .order('number', { ascending: true })
  .limit(10);

if (!chapters || chapters.length === 0) {
  console.log('No chapters found.');
  process.exit(0);
}

console.log(`Checking R2 existence for ${chapters.length} chapters:\n`);

let existsCount = 0;
let missingCount = 0;

for (const ch of chapters) {
  const key = extractKey(ch.thumbnail_url);
  if (!key) {
    console.log(`  Ch.${String(ch.number).padStart(3)} | NO KEY (null/invalid url)`);
    missingCount++;
    continue;
  }

  const result = await checkObjectExists(key);
  const status = result.exists
    ? `✓ EXISTS (${result.size} bytes, ${result.type})`
    : `✗ MISSING${result.error ? ` (${result.error})` : ''}`;

  if (result.exists) existsCount++; else missingCount++;
  console.log(`  Ch.${String(ch.number).padStart(3)} | ${status}`);
  console.log(`           key: ${key}`);
}

console.log(`\n=== SUMMARY ===`);
console.log(`  Exists in R2:  ${existsCount}/${chapters.length}`);
console.log(`  Missing:       ${missingCount}/${chapters.length}`);