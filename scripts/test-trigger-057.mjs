#!/usr/bin/env node
/**
 * Test trigger 057: Update chapter images → trigger should auto-set manga thumbnail
 * Picks a manga with multiple chapters, updates a chapter's images, checks if thumbnail changed.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testTrigger() {
  console.log('🧪 Testing trigger 057: auto_set_chapter_thumbnail\n');

  // 1. Find a manga with null/empty cover AND has chapters with images
  const { data: manga } = await supabase
    .from('manga')
    .select('id, slug, title, cover_image_url')
    .is('cover_image_url', null)
    .limit(1)
    .single();

  if (!manga) {
    console.log('⚠️  No manga with null cover found. Trying empty string...');
    const { data: manga2 } = await supabase
      .from('manga')
      .select('id, slug, title, cover_image_url')
      .eq('cover_image_url', '')
      .limit(1)
      .single();
    if (!manga2) {
      console.log('✅ No manga with null/empty cover found — all covers set!');
      return;
    }
    manga = manga2;
  }

  console.log(`📖 Manga: ${manga.title} (${manga.slug})`);
  console.log(`   Current cover: ${manga.cover_image_url || '(null)'}\n`);

  // 2. Find first chapter with images for this manga
  const { data: chapter } = await supabase
    .from('chapters')
    .select('id, chapter_number, images')
    .eq('manga_id', manga.id)
    .not('images', 'eq', '[]')
    .not('images', 'is', null)
    .order('chapter_number', { ascending: true })
    .limit(1)
    .single();

  if (!chapter) {
    console.log('❌ No chapter with images found for this manga');
    return;
  }

  const images = typeof chapter.images === 'string' ? JSON.parse(chapter.images) : chapter.images;
  console.log(`📄 Chapter ${chapter.chapter_number}: ${images?.length || 0} images`);
  console.log(`   First image: ${images?.[0] || '(none)'}\n`);

  // 3. Touch the chapter (update images to same value to fire trigger)
  console.log('🔄 Triggering UPDATE on chapter (touch images)...');
  const { error } = await supabase
    .from('chapters')
    .update({ images: images })
    .eq('id', chapter.id);

  if (error) {
    console.log('❌ Update failed:', error.message);
    return;
  }

  console.log('✅ Update sent. Waiting 2s for trigger...\n');
  await new Promise(r => setTimeout(r, 2000));

  // 4. Check if manga cover changed
  const { data: updated } = await supabase
    .from('manga')
    .select('cover_image_url')
    .eq('id', manga.id)
    .single();

  console.log(`📊 Result:`);
  console.log(`   Before: ${manga.cover_image_url || '(null)'}`);
  console.log(`   After:  ${updated?.cover_image_url || '(null)'}\n`);

  if (updated?.cover_image_url && updated.cover_image_url !== manga.cover_image_url) {
    console.log('✅✅✅ TRIGGER 057 IS WORKING! Cover auto-set from chapter images.');
  } else {
    console.log('⚠️  Cover did not change. Trigger may not have fired or cover was already set.');
    console.log('   Check pg_trigger to confirm trigger exists:');
    console.log('   SELECT tgname, tgenabled FROM pg_trigger WHERE tgname LIKE \'%thumbnail%\';');
  }
}

testTrigger().catch(console.error);