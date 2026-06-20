#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
};

// These 2 manga IDs from verification
const mangaIds = ['a8dfa8ca', '685d3ae6'];

for (const partialId of mangaIds) {
  // Find chapters with this manga prefix and Ch 40 or 90
  for (const chapterNum of [40, 90]) {
    // Search by manga_id prefix using filter
    const chRes = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,manga_id,thumbnail_url&deleted_at=is.null&number=eq.${chapterNum}`, { headers });
    const chapters = await chRes.json();
    
    for (const ch of (Array.isArray(chapters) ? chapters : [])) {
      if (!ch.manga_id?.startsWith(partialId)) continue;
      
      // Get images
      const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
      const imgs = await imgRes.json();
      const urls = (Array.isArray(imgs) ? imgs : []).map(x => x.image_url).filter(Boolean);
      
      if (urls.length === 0) continue;
      
      // Should use last image (since <5 images)
      const correct = urls[urls.length - 1];
      
      console.log(`Fixing Ch ${ch.number} (${ch.manga_id.substring(0,8)}): ${urls.length} imgs`);
      console.log(`  Current: ${ch.thumbnail_url}`);
      console.log(`  Correct: ${correct}`);
      
      // Update
      const updateRes = await fetch(`${supabaseUrl}/rest/v1/chapters?id=eq.${ch.id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
        body: JSON.stringify({ thumbnail_url: correct }),
      });
      
      if (updateRes.ok) {
        console.log(`  ✅ Fixed!`);
      } else {
        console.log(`  ❌ Failed: ${updateRes.status} ${await updateRes.text()}`);
      }
    }
  }
}
console.log('\nDone!');