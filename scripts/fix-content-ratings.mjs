/**
 * Fix content_rating untuk manga yang ada di DB.
 *
 * Strategi:
 * 1. Fetch semua manga URL dari sitemap 7 (mature-only, 483 URLs)
 * 2. Manga yang ada di sitemap 7 → mature (confirmed)
 * 3. Manga yang TIDAK ada di sitemap 7 → check genres:
 *    - Jika punya genre explicit mature (Adult, Hentai, etc) → mature
 *    - Jika tidak → general
 *
 * Usage: node --env-file=.env.local scripts/fix-content-ratings.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY_RUN = process.argv.includes('--dry-run');

if (!sbUrl || !sbKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const sb = createClient(sbUrl, sbKey);

// Genres yang secara eksplisit menandakan konten mature
const MATURE_GENRES = [
  'adult', 'mature', '18+', 'hentai', 'ecchi', 'smut', 'lewd',
  'nakadashi', 'ahegao', 'cheating', 'netorare', 'blowjob',
  'paizuri', 'rape', 'sex toys', 'masturbation', 'femdom',
  'big breasts', 'big breast', 'milf', 'doujin', 'group',
  'apron', 'sole female', 'sole male', 'pubic hair', 'big ass',
];

const MATURE_SITEMAPS = [
  'https://04x.manhwaland.land/manga-sitemap7.xml', // Known mature-only
];

function hasMatureGenre(genres) {
  if (!genres || !Array.isArray(genres)) return false;
  return genres.some(g => {
    const genreStr = typeof g === 'string' ? g.toLowerCase() : (g?.name || '').toLowerCase();
    return MATURE_GENRES.some(mg => genreStr.includes(mg));
  });
}

// Slug patterns yang menandakan mature
const MATURE_SLUG_PATTERNS = [
  'ntr', 'netorar', 'cheat', 'rape', 'seduce', 'affair',
  'saimin', 'mind-control', 'nakadashi', 'saimin',
];

function hasMatureSlug(slug) {
  if (!slug) return false;
  const s = slug.toLowerCase();
  return MATURE_SLUG_PATTERNS.some(p => s.includes(p));
}

async function fetchSitemapUrls(sitemapUrl) {
  try {
    const res = await fetch(sitemapUrl, { signal: AbortSignal.timeout(15000) });
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
      .map(m => m[1].trim())
      .filter(u => u.includes('/manga/'));
    return urls;
  } catch (err) {
    console.error(`Error fetching ${sitemapUrl}:`, err.message);
    return [];
  }
}

async function main() {
  console.log(`=== Fix Content Ratings ${DRY_RUN ? '(DRY RUN)' : ''} ===\n`);

  // Step 1: Fetch URLs from mature sitemap
  console.log('Fetching mature sitemap URLs...');
  const matureUrls = new Set();
  for (const sm of MATURE_SITEMAPS) {
    const urls = await fetchSitemapUrls(sm);
    urls.forEach(u => matureUrls.add(u));
    console.log(`  ${sm}: ${urls.length} URLs`);
  }
  console.log(`Total confirmed mature URLs: ${matureUrls.size}\n`);

  // Step 2: Fetch all manga from DB
  const BATCH = 500;
  let offset = 0;
  let totalGeneral = 0;
  let totalMature = 0;
  let totalUnchanged = 0;
  const updates = [];

  while (true) {
    const { data: manga, error } = await sb
      .from('manga')
      .select('id, slug, title, source_url, genres, content_rating')
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error('DB error:', error.message);
      break;
    }
    if (!manga || manga.length === 0) break;

    for (const m of manga) {
      const isInMatureSitemap = m.source_url && matureUrls.has(m.source_url);
      const hasMature = hasMatureGenre(m.genres) || hasMatureSlug(m.slug);

      let newRating;
      if (isInMatureSitemap || hasMature) {
        newRating = 'mature';
      } else {
        newRating = 'general';
      }

      if (newRating !== m.content_rating) {
        updates.push({ id: m.id, slug: m.slug, old: m.content_rating, new: newRating });
        if (newRating === 'general') totalGeneral++;
        else totalMature++;
      } else {
        totalUnchanged++;
      }
    }

    offset += manga.length;
    process.stdout.write(`\rProcessed: ${offset} | Changes: ${updates.length} (→general: ${totalGeneral}, →mature: ${totalMature})`);
  }

  console.log('\n');
  console.log('=== SUMMARY ===');
  console.log(`Total manga checked: ${offset}`);
  console.log(`Unchanged: ${totalUnchanged}`);
  console.log(`→ General: ${totalGeneral}`);
  console.log(`→ Mature: ${totalMature}`);
  console.log(`Total changes: ${updates.length}`);

  // Show sample of changes
  if (updates.length > 0) {
    console.log('\n=== SAMPLE CHANGES (first 10) ===');
    updates.slice(0, 10).forEach(u => {
      console.log(`  ${u.slug}: ${u.old} → ${u.new}`);
    });
  }

  // Apply updates
  if (!DRY_RUN && updates.length > 0) {
    console.log('\n=== APPLYING UPDATES ===');
    let applied = 0;
    for (let i = 0; i < updates.length; i++) {
      const u = updates[i];
      const { error } = await sb
        .from('manga')
        .update({ content_rating: u.new })
        .eq('id', u.id);

      if (error) {
        console.error(`Error updating ${u.slug}:`, error.message);
      } else {
        applied++;
      }

      if ((i + 1) % 100 === 0) {
        process.stdout.write(`\rApplied: ${i + 1}/${updates.length}`);
      }
    }
    console.log(`\n✅ Applied ${applied}/${updates.length} updates`);
  } else if (DRY_RUN) {
    console.log('\n(DRY RUN — no changes applied. Run without --dry-run to apply.)');
  }

  console.log('\n=== Done ===');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});