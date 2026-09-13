#!/usr/bin/env node
/**
 * FAST diagnostic — count empty chapters using head counts only.
 * Uses thumbnail_url as proxy + chapter_images table head count.
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('⚡ FAST Chapter Image Audit');
  console.log('='.repeat(55));

  // 1. Total chapters
  console.log('\n📊 Counting chapters...');
  const { count: totalChapters, error: e1 } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true });
  if (e1) throw e1;
  console.log(`   📦 Total chapters: ${totalChapters?.toLocaleString()}`);

  // 2. Chapters WITH thumbnail (proxy for "has images")
  const { count: hasThumb, error: e2 } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .not('thumbnail_url', 'is', null);
  if (e2) throw e2;
  console.log(`   ✅ Chapters with thumbnail: ${hasThumb?.toLocaleString()}`);

  // 3. Chapters WITHOUT thumbnail
  const { count: noThumb, error: e3 } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null);
  if (e3) throw e3;
  console.log(`   ❌ Chapters without thumbnail: ${noThumb?.toLocaleString()}`);

  // 4. Empty chapters that CAN be re-scraped (have source_url)
  const { count: canRescrape, error: e4 } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null)
    .not('source_url', 'is', null);
  if (e4) throw e4;
  console.log(`   🔗 Can re-scrape (have source_url): ${canRescrape?.toLocaleString()}`);

  // 5. Total manga
  const { count: totalManga, error: e5 } = await supabase
    .from('manga')
    .select('*', { count: 'exact', head: true });
  if (e5) throw e5;
  console.log(`   📚 Total manga: ${totalManga?.toLocaleString()}`);

  // 6. Manga with null/empty cover
  const { count: noCover, error: e6 } = await supabase
    .from('manga')
    .select('*', { count: 'exact', head: true })
    .or('cover_url.is.null,cover_url.eq.""');
  if (e6) throw e6;
  console.log(`   🖼️  Manga without cover: ${noCover?.toLocaleString()}`);

  // Summary
  const pctFilled = totalChapters > 0 ? ((hasThumb / totalChapters) * 100).toFixed(1) : '0';
  const pctEmpty = totalChapters > 0 ? ((noThumb / totalChapters) * 100).toFixed(1) : '0';

  console.log('\n' + '='.repeat(55));
  console.log('  📊 AUDIT RESULTS');
  console.log('='.repeat(55));
  console.log(`  📚 Total manga:           ${totalManga?.toLocaleString()}`);
  console.log(`  📦 Total chapters:        ${totalChapters?.toLocaleString()}`);
  console.log(`  ✅ Chapters WITH images:  ${hasThumb?.toLocaleString()} (${pctFilled}%)`);
  console.log(`  ❌ Chapters EMPTY:        ${noThumb?.toLocaleString()} (${pctEmpty}%)`);
  console.log(`  🔗 Can re-scrape:         ${canRescrape?.toLocaleString()}`);
  console.log(`  🖼️  Manga without cover:  ${noCover?.toLocaleString()}`);
  console.log('='.repeat(55));

  // Verdict
  if (noThumb === 0) {
    console.log('\n🎉 PERFECT! All chapters have images!');
  } else if (noThumb < 100) {
    console.log(`\n⚠️  ${noThumb} chapters need backfill — manageable size.`);
    console.log('   Run: npm run import:local -- auto-update --proxy');
  } else {
    console.log(`\n🔴 ${noThumb} chapters need backfill — significant work needed.`);
    console.log('   Run: npm run import:local -- auto-update --proxy --batch-size 500 --batch-pause 600000');
  }

  if (noCover > 0) {
    console.log(`\n🖼️  ${noCover} manga missing cover — run: node scripts/scrape-missing-covers.mjs`);
  }
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});