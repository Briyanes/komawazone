#!/usr/bin/env node
/**
 * Quick count: how many chapters have NO images (thumbnail_url IS NULL)
 * Uses direct SQL count — should be instant even for 40k+ chapters
 */
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { db: { schema: 'public' } }
);

async function main() {
  console.log('📊 Quick count: chapters with missing images...\n');

  // Count total chapters
  const { count: totalChapters } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true });

  // Count chapters WITHOUT thumbnail (proxy for "no images downloaded")
  const { count: noThumb } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null);

  // Count chapters WITH thumbnail
  const { count: hasThumb } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .not('thumbnail_url', 'is', null);

  // Count chapters with source_url (can be re-scraped)
  const { count: hasSource } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .is('thumbnail_url', null)
    .not('source_url', 'is', null);

  console.log('═══════════════════════════════════════════');
  console.log('  📊 CHAPTER IMAGE STATUS');
  console.log('═══════════════════════════════════════════');
  console.log(`  📦 Total chapters:      ${totalChapters?.toLocaleString()}`);
  console.log(`  ✅ Has images:         ${hasThumb?.toLocaleString()} (${((hasThumb/totalChapters)*100).toFixed(1)}%)`);
  console.log(`  ❌ NO images:          ${noThumb?.toLocaleString()} (${((noThumb/totalChapters)*100).toFixed(1)}%)`);
  console.log(`  🔗 Can re-scrape:      ${hasSource?.toLocaleString()} (have source_url)`);
  console.log('═══════════════════════════════════════════\n');

  // Sample 5 empty chapters to see what manga they belong to
  const { data: samples } = await supabase
    .from('chapters')
    .select('id, number, source_url, manga_id')
    .is('thumbnail_url', null)
    .not('source_url', 'is', null)
    .limit(5);

  if (samples && samples.length > 0) {
    console.log('📋 Sample empty chapters:');
    for (const ch of samples) {
      const { data: manga } = await supabase
        .from('manga')
        .select('slug, title')
        .eq('id', ch.manga_id)
        .single();
      console.log(`   • ${manga?.title || '?'} — Ch ${ch.number}`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});