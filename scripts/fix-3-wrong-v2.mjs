#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
};

// Wrong chapters from verification
const wrongChapters = [
  { mangaPrefix: 'eb366af6', chapterNum: 0 },
  { mangaPrefix: 'c97783f9', chapterNum: 143 },
  { mangaPrefix: '5f24a28b', chapterNum: 53 },
];

for (const { mangaPrefix, chapterNum } of wrongChapters) {
  const chRes = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,manga_id,thumbnail_url&deleted_at=is.null&number=eq.${chapterNum}`, { headers });
  const chapters = await chRes.json();
  
  for (const ch of (Array.isArray(chapters) ? chapters : [])) {
    if (!ch.manga_id?.startsWith(mangaPrefix)) continue;
    
    // Get images sorted by number
    const imgRes = await fetch(`${supabaseUrl}/rest/v1/chapter_images?select=image_url&chapter_id=eq.${ch.id}&order=number.asc`, { headers });
    const imgs = await imgRes.json();
    const urls = (Array.isArray(imgs) ? imgs : []).map(x => x.image_url).filter(Boolean);
    
    if (urls.length === 0) continue;
    
    // Correct logic: 5th image if >=5, otherwise LAST image
    const correct = urls.length >= 5 ? urls[4] : urls[urls.length - 1];
    
    if (ch.thumbnail_url === correct) {
      console.log(`✅ Ch ${ch.number} (${mangaPrefix}): already correct`);
      continue;
    }
    
    console.log(`Fixing Ch ${ch.number} (${mangaPrefix}): ${urls.length} imgs`);
    console.log(`  Current: ${ch.thumbnail_url?.split('/').pop()}`);
    console.log(`  Correct: ${correct?.split('/').pop()} (${urls.length >= 5 ? '5th' : 'last'})`);
    
    const updateRes = await fetch(`${supabaseUrl}/rest/v1/chapters?id=eq.${ch.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({ thumbnail_url: correct }),
    });
    
    console.log(`  ${updateRes.ok ? '✅ Fixed!' : '❌ Failed'}`);
  }
}
console.log('\nDone!');