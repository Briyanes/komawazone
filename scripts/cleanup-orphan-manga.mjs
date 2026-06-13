#!/usr/bin/env node
/**
 * Cleanup — Soft-delete manga yang:
 * 1. Tidak punya chapter sama sekali (orphan/hantu)
 * 2. Tidak punya cover (cover_url = NULL)
 *
 * Usage:
 *   node --env-file=.env.local scripts/cleanup-orphan-manga.mjs
 */

import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  const now = new Date().toISOString();

  // ── 1. GET ALL ACTIVE MANGA IDS ────────────────────────────────
  console.log('📋 Fetching all active manga...');
  let allManga = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await sb.from('manga')
      .select('id, title, slug, cover_url, source_url')
      .is('deleted_at', null)
      .range(offset, offset + 999);
    if (error) { console.error('Error:', error.message); break; }
    if (!data || data.length === 0) break;
    allManga = allManga.concat(data);
    if (data.length < 1000) break;
  }
  console.log(`   Total active manga: ${allManga.length}`);

  // ── 2. FIND MANGA WITH CHAPTERS ────────────────────────────────
  console.log('📖 Checking which manga have chapters...');
  const mangaIds = allManga.map(m => m.id);
  const mangaWithChapterIds = new Set();
  for (let i = 0; i < mangaIds.length; i += 200) {
    const chunk = mangaIds.slice(i, i + 200);
    const { data } = await sb.from('chapters')
      .select('manga_id')
      .in('manga_id', chunk)
      .is('deleted_at', null);
    (data ?? []).forEach(c => mangaWithChapterIds.add(c.manga_id));
  }
  console.log(`   Manga with chapters: ${mangaWithChapterIds.size}`);

  // ── 3. IDENTIFY ORPHANS (no chapters) ──────────────────────────
  const orphanManga = allManga.filter(m => !mangaWithChapterIds.has(m.id));
  console.log(`   Manga WITHOUT chapters (orphans): ${orphanManga.length}`);

  // ── 4. IDENTIFY NO-COVER MANGA ─────────────────────────────────
  const noCoverManga = allManga.filter(m => !m.cover_url);
  console.log(`   Manga WITHOUT cover: ${noCoverManga.length}`);

  // ── 5. COMBINE: manga yang orphan ATAU tanpa cover ─────────────
  const toDeleteIds = new Set([
    ...orphanManga.map(m => m.id),
    ...noCoverManga.map(m => m.id),
  ]);
  console.log(`\n🗑️  Total unique manga to soft-delete: ${toDeleteIds.size}`);

  // ── 6. SOFT-DELETE IN BATCHES ──────────────────────────────────
  const idsArray = Array.from(toDeleteIds);
  let deleted = 0;
  for (let i = 0; i < idsArray.length; i += 200) {
    const chunk = idsArray.slice(i, i + 200);
    const { error } = await sb.from('manga')
      .update({ deleted_at: now })
      .in('id', chunk);
    if (error) {
      console.error(`   Error deleting batch ${i}:`, error.message);
    } else {
      deleted += chunk.length;
      process.stdout.write(`\r   Deleted: ${deleted}/${idsArray.length}`);
    }
  }
  console.log('\n');

  // ── 7. FINAL COUNT ─────────────────────────────────────────────
  const { count: remaining } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .is('deleted_at', null);
  const { count: totalDeleted } = await sb.from('manga')
    .select('*', { count: 'exact', head: true })
    .not('deleted_at', 'is', null);

  console.log('═══════════════════════════════════════════════');
  console.log('  CLEANUP COMPLETE');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Soft-deleted this run:  ${deleted}`);
  console.log(`  Total soft-deleted:     ${totalDeleted ?? 0}`);
  console.log(`  Active manga remaining: ${remaining ?? 0}`);
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});