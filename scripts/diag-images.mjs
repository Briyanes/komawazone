import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkThumbnails() {
  console.log('\n📊 THUMBNAIL URL DISTRIBUTION (chapters)');
  let offset = 0;
  const stats = { r2: 0, gmbr: 0, gmbar: 0, uwakjawa: 0, null: 0, other: 0, total: 0 };
  
  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('thumbnail_url')
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    
    for (const ch of data) {
      stats.total++;
      const url = ch.thumbnail_url || '';
      if (!url) { stats.null++; continue; }
      if (url.includes('.r2.dev') || url.includes('/api/r2/image/') || url.includes('r2.cloudflarestorage')) { stats.r2++; continue; }
      if (url.includes('gmbr.pro')) { stats.gmbr++; continue; }
      if (url.includes('gmbar.xyz')) { stats.gmbar++; continue; }
      if (url.includes('uwakjawa.xyz')) { stats.uwakjawa++; continue; }
      stats.other++;
    }
    offset += 1000;
    if (data.length < 1000) break;
  }
  
  console.log(`  Total chapters: ${stats.total}`);
  console.log(`  R2 (good):      ${stats.r2} (${((stats.r2/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbr.pro (DEAD): ${stats.gmbr} (${((stats.gmbr/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbar.xyz (DEAD): ${stats.gmbar} (${((stats.gmbar/stats.total)*100).toFixed(1)}%)`);
  console.log(`  uwakjawa (DEAD): ${stats.uwakjawa} (${((stats.uwakjawa/stats.total)*100).toFixed(1)}%)`);
  console.log(`  NULL:           ${stats.null} (${((stats.null/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Other:          ${stats.other} (${((stats.other/stats.total)*100).toFixed(1)}%)`);
  return stats;
}

async function checkChapterImages() {
  console.log('\n📊 CHAPTER IMAGES URL DISTRIBUTION');
  let offset = 0;
  const stats = { r2: 0, gmbr: 0, gmbar: 0, uwakjawa: 0, null: 0, other: 0, total: 0 };
  
  while (true) {
    const { data, error } = await sb
      .from('chapter_images')
      .select('image_url')
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    
    for (const img of data) {
      stats.total++;
      const url = img.image_url || '';
      if (!url) { stats.null++; continue; }
      if (url.includes('.r2.dev') || url.includes('/api/r2/image/') || url.includes('r2.cloudflarestorage')) { stats.r2++; continue; }
      if (url.includes('gmbr.pro')) { stats.gmbr++; continue; }
      if (url.includes('gmbar.xyz')) { stats.gmbar++; continue; }
      if (url.includes('uwakjawa.xyz')) { stats.uwakjawa++; continue; }
      stats.other++;
    }
    offset += 1000;
    if (data.length < 1000) break;
  }
  
  console.log(`  Total images:   ${stats.total}`);
  console.log(`  R2 (good):      ${stats.r2} (${((stats.r2/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbr.pro (DEAD): ${stats.gmbr} (${((stats.gmbr/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbar.xyz (DEAD): ${stats.gmbar} (${((stats.gmbar/stats.total)*100).toFixed(1)}%)`);
  console.log(`  uwakjawa (DEAD): ${stats.uwakjawa} (${((stats.uwakjawa/stats.total)*100).toFixed(1)}%)`);
  console.log(`  NULL:           ${stats.null} (${((stats.null/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Other:          ${stats.other} (${((stats.other/stats.total)*100).toFixed(1)}%)`);
  return stats;
}

async function checkCovers() {
  console.log('\n📊 MANGA COVER URL DISTRIBUTION');
  let offset = 0;
  const stats = { r2: 0, gmbr: 0, gmbar: 0, uwakjawa: 0, null: 0, other: 0, total: 0 };
  
  while (true) {
    const { data, error } = await sb
      .from('manga')
      .select('cover_url')
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    
    for (const m of data) {
      stats.total++;
      const url = m.cover_url || '';
      if (!url) { stats.null++; continue; }
      if (url.includes('.r2.dev') || url.includes('/api/r2/image/') || url.includes('r2.cloudflarestorage')) { stats.r2++; continue; }
      if (url.includes('gmbr.pro')) { stats.gmbr++; continue; }
      if (url.includes('gmbar.xyz')) { stats.gmbar++; continue; }
      if (url.includes('uwakjawa.xyz')) { stats.uwakjawa++; continue; }
      stats.other++;
    }
    offset += 1000;
    if (data.length < 1000) break;
  }
  
  console.log(`  Total manga:    ${stats.total}`);
  console.log(`  R2 (good):      ${stats.r2} (${((stats.r2/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbr.pro (DEAD): ${stats.gmbr} (${((stats.gmbr/stats.total)*100).toFixed(1)}%)`);
  console.log(`  gmbar.xyz (DEAD): ${stats.gmbar} (${((stats.gmbar/stats.total)*100).toFixed(1)}%)`);
  console.log(`  uwakjawa (DEAD): ${stats.uwakjawa} (${((stats.uwakjawa/stats.total)*100).toFixed(1)}%)`);
  console.log(`  NULL:           ${stats.null} (${((stats.null/stats.total)*100).toFixed(1)}%)`);
  console.log(`  Other:          ${stats.other} (${((stats.other/stats.total)*100).toFixed(1)}%)`);
  return stats;
}

console.log('🔍 Diagnosing Image URL Distribution on olluq.xyz');
console.log('='.repeat(55));

const thumbStats = await checkThumbnails();
const imgStats = await checkChapterImages();
const coverStats = await checkCovers();

const totalDead = thumbStats.gmbr + thumbStats.gmbar + thumbStats.uwakjawa +
                  imgStats.gmbr + imgStats.gmbar + imgStats.uwakjawa +
                  coverStats.gmbr + coverStats.gmbar + coverStats.uwakjawa;

console.log('\n' + '='.repeat(55));
console.log(`💀 TOTAL DEAD HOST URLs: ${totalDead}`);
console.log(`✅ TOTAL R2 URLs: ${thumbStats.r2 + imgStats.r2 + coverStats.r2}`);
