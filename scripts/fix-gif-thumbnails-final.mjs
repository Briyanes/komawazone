/**
 * FINAL fix: Set NULL when all images are GIF (exit GIF filter).
 */
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { global: { fetch: (u, o) => fetch(u, { ...o, signal: AbortSignal.timeout(15000) }) } }
);

async function main() {
  console.log('🚀 FINAL GIF Fix — NULL when all-GIF\n');

  const { count: initial } = await sb.from('chapters').select('*', { count: 'exact', head: true }).filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`📊 Remaining: ${initial?.toLocaleString()}\n`);

  let fixed = 0, nulled = 0, failed = 0;

  while (true) {
    const { data: chapters, error } = await sb
      .from('chapters').select('id').filter('thumbnail_url', 'ilike', '%.gif%').range(0, 99).order('id');

    if (error) { console.error(error.message); await new Promise(r => setTimeout(r, 2000)); continue; }
    if (!chapters || chapters.length === 0) { console.log('✅ DONE!'); break; }

    await Promise.all(chapters.map(async (ch) => {
      try {
        const { data: imgs } = await sb
          .from('chapter_images').select('image_url').eq('chapter_id', ch.id).order('number', { ascending: true });

        let val = null;
        if (imgs && imgs.length > 0) {
          if (imgs.length >= 5 && !imgs[4].image_url.toLowerCase().endsWith('.gif')) val = imgs[4].image_url;
          else {
            const jpg = imgs.find(i => !i.image_url.toLowerCase().endsWith('.gif'));
            val = jpg ? jpg.image_url : null; // NULL if all GIF
          }
        }

        const isNull = val === null;
        const { error: u } = await sb.from('chapters').update({ thumbnail_url: val }).eq('id', ch.id);
        if (u) failed++; else if (isNull) nulled++; else fixed++;
      } catch { failed++; }
    }));

    const t = fixed + nulled + failed;
    if (t % 500 === 0) console.log(`  ✅ ${fixed} | 📭 ${nulled} | ❌ ${failed} | Total: ${t}`);
  }

  console.log(`\n═══════════════════════════`);
  console.log(`🎉 FINAL RESULTS:`);
  console.log(`  ✅ Fixed:  ${fixed.toLocaleString()}`);
  console.log(`  📭 Nulled: ${nulled.toLocaleString()}`);
  console.log(`  ❌ Failed: ${failed.toLocaleString()}`);
  console.log(`═══════════════════════════\n`);

  const { count: rem } = await sb.from('chapters').select('*', { count: 'exact', head: true }).filter('thumbnail_url', 'ilike', '%.gif%');
  console.log(`🔍 GIF remaining: ${rem?.toLocaleString() ?? 'null'}`);
}

main().catch(e => { console.error('💥', e); process.exit(1); });
