/**
 * Diagnostic: check actual thumbnail URLs for a manga's chapters.
 * Tests whether each thumbnail URL is reachable (HTTP HEAD).
 *
 * Usage: node scripts/diagnose-thumbnails.mjs <slug>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const slug = process.argv[2];
if (!slug) {
  console.error('Usage: node diagnose-thumbnails.mjs <slug>');
  process.exit(1);
}

// Get manga
const { data: manga, error: mErr } = await sb.from('manga').select('id, title, slug').eq('slug', slug).single();
if (mErr || !manga) {
  console.error('Manga not found:', slug);
  process.exit(1);
}

console.log(`\n📋 Manga: ${manga.title} (${manga.slug})\n`);

// Get chapters with thumbnails
const { data: chapters, error: cErr } = await sb
  .from('chapters')
  .select('id, number, thumbnail_url')
  .eq('manga_id', manga.id)
  .order('number', { ascending: true })
  .limit(20);

if (cErr || !chapters) {
  console.error('Error fetching chapters:', cErr?.message);
  process.exit(1);
}

console.log(`Checking first ${chapters.length} chapters:\n`);

let r2Count = 0;
let deadCount = 0;
let nullCount = 0;
let okCount = 0;

for (const ch of chapters) {
  const url = ch.thumbnail_url;
  if (!url) { nullCount++; continue; }
  const isR2 = url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com') || url.includes('pub-');
  if (isR2) r2Count++;

  // Test URL reachability
  let status = '?';
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    status = res.status;
    if (res.ok) okCount++;
    else deadCount++;
  } catch (e) {
    status = `ERR: ${e.message.slice(0, 40)}`;
    deadCount++;
  }

  const shortUrl = url.length > 70 ? url.slice(0, 35) + '...' + url.slice(-30) : url;
  console.log(`  Ch.${String(ch.number).padStart(3)} | HTTP ${String(status).padEnd(5)} | ${isR2 ? 'R2 ' : 'EXT'} | ${shortUrl}`);
  await new Promise(r => setTimeout(r, 200));
}

console.log(`\n=== SUMMARY (first ${chapters.length} chapters) ===`);
console.log(`  R2 URLs:       ${r2Count}`);
console.log(`  External URLs: ${chapters.length - r2Count - nullCount}`);
console.log(`  NULL:          ${nullCount}`);
console.log(`  Reachable:     ${okCount}`);
console.log(`  Dead/Error:    ${deadCount}`);