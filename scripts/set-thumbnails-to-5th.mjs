/**
 * Set thumbnail to 5th image for ALL chapters
 * 
 * For chapters with NULL thumbnail that HAVE images → set to 5th image
 * For chapters with existing thumbnail → verify and keep or update
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const PAGE_SIZE = 1000;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log('\n🎯 Set Thumbnail to 5th Image (for chapters with NULL thumbnail)\n');

  // Step 1: Get ALL chapters with NULL thumbnail (paginated)
  console.log('Step 1: Fetching chapters with NULL thumbnail...');
  const nullThumbChapters = [];
  let offset = 0;
  while (true) {
    const { data: batch, error } = await sb.from('chapters')
      .select('id, number, manga_id')
      .is('deleted_at', null)
      .is('thumbnail_url', null)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) { console.error('Error:', error.message); break; }
    if (!batch || batch.length === 0) break;
    nullThumbChapters.push(...batch);
    offset += PAGE_SIZE;
    if (offset % 5000 === 0) console.log('  ...' + offset + ' fetched');
  }
  console.log('  Total chapters with NULL thumbnail: ' + nullThumbChapters.length + '\n');

  // Step 2: For each chapter, get 5th image and set as thumbnail
  console.log('Step 2: Setting 5th image as thumbnail...');
  let updated = 0;
  let noImages = 0;
  let batch = [];
  const startTime = Date.now();

  for (let i = 0; i < nullThumbChapters.length; i++) {
    const ch = nullThumbChapters[i];
    
    // Get 5th image for this chapter
    const { data: imgs } = await sb.from('chapter_images')
      .select('image_url')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(4, 4); // 5th image (index 4)

    if (imgs && imgs.length > 0 && imgs[0].image_url) {
      batch.push({ id: ch.id, thumb: imgs[0].image_url });
    } else {
      noImages++;
    }

    // Process batch updates
    if (batch.length >= 100 || i === nullThumbChapters.length - 1) {
      for (const item of batch) {
        const { error: updErr } = await sb.from('chapters')
          .update({ thumbnail_url: item.thumb })
          .eq('id', item.id);
        if (updErr) console.error('  Update error:', updErr.message);
        else updated++;
      }
      batch = [];
    }

    if ((i + 1) % 500 === 0) {
      const pct = ((i + 1) / nullThumbChapters.length * 100).toFixed(0);
      console.log('  Progress: ' + pct + '% | Updated: ' + updated + ' | No images: ' + noImages);
    }
    await sleep(20);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== DONE ===');
  console.log('  Total processed:  ' + nullThumbChapters.length);
  console.log('  Updated to 5th:   ' + updated);
  console.log('  No images (skip): ' + noImages);
  console.log('  Time:             ' + elapsed + 's');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
