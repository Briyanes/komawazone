#!/usr/bin/env node
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
};

// Ch 90 Twin Slaves was wrongly changed to 006.jpg (last), should be 005.jpg (5th)
// manga_id prefix: a8dfa8ca
const chRes = await fetch(`${supabaseUrl}/rest/v1/chapters?select=id,number,manga_id,thumbnail_url&deleted_at=is.null&number=eq.90`, { headers });
const chapters = await chRes.json();

for (const ch of (Array.isArray(chapters) ? chapters : [])) {
  if (!ch.manga_id?.startsWith('a8dfa8ca')) continue;
  
  console.log(`Reverting Ch ${ch.number} Twin Slaves`);
  console.log(`  Current (wrong): ${ch.thumbnail_url}`);
  
  // Set back to 5th image (005.jpg)
  const correct = ch.thumbnail_url.replace('006.jpg', '005.jpg');
  console.log(`  Revert to: ${correct}`);
  
  const updateRes = await fetch(`${supabaseUrl}/rest/v1/chapters?id=eq.${ch.id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ thumbnail_url: correct }),
  });
  
  console.log(`  ${updateRes.ok ? '✅ Reverted!' : '❌ Failed'}`);
}
console.log('Done!');