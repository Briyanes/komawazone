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

console.log('═══════════════════════════════════════════════════════');
console.log('  FIX R2-ONLY THUMBNAILS (no chapter_images records)');
console.log('═══════════════════════════════════════════════════════\n');

// Fetch all chapters with thumbnails that are NOT 5th image
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

// Find wrong thumbnails
const wrongChapters = [];
for (const ch of allChapters) {
  const fname = ch.thumbnail_url.split('/').pop() || '';
  const m = fname.match(/^(\d+)\.(jpg|jpeg|png|webp)$/i);
  if (m) {
    const num = parseInt(m[1]);
    if (num !== 5) wrongChapters.push({ ...ch, fname, ext: m[2] });
  } else {
    // Non-standard filename - try to fix by replacing with 5.jpg
    wrongChapters.push({ ...ch, fname, ext: null, isNonStandard: true });
  }
}
console.log(`📊 Found ${wrongChapters.length} wrong thumbnails to fix\n`);

let fixed = 0, skipped = 0, errors = 0;

for (let i = 0; i < wrongChapters.length; i++) {
  const ch = wrongChapters[i];
  
  try {
    // Strategy: Replace the filename in the URL with "5.{ext}"
    // For standard patterns like "1.jpg", "003.jpg" → replace with "5.jpg"
    // For non-standard (UUID), try to extract path and replace with "5.jpg"
    
    let newThumbUrl;
    
    if (ch.isNonStandard) {
      // For non-standard filenames, extract the directory path and append 5.jpg
      // URL pattern: https://cdn.../manga/{slug}/chapters/{chapter}/{filename}
      const url = ch.thumbnail_url;
      const lastSlash = url.lastIndexOf('/');
      if (lastSlash > 0) {
        const basePath = url.substring(0, lastSlash + 1);
        // Try .jpg first (most common)
        newThumbUrl = basePath + '5.jpg';
      } else {
        skipped++;
        continue;
      }
    } else {
      // Standard numbered filename - replace with 5.{ext}
      const url = ch.thumbnail_url;
      const lastSlash = url.lastIndexOf('/');
      if (lastSlash > 0) {
        const basePath = url.substring(0, lastSlash + 1);
        newThumbUrl = basePath + '5.' + ch.ext.toLowerCase();
      } else {
        skipped++;
        continue;
      }
    }
    
    // Update the thumbnail
    const { error: updateErr } = await sb.from('chapters')
      .update({ thumbnail_url: newThumbUrl })
      .eq('id', ch.id);
    
    if (updateErr) {
      errors++;
      if (errors <= 5) console.error(`  Error:`, updateErr.message);
    } else {
      fixed++;
    }
  } catch (e) {
    errors++;
    if (errors <= 5) console.error(`  Exception:`, e.message);
  }
  
  if ((i + 1) % 100 === 0 || i === wrongChapters.length - 1) {
    const pct = (((i + 1) / wrongChapters.length) * 100).toFixed(1);
    process.stdout.write(`\r  Progress: ${i + 1}/${wrongChapters.length} (${pct}%) | Fixed: ${fixed} | Skipped: ${skipped} | Errors: ${errors}  `);
  }
}

console.log(`\n\n═══════════════════════════════════════════════════════`);
console.log(`  RESULTS`);
console.log(`═══════════════════════════════════════════════════════\n`);
console.log(`  ✅ Fixed:   ${fixed.toLocaleString()}`);
console.log(`  ⏭️  Skipped: ${skipped.toLocaleString()}`);
console.log(`  ❌ Errors:  ${errors.toLocaleString()}`);
console.log(`\n═══════════════════════════════════════════════════════\n`);
