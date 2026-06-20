#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ─── Issue 1: the-stand-up-guy-dolphin ───
console.log('\n═══ ISSUE 1: the-stand-up-guy-dolphin ═══');
const { data: d1 } = await supabase
  .from('manga')
  .select('id, slug, title, source_url')
  .eq('slug', 'the-stand-up-guy-dolphin')
  .single();

if (d1) {
  console.log(`Manga: ${d1.title} | source: ${d1.source_url}`);
  const { data: ch1 } = await supabase
    .from('chapters')
    .select('id, number, title, thumbnail_url')
    .eq('manga_id', d1.id)
    .is('deleted_at', null)
    .order('number')
    .limit(10);

  for (const ch of ch1 ?? []) {
    const { count } = await supabase
      .from('chapter_images')
      .select('id', { count: 'exact', head: true })
      .eq('chapter_id', ch.id);
    console.log(`  Ch.${ch.number} | title: "${ch.title}" | images: ${count} | thumb: ${ch.thumbnail_url?.substring(0, 60) ?? 'NULL'}`);
  }
} else {
  console.log('Manga not found!');
}

// ─── Issue 2: from-weakling-to-nemesis ───
console.log('\n═══ ISSUE 2: from-weakling-to-nemesis ═══');
const { data: ch2 } = await supabase
  .from('chapters')
  .select('id, number, title, manga(slug, title, source_url), chapter_images(id, number, image_url)')
  .eq('id', 'f1249f5d-e378-40f6-94dc-7d8c30dee4d3')
  .single();

if (ch2) {
  console.log(`Manga: ${ch2.manga?.title} | Ch.${ch2.number} | title: "${ch2.title}"`);
  console.log(`Images: ${ch2.chapter_images?.length ?? 0}`);
  if (ch2.chapter_images?.length) {
    console.log('Sample URLs:');
    ch2.chapter_images.slice(0, 5).forEach(img => {
      console.log(`  [${img.number}] ${img.image_url.substring(0, 120)}`);
    });
  }
} else {
  console.log('Chapter f1249f5d not found, checking manga...');
  const { data: m2 } = await supabase
    .from('manga')
    .select('id, slug, title, source_url')
    .eq('slug', 'from-weakling-to-nemesis')
    .single();
  if (m2) {
    console.log(`Manga: ${m2.title} | source: ${m2.source_url}`);
    const { data: ch2b } = await supabase
      .from('chapters')
      .select('id, number, title')
      .eq('manga_id', m2.id)
      .is('deleted_at', null)
      .order('number')
      .limit(5);
    (ch2b ?? []).forEach(c => console.log(`  Ch.${c.number} (${c.id.substring(0,8)}) title: "${c.title}"`));
  }
}

// ─── Issue 3: Wrong chapter titles ───
console.log('\n═══ ISSUE 3: Wrong chapter titles ═══');
const { data: badTitles } = await supabase
  .from('chapters')
  .select('id, number, title, manga(slug, title)')
  .is('deleted_at', null)
  .not('title', 'is', null)
  .limit(1000);

const wrongTitles = (badTitles ?? []).filter(ch => {
  if (!ch.title) return false;
  const title = ch.title.toLowerCase().trim();
  const mangaTitle = ch.manga?.title?.toLowerCase().trim() ?? '';
  if (mangaTitle && title === mangaTitle) return true;
  if (!/chapter|ch\.?\s*\d|chap\s*\d/i.test(title) && title.length > 20) {
    return !/^\d+(\.\d+)?$/.test(title);
  }
  return false;
});
console.log(`Found ${wrongTitles.length} suspicious titles (from ${badTitles?.length ?? 0} sampled):`);
wrongTitles.slice(0, 15).forEach(ch => {
  console.log(`  ${ch.manga?.slug} Ch.${ch.number}: "${ch.title?.substring(0, 60)}"`);
});

// ─── Issue 4: Chapters with 50+ images ───
console.log('\n═══ ISSUE 4: Chapters with 50+ images ═══');
const { data: allCh } = await supabase
  .from('chapters')
  .select('id, number, title, manga(slug, title), chapter_images(id)')
  .is('deleted_at', null)
  .limit(2000);

const big = (allCh ?? [])
  .map(ch => ({
    slug: ch.manga?.slug,
    number: ch.number,
    title: ch.title,
    count: ch.chapter_images?.length ?? 0,
  }))
  .filter(ch => ch.count >= 40)
  .sort((a, b) => b.count - a.count)
  .slice(0, 20);

console.log(`Found ${big.length} chapters with 40+ images (from ${allCh?.length ?? 0} sampled):`);
big.forEach(ch => {
  console.log(`  ${ch.slug} Ch.${ch.number} — ${ch.count} images — title: "${ch.title?.substring(0, 40) ?? 'NULL'}"`);
});

console.log('\n═══ DONE ═══');