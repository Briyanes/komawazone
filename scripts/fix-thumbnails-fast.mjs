/**
 * Fast thumbnail fix - optimized for Supabase JS API
 * 
 * Phase 1: NULL all gmbr.pro/dead thumbnails (batch update - fast)
 * Phase 2: Fill NULL thumbnails from chapter_images 5th image (if R2)
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function nullDeadDomainThumbnails() {
  console.log('=== Phase 1: NULL dead-domain thumbnails ===');
  
  // First count
  const { count: gmbrCount } = await sb.from('chapters')
    .select('*', { count: 'exact', head: true })
    .like('thumbnail_url', '%gmbr.pro%');
  console.log(`Found ${gmbrCount} gmbr.pro thumbnails to NULL...`);
  
  // Batch update - get all IDs then update in chunks
  let offset = 0;
  let totalUpdated = 0;
  const CHUNK = 500;
  
  while (true) {
    const { data, error } = await sb.from('chapters')
      .select('id')
      .like('thumbnail_url', '%gmbr.pro%')
      .range(offset, offset + CHUNK - 1);
    
    if (error) { console.error('Query error:', error.message); break; }
    if (!data || data.length === 0) break;
    
    const ids = data.map(c => c.id);
    const { error: updateError } = await sb.from('chapters')
      .update({ thumbnail_url: null, updated_at: new Date().toISOString() })
      .in('id', ids);
    
    if (updateError) {
      console.error('Update error:', updateError.message);
      offset += CHUNK;
      continue;
    }
    
    totalUpdated += ids.length;
    console.log(`  Nulled ${totalUpdated}/${gmbrCount}...`);
    offset += CHUNK;
    await sleep(50);
  }
  
  console.log(`Phase 1 done: ${totalUpdated} thumbnails nulled\n`);
}

async function fillNullThumbnailsFromImages() {
  console.log('=== Phase 2: Fill NULL thumbnails from 5th image ===');
  
  const { count: nullCount } = await sb.from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null);
  console.log(`Found ${nullCount} NULL thumbnails...`);
  
  let fixed = 0;
  let skipped = 0;
  let processed = 0;
  const CHUNK = 100;
  
  while (true) {
    // Always get from offset 0 since we're updating them (they won't be NULL anymore)
    const { data: chapters, error } = await sb.from('chapters')
      .select('id')
      .is('thumbnail_url', null)
      .range(0, CHUNK - 1);
    
    if (error) { console.error('Query error:', error.message); break; }
    if (!chapters || chapters.length === 0) break;
    
    // Get 5th image for ALL chapters in this chunk in ONE query
    const chapterIds = chapters.map(c => c.id);
    const { data: allImages } = await sb.from('chapter_images')
      .select('chapter_id, image_url, number')
      .in('chapter_id', chapterIds)
      .order('number', { ascending: true });
    
    if (!allImages) { processed += CHUNK; continue; }
    
    // Group by chapter_id and find 5th image
    const updates = [];
    const imageMap = new Map();
    for (const img of allImages) {
      if (!imageMap.has(img.chapter_id)) imageMap.set(img.chapter_id, []);
      imageMap.get(img.chapter_id).push(img);
    }
    
    for (const [chId, imgs] of imageMap) {
      if (imgs.length >= 5) {
        const fifth = imgs[4]; // 5th image (sorted by number)
        const url = fifth.image_url;
        // Only use R2 URLs (not dead domains)
        if (url && (url.includes('.r2.dev') || url.includes('r2.cloudflarestorage') || url.includes('pub-'))) {
          updates.push({ id: chId, url });
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }
    
    // Batch update
    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      const batchIds = batch.map(u => u.id);
      // Can't set different URLs per row with .in(), need individual updates
      // But we can use upsert
      const promises = batch.map(u => 
        sb.from('chapters').update({ thumbnail_url: u.url, updated_at: new Date().toISOString() }).eq('id', u.id)
      );
      await Promise.all(promises);
      fixed += batch.length;
    }
    
    processed += CHUNK;
    if (processed % 1000 === 0) console.log(`  Processed ~${processed}/${nullCount}, fixed ${fixed}, skipped ${skipped}...`);
    await sleep(50);
  }
  
  console.log(`Phase 2 done: ${fixed} filled, ${skipped} skipped (no R2 images)\n`);
}

// Run
console.log('🚀 Fast thumbnail fix starting...\n');
const start = Date.now();

try {
  await nullDeadDomainThumbnails();
  await fillNullThumbnailsFromImages();
  
  // Report
  const { count: total } = await sb.from('chapters').select('*', { count: 'exact', head: true });
  const { count: nulls } = await sb.from('chapters').select('*', { count: 'exact', head: true }).is('thumbnail_url', null);
  const { count: gmbr } = await sb.from('chapters').select('*', { count: 'exact', head: true }).like('thumbnail_url', '%gmbr.pro%');
  
  console.log('=== FINAL REPORT ===');
  console.log(`Total chapters: ${total}`);
  console.log(`NULL: ${nulls} (${((nulls/total)*100).toFixed(1)}%)`);
  console.log(`gmbr.pro: ${gmbr} (${((gmbr/total)*100).toFixed(1)}%)`);
  console.log(`OK: ${total - nulls - gmbr} (${(((total-nulls-gmbr)/total)*100).toFixed(1)}%)`);
  console.log(`\nDone in ${((Date.now()-start)/1000).toFixed(1)}s`);
} catch (err) {
  console.error('Fatal:', err);
  process.exit(1);
}