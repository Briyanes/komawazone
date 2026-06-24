#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Check chapter_images host distribution
async function checkChapterImages() {
  console.log('\n📊 Chapter Images Host Distribution:');
  console.log('─────────────────────────────────────');

  const { count: total } = await sb.from('chapter_images').select('*', { count: 'exact', head: true });
  console.log(`Total: ${total?.toLocaleString()}`);

  const hosts = [
    { name: 'gmbr.pro (DEAD)',   pattern: 'gmbr.pro' },
    { name: 'R2 proxy (OK)',      pattern: '/api/r2/image/' },
    { name: 'wp.com',             pattern: 'wp.com' },
    { name: 'blogspot',           pattern: 'blogspot' },
    { name: 'cloudflaressl',      pattern: 'cloudflaressl' },
    { name: 'facebook',           pattern: 'fbcdn' },
    { name: 'googleusercontent',  pattern: 'googleusercontent' },
  ];

  for (const h of hosts) {
    const { count } = await sb.from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .like('image_url', `%${h.pattern}%`);
    if (count && count > 0) {
      const pct = ((count / total) * 100).toFixed(1);
      console.log(`  ${h.name}: ${count.toLocaleString()} (${pct}%)`);
    }
  }
}

// Check chapter thumbnails
async function checkThumbnails() {
  console.log('\n📊 Chapter Thumbnails Host Distribution:');
  console.log('─────────────────────────────────────────');

  const { count: total } = await sb.from('chapters').select('*', { count: 'exact', head: true }).not('thumbnail_url', 'is', null);
  console.log(`Total (with thumb): ${total?.toLocaleString()}`);

  const { count: gmbr } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%gmbr.pro%');
  const { count: r2 } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%/api/r2/image/%');
  const { count: nullThumb } = await sb.from('chapters').select('*', { count: 'exact', head: true }).or('thumbnail_url.is.null');

  console.log(`  gmbr.pro (DEAD): ${gmbr?.toLocaleString()}`);
  console.log(`  R2 (OK): ${r2?.toLocaleString()}`);
  console.log(`  NULL: ${nullThumb?.toLocaleString()}`);
}

// Check manga covers
async function checkCovers() {
  console.log('\n📊 Manga Covers Host Distribution:');
  console.log('────────────────────────────────────');

  const { count: gmbr } = await sb.from('manga').select('*', { count: 'exact', head: true }).like('cover_image', '%gmbr.pro%');
  const { count: r2 } = await sb.from('manga').select('*', { count: 'exact', head: true }).like('cover_image', '%/api/r2/image/%');
  console.log(`  gmbr.pro (DEAD): ${gmbr?.toLocaleString()}`);
  console.log(`  R2 (OK): ${r2?.toLocaleString()}`);
}

// Check distinct domains in gmbr.pro images
async function checkGmbrUrlPatterns() {
  console.log('\n📊 Sample gmbr.pro URLs from DB:');
  console.log('────────────────────────────────────');

  const { data } = await sb.from('chapter_images')
    .select('image_url')
    .like('image_url', '%gmbr.pro%')
    .range(0, 5);

  data?.forEach(row => console.log(`  ${row.image_url}`));
}

await checkChapterImages();
await checkThumbnails();
await checkCovers();
await checkGmbrUrlPatterns();
console.log('\n✅ Done');