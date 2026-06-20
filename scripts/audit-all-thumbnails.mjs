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

console.log('Scanning ALL chapters globally...\n');

let offset = 0;
let correct = 0, wrong = 0, nullThumb = 0, total = 0;
const issues = [];

while (true) {
  const { data: chapters, error } = await sb.from('chapters')
    .select('id, number, thumbnail_url, manga_id')
    .is('deleted_at', null)
    .order('number')
    .range(offset, offset + 999);

  if (error || !data || data.length === 0) break;

  for (const ch of data) {
    total++;
    if (!ch.thumbnail_url) {
      nullThumb++;
      if (issues.length < 20) issues.push(`  NULL: Ch ${ch.id.slice(0, 8)} (${ch.number})`);
      continue;
    }

    // Get images count for this chapter
    const { count } = await sb.from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', ch.id);

    if (count === null || count === 0) continue; // skip, no images

    // Get 5th image
    const { data: imgs } = await sb.from('chapter_images')
      .select('image_url')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(count >= 5 ? 4 : count - 1, count >= 5 ? 4 : count - 1);

    if (!imgs || imgs.length === 0) continue;

    const expectedUrl = imgs[0].image_url;
    if (ch.thumbnail_url === expectedUrl) {
      correct++;
    } else {
      wrong++;
      if (issues.length < 20) {
        issues.push(`  WRONG: Ch ${ch.id.slice(0, 8)} (manga:${ch.manga_id.slice(0, 8)}, num:${ch.number})`);
        issues.push(`    thumb: ${ch.thumbnail_url?.split('/').pop()}`);
        issues.push(`    expect: ${expectedUrl?.split('/').pop()}`);
      }
    }
  }

  console.log(`  Scanned ${total} chapters... (${correct} ok, ${wrong} wrong, ${nullThumb} null)`);
  if (data.length < 1000) break;
  offset += 1000;
}

console.log('\n═══════════════════════════════════════════════');
console.log(`✅ Correct: ${correct} / ${total}`);
console.log(`⚠️  Wrong:   ${wrong} / ${total}`);
console.log(`❌ NULL:    ${nullThumb} / ${total}`);
if (issues.length > 0) {
  console.log('\n=== FIRST 20 ISSUES ===');
  issues.forEach(i => console.log(i));
}
