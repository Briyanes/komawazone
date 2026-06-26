/**
 * Audit: Berapa chapter yang "metadata-only" (tidak punya chapter_images)?
 *
 * Chapter metadata-only adalah chapter yang di-import tapi gambarnya belum
 * di-download ke R2. Mereka akan lambat saat pertama kali dibuka user karena
 * sistem harus scrape ulang dari source.
 *
 * Usage: node scripts/audit-metadata-only-chapters.mjs
 */
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local (Next.js convention) — falls back to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log('🔍 Auditing metadata-only chapters...\n');

  // 1. Total chapters
  const { count: totalCount } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true });

  // 2. Chapters with no images (metadata-only) — array is null or empty
  const { count: nullImages } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .or('chapter_images.is.null,chapter_images.eq.[]');

  // 3. Chapters WITH images
  const withImages = (totalCount ?? 0) - (nullImages ?? 0);
  const pct = totalCount ? (((nullImages ?? 0) / totalCount) * 100).toFixed(1) : '0';

  console.log('═══════════════════════════════════════════');
  console.log('  📊 CHAPTER IMAGE AUDIT');
  console.log('═══════════════════════════════════════════');
  console.log(`  Total chapters:        ${totalCount?.toLocaleString() ?? '0'}`);
  console.log(`  ✅ With images (R2):   ${withImages.toLocaleString()}`);
  console.log(`  ⚠️  Metadata-only:      ${(nullImages ?? 0).toLocaleString()} (${pct}%)`);
  console.log('═══════════════════════════════════════════\n');

  if ((nullImages ?? 0) === 0) {
    console.log('✅ All chapters have images! No metadata-only chapters found.\n');
    return;
  }

  // 4. Show sample of metadata-only chapters (grouped by manga)
  console.log('📋 Sample metadata-only chapters (top 10 by manga):\n');
  const { data: samples } = await supabase
    .from('chapters')
    .select('id, number, manga_id, manga: manga_id (slug, title)')
    .or('chapter_images.is.null,chapter_images.eq.[]')
    .order('created_at', { ascending: false })
    .range(0, 9);

  if (samples && samples.length > 0) {
    for (const ch of samples) {
      /** @type {{ title?: string } | null} */
      const manga = ch.manga;
      const mangaTitle = manga?.title ?? 'Unknown';
      console.log(`   • ${mangaTitle} — Ch ${ch.number}`);
    }
    console.log(`\n   ... and ${(nullImages ?? 0) - samples.length} more\n`);
  }

  console.log('💡 To backfill these chapters, use the admin backfill tool at:');
  console.log('   /admin/storage-backfill\n');
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});