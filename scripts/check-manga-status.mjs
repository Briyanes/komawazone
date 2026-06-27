#!/usr/bin/env node
/**
 * Check specific manga status in DB — chapters, images, source_url, etc.
 * Usage: node scripts/check-manga-status.mjs <slug>
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const slug = process.argv[2] || 'kinkfolder-zip';

async function main() {
  console.log(`\n🔍 Checking manga: ${slug}\n`);

  // 1. Get manga info
  const { data: manga, error: mErr } = await supabase
    .from('manga')
    .select('id, title, slug, source_url, cover_url, status, created_at, updated_at, deleted_at')
    .eq('slug', slug)
    .single();

  if (mErr || !manga) {
    console.error(`❌ Manga "${slug}" not found in DB!`);
    console.error('   It may need to be imported first.');
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════');
  console.log('  📖 MANGA INFO');
  console.log('═══════════════════════════════════════════');
  console.log(`  ID         : ${manga.id}`);
  console.log(`  Title      : ${manga.title}`);
  console.log(`  Slug       : ${manga.slug}`);
  console.log(`  Source URL : ${manga.source_url ?? '(none)'}`);
  console.log(`  Cover      : ${manga.cover_url ? '✅ Yes' : '❌ Missing'}`);
  console.log(`  Status     : ${manga.status ?? '(null)'}`);
  console.log(`  Deleted    : ${manga.deleted_at ? '⚠️ YES (' + manga.deleted_at + ')' : '✅ No'}`);
  console.log(`  Created    : ${manga.created_at}`);
  console.log('');

  // 2. Count chapters
  const { count: chapterCount } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('manga_id', manga.id)
    .is('deleted_at', null);

  console.log('═══════════════════════════════════════════');
  console.log('  📚 CHAPTERS');
  console.log('═══════════════════════════════════════════');
  console.log(`  Total active chapters: ${chapterCount ?? 0}`);
  console.log('');

  if ((chapterCount ?? 0) === 0) {
    console.log('⚠️  THIS MANGA HAS NO CHAPTERS!');
    console.log('   → It is one of the 68 manga without chapters.');
    console.log('   → You need to import chapters using the admin import tool.\n');
    
    if (manga.source_url) {
      console.log(`   📌 Source URL: ${manga.source_url}`);
      console.log('   → Go to Admin Dashboard → Import → enter this URL');
      console.log('   → Or use the "Import Chapters" button on the manga edit page\n');
    } else {
      console.log('   ❌ No source_url set! Cannot auto-import chapters.');
      console.log('   → You need to find the source URL manually.\n');
    }
    return;
  }

  // 3. Check chapters detail (sample 5)
  const { data: chapters } = await supabase
    .from('chapters')
    .select('id, number, title, thumbnail_url, source_url, created_at')
    .eq('manga_id', manga.id)
    .is('deleted_at', null)
    .order('number', { ascending: true })
    .range(0, 4);

  console.log('  Sample chapters (first 5):');
  if (chapters && chapters.length > 0) {
    for (const ch of chapters) {
      const hasThumb = ch.thumbnail_url ? '✅' : '❌';
      console.log(`    ${hasThumb} Ch ${ch.number}: ${ch.title ?? '(no title)'} | ${ch.thumbnail_url ? 'thumb OK' : 'NO THUMB'}`);
    }
  }
  console.log('');

  // 4. Check images for first chapter
  if (chapters && chapters.length > 0) {
    const firstCh = chapters[0];
    const { data: images, count: imgCount } = await supabase
      .from('chapter_images')
      .select('image_url', { count: 'exact' })
      .eq('chapter_id', firstCh.id)
      .order('number', { ascending: true });

    console.log('═══════════════════════════════════════════');
    console.log('  🖼️  IMAGES (Chapter ' + firstCh.number + ')');
    console.log('═══════════════════════════════════════════');
    console.log(`  Image count: ${imgCount ?? 0}`);
    if (images && images.length > 0) {
      console.log(`  First image: ${images[0].image_url?.substring(0, 80)}...`);
      console.log(`  Last image:  ${images[images.length - 1].image_url?.substring(0, 80)}...`);
    }
    console.log('');

    // Check thumbnail correctness
    if (images && images.length >= 5 && firstCh.thumbnail_url) {
      const expected = images[images.length - 5].image_url;
      const correct = firstCh.thumbnail_url === expected;
      console.log(`  Thumbnail check: ${correct ? '✅ CORRECT (5th from last)' : '❌ WRONG'}`);
      if (!correct) {
        console.log(`    Expected: ${expected?.substring(0, 80)}...`);
        console.log(`    Got:      ${firstCh.thumbnail_url?.substring(0, 80)}...`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  💡 RECOMMENDATION');
  console.log('═══════════════════════════════════════════');
  if ((chapterCount ?? 0) > 0) {
    console.log('  ✅ This manga already has chapters and images.');
    console.log('  No need to re-import unless chapters are missing.');
  } else if (manga.source_url) {
    console.log('  ⚠️  Use Admin → Import to fetch chapters from source.');
  } else {
    console.log('  ❌ Need source URL to import chapters.');
  }
  console.log('');
}

main().catch(err => {
  console.error('❌ Fatal:', err);
  process.exit(1);
});