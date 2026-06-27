#!/usr/bin/env node
/**
 * Deep check specific chapter - check all possible image storage formats
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const slug = process.argv[2] || 'kinkfolder-zip';
const chNum = parseInt(process.argv[3] || '3');

async function main() {
  // Get manga
  const { data: manga } = await supabase
    .from('manga')
    .select('id, title')
    .eq('slug', slug)
    .single();

  if (!manga) { console.error('Manga not found'); process.exit(1); }

  // Get chapter
  const { data: chapter } = await supabase
    .from('chapters')
    .select('*')
    .eq('manga_id', manga.id)
    .eq('number', chNum)
    .single();

  if (!chapter) { console.error(`Chapter ${chNum} not found`); process.exit(1); }

  console.log(`\n📖 ${manga.title} — Chapter ${chNum}`);
  console.log(`   ID: ${chapter.id}`);
  console.log(`   thumbnail_url: ${chapter.thumbnail_url ?? '(NULL)'}`);
  console.log(`   source_url: ${chapter.source_url ?? '(none)'}`);
  console.log(`   created_at: ${chapter.created_at}`);

  // Check chapter_images table
  const { data: images, count } = await supabase
    .from('chapter_images')
    .select('*')
    .eq('chapter_id', chapter.id)
    .order('number', { ascending: true });

  console.log(`\n   chapter_images count: ${count ?? 0}`);
  if (images && images.length > 0) {
    for (const img of images) {
      console.log(`     #${img.number}: ${img.image_url}`);
    }
  }

  // Maybe images stored as JSON in chapter itself?
  console.log(`\n   Raw chapter columns:`);
  for (const [key, val] of Object.entries(chapter)) {
    if (key === 'id' || key === 'manga_id') continue;
    const display = typeof val === 'string' && val.length > 200 ? val.substring(0, 200) + '...' : val;
    console.log(`     ${key}: ${JSON.stringify(display)}`);
  }

  // Check if there's a 'pages' or 'images' JSON column
  if (chapter.pages) {
    console.log(`\n   ⚠️  Chapter has 'pages' column!`);
    const pages = typeof chapter.pages === 'string' ? JSON.parse(chapter.pages) : chapter.pages;
    console.log(`   Pages: ${Array.isArray(pages) ? pages.length + ' items' : typeof pages}`);
  }
  if (chapter.images) {
    console.log(`\n   ⚠️  Chapter has 'images' column!`);
    const imgs = typeof chapter.images === 'string' ? JSON.parse(chapter.images) : chapter.images;
    console.log(`   Images: ${Array.isArray(imgs) ? imgs.length + ' items' : typeof imgs}`);
    if (Array.isArray(imgs)) {
      console.log(`   First: ${imgs[0]}`);
    }
  }

  console.log('\n');
}

main().catch(console.error);