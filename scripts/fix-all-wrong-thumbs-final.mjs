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

const DRY_RUN = process.argv.includes('--dry-run');
console.log(`═══════════════════════════════════════════════════════`);
console.log(`  FIX ALL WRONG THUMBNAILS ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}`);
console.log(`═══════════════════════════════════════════════════════\n`);

// Step 1: Fetch all chapters with thumbnails
console.log('🔍 Fetching all chapters...');
const allChapters = [];
let off = 0;
while (true) {
  const { data, error } = await sb.from('chapters')
    .select('id, number, thumbnail_url, manga_id')
    .is('deleted_at', null)
    .not('thumbnail_url', 'is', null)
    .order('id')
    .range(off, off + 999);
  if (error || !data || data.length === 0) break;
  allChapters.push(...data);
  if (data.length < 1000) break;
  off += 1000;
}
console.log(`  Total: ${allChapters.length.toLocaleString()} chapters\n`);

// Step 2: Find wrong thumbnails
const wrongChapters = [];
for (const ch of allChapters) {
  const fname = ch.thumbnail_url.split('/').pop() || '';
  const m = fname.match(/^(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (m) {
    const num = parseInt(m[1]);
    if (num !== 5) {
      wrongChapters.push({ ...ch, currentNum: num });
    }
  } else {
    // Non-standard - also needs fixing
    wrongChapters.push({ ...ch, currentNum: -1, isNonStandard: true });
  }
}
console.log(`📊 Found ${wrongChapters.length} chapters with wrong thumbnails\n`);

// Step 3: Fix each wrong chapter
console.log(`${DRY_RUN ? '🔍 DRY RUN - would fix' : '🔧 Fixing'} ${wrongChapters.length} chapters...\n`);

let fixed = 0, skipped = 0, errors = 0;
const batchSize = 50;

for (let i = 0; i < wrongChapters.length; i += batchSize) {
  const batch = wrongChapters.slice(i, i + batchSize);
  
  for (const ch of batch) {
    try {
      // Fetch 5th image for this chapter
      const { data: imgs, error } = await sb.from('chapter_images')
        .select('image_url')
        .eq('chapter_id', ch.id)
        .order('number', { ascending: true })
        .range(0, 4);
      
      if (error || !imgs || imgs.length === 0) {
        skipped++;
        continue;
      }
      
      // Expected: 5th image, or last available if <5
      const expectedIdx = Math.min(4, imgs.length - 1);
      const expectedUrl = imgs[expectedIdx]?.image_url;
      
      if (!expectedUrl) {
        skipped++;
        continue;
      }
      
      // Skip if already correct
      if (ch.thumbnail_url === expectedUrl) {
        skipped++;
        continue;
      }
      
      if (DRY_RUN) {
        fixed++;
      } else {
        // Update the thumbnail
        const { error: updateErr } = await sb.from('chapters')
          .update({ thumbnail_url: expectedUrl })
          .eq('id', ch.id);
        
        if (updateErr) {
          errors++;
          if (errors <= 5) console.error(`  Error updating ${ch.id}:`, updateErr.message);
        } else {
          fixed++;
        }
      }
    } catch (e) {
      errors++;
      if (errors <= 5) console.error(`  Exception for ${ch.id}:`, e.message);
    }
  }
  
  const pct = ((Math.min(i + batchSize, wrongChapters.length) / wrongChapters.length) * 100).toFixed(1);
  process.stdout.write(`\r  Progress: ${Math.min(i + batchSize, wrongChapters.length)}/${wrongChapters.length} (${pct}%) | Fixed: ${fixed} | Skipped: ${skipped} | Errors: ${errors}  `);
}

console.log(`\n\n═══════════════════════════════════════════════════════`);
console.log(`  ${DRY_RUN ? 'DRY RUN' : 'LIVE'} RESULTS`);
console.log(`═══════════════════════════════════════════════════════\n`);
console.log(`  ✅ Fixed:   ${fixed.toLocaleString()}`);
console.log(`  ⏭️  Skipped: ${skipped.toLocaleString()} (already correct or no images)`);
console.log(`  ❌ Errors:  ${errors.toLocaleString()}`);
console.log(`\n═══════════════════════════════════════════════════════\n`);
