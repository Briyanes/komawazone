#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
};

const mangaId = '929adfa1-91bc-4b3f-9843-57d07868052f';

// Get chapters
const chRes = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,thumbnail_url&manga_id=eq.${mangaId}&deleted_at=is.null&order=number.asc&limit=10`, { headers });
const chapters = await chRes.json();
console.log('=== Hana\'s Demons of Lust — First 10 chapters ===\n');

for (const ch of chapters) {
  // Get images from chapter_images table, sorted by number (same as fix script)
  const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url,number&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
  const imgs = await imgRes.json();
  const urls = imgs.map(i => i.image_url).filter(Boolean);
  const thumb = ch.thumbnail_url || 'NULL';
  const fifth = urls[4] || null;

  console.log(`Ch ${ch.number}: ${urls.length} images`);
  console.log(`  Thumb: ${thumb === 'NULL' ? 'NULL' : thumb.split('/').pop()}`);
  console.log(`  1st:   ${urls[0]?.split('/').pop() || 'N/A'}`);
  console.log(`  5th:   ${fifth?.split('/').pop() || 'N/A'}`);
  if (fifth) {
    console.log(`  Thumb == 5th? ${thumb === fifth ? '✅ YES' : '❌ NO — WRONG!'}`);
  }
  console.log('');
}