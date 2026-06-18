/**
 * Comprehensive thumbnail fix script
 * 
 * Strategy:
 * 1. NULL thumbnails → get 5th image from chapter_images (if R2/working)
 * 2. gmbr.pro thumbnails → NULL them (dead domain, UI falls back to cover)
 * 3. Other dead CDN thumbnails → NULL them
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

// Dead CDN domains
const DEAD_DOMAINS = ['gmbr.pro', 'gmbar.xyz'];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isDeadUrl(url) {
  if (!url) return false;
  return DEAD_DOMAINS.some(d => url.includes(d));
}

function isR2Url(url) {
  if (!url) return false;
  return url.includes('.r2.dev') || url.includes('r2.cloudflarestorage.com') || url.includes('pub-');
}

async function fixNullThumbnails() {
  console.log('\n=== Phase 1: Fix NULL thumbnails ===');
  
  let offset = 0;
  let fixed = 0;
  let skipped = 0;
  
  while (true) {
    const { data: chapters, error } = await sb.from('chapters')
      .select('id, number, manga_id, thumbnail_url')
      .is('thumbnail_url', null)
      .range(offset, offset + BATCH_SIZE - 1);
    
    if (error) {
      console.error('Query error:', error.message);
      break;
    }
    if (!chapters || chapters.length === 0) break;
    
    for (const chapter of chapters) {
      // Get 5th image from chapter_images
      const { data: images } = await sb.from('chapter_images')
        .select('image_url')
        .eq('chapter_id', chapter.id)
        .order('number', { ascending: true })
        .range(4, 4); // 5th image (index 4)
      
      if (images && images.length > 0 && isR2Url(images[0].image_url)) {
        // Update with R2 image
        const { error: updateError } = await sb.from('chapters')
          .update({ thumbnail_url: images[0].image_url })
          .eq('id', chapter.id);
        
        if (!updateError) {
          fixed++;
          if (fixed % 100 === 0) console.log(`  Fixed ${fixed} null thumbnails...`);
        }
      } else {
        skipped++;
      }
    }
    
    offset += BATCH_SIZE;
    await sleep(100); // Rate limit
  }
  
  console.log(`Phase 1 done: Fixed ${fixed}, Skipped (no R2 images) ${skipped}`);
}

async function fixGmbrThumbnails() {
  console.log('\n=== Phase 2: Fix gmbr.pro thumbnails (NULL them) ===');
  
  let fixed = 0;
  
  for (const domain of DEAD_DOMAINS) {
    let offset = 0;
    
    while (true) {
      const { data: chapters, error } = await sb.from('chapters')
        .select('id, number, thumbnail_url')
        .like('thumbnail_url', `%${domain}%`)
        .range(offset, offset + BATCH_SIZE - 1);
      
      if (error) {
        console.error(`Query error for ${domain}:`, error.message);
        break;
      }
      if (!chapters || chapters.length === 0) break;
      
      // Batch update: set all to NULL
      const ids = chapters.map(c => c.id);
      const { error: updateError } = await sb.from('chapters')
        .update({ thumbnail_url: null })
        .in('id', ids);
      
      if (updateError) {
        console.error(`Update error:`, updateError.message);
      } else {
        fixed += chapters.length;
        console.log(`  Nulled ${chapters.length} ${domain} thumbnails (total: ${fixed})`);
      }
      
      offset += BATCH_SIZE;
      await sleep(100);
    }
  }
  
  console.log(`Phase 2 done: Nulled ${fixed} dead-domain thumbnails`);
}

// Run
console.log('🚀 Starting comprehensive thumbnail fix...');
const start = Date.now();

try {
  await fixNullThumbnails();
  await fixGmbrThumbnails();
  
  // Final report
  const { count: totalChapters } = await sb.from('chapters').select('*', { count: 'exact', head: true });
  const { count: nullThumbs } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('thumbnail_url', null);
  const { count: gmbrThumbs } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%gmbr.pro%');
  
  console.log('\n=== FINAL REPORT ===');
  console.log(`Total chapters: ${totalChapters}`);
  console.log(`NULL thumbnails: ${nullThumbs} (${((nullThumbs/totalChapters)*100).toFixed(1)}%)`);
  console.log(`gmbr.pro thumbnails: ${gmbrThumbs} (${((gmbrThumbs/totalChapters)*100).toFixed(1)}%)`);
  console.log(`OK thumbnails: ${totalChapters - nullThumbs - gmbrThumbs} (${(((totalChapters - nullThumbs - gmbrThumbs)/totalChapters)*100).toFixed(1)}%)`);
  console.log(`\n✅ Done in ${((Date.now() - start) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error('Fatal error:', err);
  process.exit(1);
}