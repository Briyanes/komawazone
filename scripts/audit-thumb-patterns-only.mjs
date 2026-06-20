import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

console.log('═══════════════════════════════════════════════════════');
console.log('  THUMBNAIL PATTERN AUDIT: All 20K+ Chapters');
console.log('═══════════════════════════════════════════════════════\n');

// Fetch ALL chapters with thumbnails
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
console.log(`📊 Total chapters with thumbnails: ${allChapters.length.toLocaleString()}\n`);

// Fetch manga titles
const mangaMap = new Map();
off = 0;
while (true) {
  const { data } = await sb.from('manga')
    .select('id, title, slug')
    .is('deleted_at', null)
    .range(off, off + 999);
  if (!data || data.length === 0) break;
  for (const m of data) mangaMap.set(m.id, m);
  if (data.length < 1000) break;
  off += 1000;
}

// Analyze thumbnail URL patterns
const patterns = {};
const wrongChapters = [];

for (const ch of allChapters) {
  const url = ch.thumbnail_url || '';
  const fname = url.split('/').pop() || '';
  
  // Extract the "number" part of filename
  // Patterns: "5.jpg", "005.jpg", "1.jpg", "001.jpg", "10.jpg", "010.jpg"
  const m = fname.match(/^(\d+)\.(jpg|jpeg|png|webp)$/i);
  
  if (m) {
    const num = parseInt(m[1]);
    if (num === 5) {
      patterns['5th_image'] = (patterns['5th_image'] || 0) + 1;
    } else if (num === 1) {
      patterns['1st_image_WRONG'] = (patterns['1st_image_WRONG'] || 0) + 1;
      const manga = mangaMap.get(ch.manga_id);
      if (wrongChapters.length < 300) wrongChapters.push({
        manga: manga?.title || '?', slug: manga?.slug || '?',
        chapter: ch.number, id: ch.id, thumb: fname, type: '1ST_IMAGE',
      });
    } else if (num === 2) {
      patterns['2nd_image_WRONG'] = (patterns['2nd_image_WRONG'] || 0) + 1;
      const manga = mangaMap.get(ch.manga_id);
      if (wrongChapters.length < 300) wrongChapters.push({
        manga: manga?.title || '?', slug: manga?.slug || '?',
        chapter: ch.number, id: ch.id, thumb: fname, type: '2ND_IMAGE',
      });
    } else if (num === 3) {
      patterns['3rd_image_WRONG'] = (patterns['3rd_image_WRONG'] || 0) + 1;
      const manga = mangaMap.get(ch.manga_id);
      if (wrongChapters.length < 300) wrongChapters.push({
        manga: manga?.title || '?', slug: manga?.slug || '?',
        chapter: ch.number, id: ch.id, thumb: fname, type: '3RD_IMAGE',
      });
    } else if (num === 4) {
      patterns['4th_image_WRONG'] = (patterns['4th_image_WRONG'] || 0) + 1;
      const manga = mangaMap.get(ch.manga_id);
      if (wrongChapters.length < 300) wrongChapters.push({
        manga: manga?.title || '?', slug: manga?.slug || '?',
        chapter: ch.number, id: ch.id, thumb: fname, type: '4TH_IMAGE',
      });
    } else {
      patterns[`image_${num}_OTHER`] = (patterns[`image_${num}_OTHER`] || 0) + 1;
      const manga = mangaMap.get(ch.manga_id);
      if (wrongChapters.length < 300) wrongChapters.push({
        manga: manga?.title || '?', slug: manga?.slug || '?',
        chapter: ch.number, id: ch.id, thumb: fname, type: `IMAGE_${num}`,
      });
    }
  } else {
    // Non-standard filename (UUID-based, etc.)
    patterns['non_standard'] = (patterns['non_standard'] || 0) + 1;
    const manga = mangaMap.get(ch.manga_id);
    if (wrongChapters.length < 300) wrongChapters.push({
      manga: manga?.title || '?', slug: manga?.slug || '?',
      chapter: ch.number, id: ch.id, thumb: fname, type: 'NON_STANDARD',
      url: url.slice(-60),
    });
  }
}

// Results
const total = allChapters.length;
const correct5th = patterns['5th_image'] || 0;
const wrong1st = patterns['1st_image_WRONG'] || 0;
const wrong2nd = patterns['2nd_image_WRONG'] || 0;
const wrong3rd = patterns['3rd_image_WRONG'] || 0;
const wrong4th = patterns['4th_image_WRONG'] || 0;
const nonStandard = patterns['non_standard'] || 0;
const otherNums = Object.entries(patterns).filter(([k]) => k.includes('_OTHER')).reduce((a,[,v]) => a+v, 0);

const totalWrong = wrong1st + wrong2nd + wrong3rd + wrong4th + nonStandard + otherNums;
const pct = total > 0 ? ((correct5th / total) * 100).toFixed(2) : 0;

console.log('═══════════════════════════════════════════════════════');
console.log('  THUMBNAIL PATTERN ANALYSIS');
console.log('═══════════════════════════════════════════════════════\n');

console.log('📊 Pattern Breakdown:');
for (const [pattern, count] of Object.entries(patterns).sort((a,b) => b[1]-a[1])) {
  const mark = pattern === '5th_image' ? '✅' : '⚠️';
  console.log(`   ${mark} ${pattern}: ${count.toLocaleString()}`);
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`   ✅ Correct (5th image):   ${correct5th.toLocaleString()}`);
console.log(`   ⚠️  Wrong:                ${totalWrong.toLocaleString()}`);
console.log(`   📊 Total:                ${total.toLocaleString()}`);
console.log(`\n   ✨ 5th image rate: ${pct}%\n`);

if (wrongChapters.length > 0) {
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  ⚠️ WRONG THUMBNAILS (showing first 100)`);
  console.log(`═══════════════════════════════════════════════════════\n`);
  
  // Group by type
  const byType = {};
  for (const ch of wrongChapters) {
    if (!byType[ch.type]) byType[ch.type] = [];
    byType[ch.type].push(ch);
  }
  
  for (const [type, items] of Object.entries(byType)) {
    console.log(`── ${type} (${items.length}${items.length >= 50 ? '+' : ''}) ──`);
    items.slice(0, 20).forEach(c => {
      console.log(`  ${c.manga} | Ch ${c.chapter} | thumb:${c.thumb}`);
    });
    if (items.length > 20) console.log(`  ... and ${items.length - 20} more\n`);
    else console.log('');
  }
} else {
  console.log('✅ ALL THUMBNAILS USE THE 5TH IMAGE! No issues found.\n');
}

writeFileSync('docs/AUDIT_THUMB_PATTERNS.json', JSON.stringify({
  timestamp: new Date().toISOString(),
  total, correct5th, totalWrong, pct, patterns,
  wrongChapters: wrongChapters.slice(0, 500),
}, null, 2));
console.log('📁 Report saved to docs/AUDIT_THUMB_PATTERNS.json');
console.log('═══════════════════════════════════════════════════════\n');
