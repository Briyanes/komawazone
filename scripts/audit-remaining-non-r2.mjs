#!/usr/bin/env node
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // Fetch all non-R2 images in pages
  let allNonR2 = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb.from('chapter_images')
      .select('id, image_url')
      .not('image_url', 'like', '%/api/r2/%')
      .range(offset, offset + 999);
    if (error) { console.error(error); break; }
    if (!data?.length) break;
    allNonR2.push(...data);
    offset += 1000;
    if (data.length < 1000) break;
    process.stdout.write('.');
  }
  console.log('');
  
  // Categorize
  const byDomain = {};
  for (const img of allNonR2) {
    try {
      const u = new URL(img.image_url);
      const d = u.hostname;
      byDomain[d] = (byDomain[d] || 0) + 1;
    } catch {
      byDomain['(invalid)'] = (byDomain['(invalid)'] || 0) + 1;
    }
  }
  
  console.log('=== Non-R2 Images Remaining ===');
  console.log('Total:', allNonR2.length);
  console.log('\nBy domain:');
  const sorted = Object.entries(byDomain).sort((a,b) => b[1] - a[1]);
  for (const [d, c] of sorted) {
    console.log(`  ${d}: ${c}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });