#!/usr/bin/env node
/**
 * Fix chapter_images with non-R2 URLs (gmbr.pro, https external).
 * 
 * These are likely images that failed during initial migration.
 * Strategy:
 *   1. Find chapter_images with external URLs
 *   2. Delete them (they're dead CDN links)
 *   3. The lazy-load mechanism will re-download them on next visit
 * 
 * Alternatively, try to download and upload to R2 directly.
 * 
 * Usage:
 *   node scripts/backfill-non-r2-images.mjs              # fix all
 *   node scripts/backfill-non-r2-images.mjs --dry-run    # preview only
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const envPath = path.resolve(process.cwd(), '.env.local');
const envText = fs.readFileSync(envPath, 'utf-8');
const env = {};
for (const line of envText.split('\n')) {
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const val = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
  env[key] = val;
}

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEAD_DOMAINS = ['gmbr.pro', 'manhwaland.land', 'uwakjawa.xyz', 'gmbar.xyz'];

function isDeadCdn(url) {
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return DEAD_DOMAINS.some(d => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  console.log('━'.repeat(60));
  console.log('🔧 BACKFILL NON-R2 CHAPTER IMAGES');
  console.log('━'.repeat(60));

  // 1. Find all chapter_images with external URLs
  console.log('⏳ Fetching chapter_images with external URLs...');
  const externalImages = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('chapter_images')
      .select('id, chapter_id, image_url, number')
      .like('image_url', 'https%')
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    
    for (const img of data) {
      if (isDeadCdn(img.image_url)) {
        externalImages.push(img);
      }
    }
    
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`📊 Dead CDN images found: ${externalImages.length}`);

  // 2. Delete dead CDN images (lazy-load will re-download from source)
  // Group by chapter_id to avoid deleting ALL images for a chapter at once
  const byChapter = new Map();
  for (const img of externalImages) {
    if (!byChapter.has(img.chapter_id)) byChapter.set(img.chapter_id, []);
    byChapter.get(img.chapter_id).push(img);
  }
  console.log(`📊 Affected chapters: ${byChapter.size}`);

  let deleted = 0;
  for (const [chapterId, imgs] of byChapter) {
    // Check how many total images this chapter has
    const { count: totalCount } = await sb
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .eq('chapter_id', chapterId);
    
    // If ALL images for this chapter are dead CDN, delete them all
    // Lazy-load will re-download on next visit
    if (totalCount === imgs.length) {
      if (!dryRun) {
        const { error } = await sb
          .from('chapter_images')
          .delete()
          .in('id', imgs.map(i => i.id));
        
        if (error) {
          console.error(`  ❌ Delete failed for chapter ${chapterId}:`, error.message);
        } else {
          deleted += imgs.length;
        }
      } else {
        deleted += imgs.length;
      }
    } else {
      // Only some images are dead — just delete those
      if (!dryRun) {
        const { error } = await sb
          .from('chapter_images')
          .delete()
          .in('id', imgs.map(i => i.id));
        
        if (error) {
          console.error(`  ❌ Delete failed for chapter ${chapterId}:`, error.message);
        } else {
          deleted += imgs.length;
        }
      } else {
        deleted += imgs.length;
      }
    }
  }

  console.log('');
  console.log(`✅ Dead CDN images ${dryRun ? 'would be ' : ''}deleted: ${deleted}`);
  console.log(`ℹ️  These chapters will lazy-load fresh images on next visit`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});