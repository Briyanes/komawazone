#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const CHAPTER_ID = 'f1249f5d-e378-40f6-94dc-7d8c30dee4d3';

// Get chapter info
const { data: ch } = await sb.from('chapters').select('id, number, title, thumbnail_url, manga_id').eq('id', CHAPTER_ID).single();
console.log('=== CHAPTER INFO ===');
console.log('Number:', ch.number, '| Title:', ch.title);
console.log('Thumbnail:', ch.thumbnail_url);

// Get manga source_url
const { data: manga } = await sb.from('manga').select('slug, title, source_url').eq('id', ch.manga_id).single();
console.log('\n=== MANGA ===');
console.log('Title:', manga.title, '| Slug:', manga.slug);
console.log('Source URL:', manga.source_url);

// Get all images
const { data: images } = await sb.from('chapter_images').select('id, number, image_url').eq('chapter_id', CHAPTER_ID).order('number', { ascending: true });
console.log('\n=== IMAGES IN DB ===');
console.log('Total:', images.length);
const nums = images.map((i) => i.number);
console.log('Numbers:', nums.join(', '));

// Check gaps
const max = Math.max(...nums);
const missing = [];
for (let i = 1; i <= max; i++) {
  if (!nums.includes(i)) missing.push(i);
}
console.log('\nMissing page numbers:', missing.length > 0 ? missing.join(', ') : 'NONE');
console.log('5th image (index 4):', images[4]?.image_url ?? 'N/A');
console.log('Thumbnail match?', images[4]?.image_url === ch.thumbnail_url ? '✅ YES' : '❌ NO');

// Also show what page 1, 2, 3 look like (prefix)
console.log('\n=== FIRST 5 IMAGES ===');
for (let i = 0; i < Math.min(5, images.length); i++) {
  console.log(`  [${i}] #${images[i].number}: ${images[i].image_url.split('/').pop()}`);
}