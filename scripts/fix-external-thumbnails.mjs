#!/usr/bin/env node
/**
 * Fix chapters with external (dead CDN) thumbnail_url.
 * 
 * Strategy:
 *   1. Find all chapters with thumbnail_url pointing to dead CDN (gmbr.pro, uwakjawa.xyz, etc.)
 *   2. For each, check if chapter_images already exist on R2 — if so, use the 5th image as thumbnail
 *   3. If no R2 images yet, set thumbnail to NULL (will fallback to cover image in UI)
 *   4. Also fix chapters with NULL thumbnail that DO have R2 images
 * 
 * Usage:
 *   node scripts/fix-external-thumbnails.mjs              # fix all
 *   node scripts/fix-external-thumbnails.mjs --limit 100  # first 100
 *   node scripts/fix-external-thumbnails.mjs --dry-run    # preview only
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// ── Load .env.local ──────────────────────────────────────────────
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

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing env vars');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
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
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1], 10) : 0;

  console.log('━'.repeat(60));
  console.log('🔧 FIX EXTERNAL & NULL THUMBNAILS');
  console.log('━'.repeat(60));

  // 1. Find all chapters with external thumbnail
  console.log('⏳ Fetching chapters with external thumbnails...');
  const externalChapters = [];
  let offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('id, number, thumbnail_url, manga_id')
      .like('thumbnail_url', 'https%')
      .is('deleted_at', null)
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    
    for (const ch of data) {
      if (isDeadCdn(ch.thumbnail_url)) {
        externalChapters.push(ch);
      }
    }
    
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`📊 Chapters with dead CDN thumbnail: ${externalChapters.length}`);

  // 2. Process each — try to get 5th image from chapter_images
  let fixed = 0;
  let nulled = 0;
  const processList = limit > 0 ? externalChapters.slice(0, limit) : externalChapters;

  for (let i = 0; i < processList.length; i++) {
    const ch = processList[i];
    
    // Check if chapter_images has R2 URLs
    const { data: imgs } = await sb
      .from('chapter_images')
      .select('image_url, number')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(0, 10);
    
    // Find first non-dead image (preferably 5th)
    const goodImgs = (imgs || []).filter(img => !isDeadCdn(img.image_url));
    
    if (goodImgs.length > 0) {
      // Use 5th image (index 4) or last available
      const thumbImg = goodImgs.length >= 5 ? goodImgs[4] : goodImgs[goodImgs.length - 1];
      
      if (!dryRun) {
        await sb.from('chapters').update({ thumbnail_url: thumbImg.image_url }).eq('id', ch.id);
      }
      fixed++;
    } else {
      // No good images — set to NULL (UI will fallback to cover)
      if (!dryRun) {
        await sb.from('chapters').update({ thumbnail_url: null }).eq('id', ch.id);
      }
      nulled++;
    }
    
    if ((i + 1) % 100 === 0) {
      console.log(`  📈 [${i + 1}/${processList.length}] Fixed: ${fixed}, Nulled: ${nulled}`);
    }
  }

  console.log('');
  console.log(`✅ External thumbs fixed (to R2): ${fixed}`);
  console.log(`⬜ External thumbs nulled (no images): ${nulled}`);

  // 3. Now fix NULL thumbnails that DO have R2 images
  console.log('');
  console.log('⏳ Checking NULL thumbnails with R2 images...');
  const nullChapters = [];
  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from('chapters')
      .select('id, number, thumbnail_url, manga_id')
      .is('thumbnail_url', null)
      .is('deleted_at', null)
      .range(offset, offset + 999);
    
    if (error) { console.error(error.message); break; }
    if (!data || data.length === 0) break;
    nullChapters.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }
  console.log(`📊 Chapters with NULL thumbnail: ${nullChapters.length}`);

  let nullFixed = 0;
  const nullList = limit > 0 ? nullChapters.slice(0, limit) : nullChapters;
  
  for (let i = 0; i < nullList.length; i++) {
    const ch = nullList[i];
    
    const { data: imgs } = await sb
      .from('chapter_images')
      .select('image_url, number')
      .eq('chapter_id', ch.id)
      .order('number', { ascending: true })
      .range(0, 10);
    
    const goodImgs = (imgs || []).filter(img => !isDeadCdn(img.image_url));
    
    if (goodImgs.length > 0) {
      const thumbImg = goodImgs.length >= 5 ? goodImgs[4] : goodImgs[goodImgs.length - 1];
      
      if (!dryRun) {
        await sb.from('chapters').update({ thumbnail_url: thumbImg.image_url }).eq('id', ch.id);
      }
      nullFixed++;
    }
    
    if ((i + 1) % 200 === 0) {
      console.log(`  📈 [${i + 1}/${nullList.length}] Fixed from NULL: ${nullFixed}`);
    }
  }

  console.log('');
  console.log(`✅ NULL thumbs fixed (to R2): ${nullFixed}`);
  console.log('━'.repeat(60));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});