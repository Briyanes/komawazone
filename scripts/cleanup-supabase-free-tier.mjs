#!/usr/bin/env node
/**
 * scripts/cleanup-supabase-free-tier.mjs
 *
 * Automated cleanup for Supabase Free Tier.
 * Reduces egress and database size by:
 *   - Deleting orphaned rows
 *   - Normalizing image URLs to short paths
 *   - Removing old notifications/import_jobs
 *   - Running VACUUM ANALYZE (not FULL to avoid locks)
 *
 * Usage:
 *   node scripts/cleanup-supabase-free-tier.mjs              # Dry run
 *   node scripts/cleanup-supabase-free-tier.mjs --execute    # Actually run
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';

const EXECUTE = process.argv.includes('--execute');
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const log = (...args) => console.log(`[${new Date().toISOString()}]`, ...args);

async function getRowCounts() {
  const tables = ['chapter_images', 'chapters', 'manga', 'notifications', 'import_jobs', 'file_assets'];
  const counts = {};

  for (const table of tables) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true });
      if (error) {
        counts[table] = `error: ${error.message}`;
      } else {
        counts[table] = count;
      }
    } catch {
      counts[table] = 'N/A';
    }
  }

  return counts;
}

async function cleanupOrphanedChapterImages() {
  log('─── Cleaning orphaned chapter_images ───');

  // Get chapters with deleted_at
  const { data: deletedChapters } = await supabase
    .from('chapters')
    .select('id')
    .not('deleted_at', 'is', null)
    .limit(5000);

  let total = 0;
  if (deletedChapters && deletedChapters.length > 0) {
    const ids = deletedChapters.map((c) => c.id);

    if (EXECUTE) {
      // Batch delete
      for (let i = 0; i < ids.length; i += 200) {
        const batch = ids.slice(i, i + 200);
        const { error } = await supabase
          .from('chapter_images')
          .delete()
          .in('chapter_id', batch);
        if (error) log('  ⚠️ Error:', error.message);
        else total += batch.length;
      }
    } else {
      const { count } = await supabase
        .from('chapter_images')
        .select('*', { count: 'exact', head: true })
        .in('chapter_id', ids);
      total = count ?? ids.length;
    }
  }

  log(`  ${EXECUTE ? '✅ Deleted' : 'Would delete'}: ${total} orphaned chapter_images`);
  return total;
}

async function normalizeUrls() {
  log('─── Normalizing image URLs ───');

  const tables = [
    { table: 'chapter_images', column: 'image_url' },
    { table: 'chapters', column: 'thumbnail_url' },
    { table: 'manga', column: 'cover_url' },
    { table: 'manga', column: 'banner_url' },
  ];

  const patterns = [
    'https://olluq.xyz/api/r2/image/',
    'https://www.olluq.xyz/api/r2/image/',
  ];

  let totalUpdated = 0;

  for (const { table, column } of tables) {
    for (const pattern of patterns) {
      // Count
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .like(column, `${pattern}%`);

      if (error) continue;

      if (count && count > 0) {
        log(`  ${table}.${column}: ${count} rows with "${pattern}"`);

        if (EXECUTE) {
          // Fetch and update in batches
          for (let i = 0; i < count; i += 500) {
            const { data } = await supabase
              .from(table)
              .select(`id, ${column}`)
              .like(column, `${pattern}%`)
              .range(i, i + 499);

            if (!data) continue;

            for (const row of data) {
              const oldUrl = row[column];
              const newUrl = oldUrl.replace(pattern, '/api/r2/image/');
              if (oldUrl !== newUrl) {
                await supabase
                  .from(table)
                  .update({ [column]: newUrl })
                  .eq('id', row.id);
                totalUpdated++;
              }
            }
          }
        }
      }
    }
  }

  log(`  ${EXECUTE ? '✅ Normalized' : 'Would normalize'}: ${totalUpdated} URLs`);
  return totalUpdated;
}

async function cleanupOldNotifications() {
  log('─── Cleaning old notifications ───');

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

  if (EXECUTE) {
    // Read notifications >7 days
    const { data: d1 } = await supabase
      .from('notifications')
      .delete()
      .not('read_at', 'is', null)
      .lt('read_at', sevenDaysAgo)
      .select('id');

    // Unread >30 days
    const { data: d2 } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', thirtyDaysAgo)
      .select('id');

    log(`  ✅ Deleted: ${(d1?.length ?? 0) + (d2?.length ?? 0)} notifications`);
    return (d1?.length ?? 0) + (d2?.length ?? 0);
  } else {
    const { count: c1 } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .not('read_at', 'is', null)
      .lt('read_at', sevenDaysAgo);

    const { count: c2 } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .lt('created_at', thirtyDaysAgo);

    log(`  Would delete: ${(c1 ?? 0) + (c2 ?? 0)} notifications`);
    return (c1 ?? 0) + (c2 ?? 0);
  }
}

async function cleanupOldImportJobs() {
  log('─── Cleaning old import_jobs ───');

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  if (EXECUTE) {
    const { data } = await supabase
      .from('import_jobs')
      .delete()
      .in('status', ['completed', 'failed', 'cancelled'])
      .lt('created_at', fourteenDaysAgo)
      .select('id');

    log(`  ✅ Deleted: ${data?.length ?? 0} import_jobs`);
    return data?.length ?? 0;
  } else {
    const { count } = await supabase
      .from('import_jobs')
      .select('*', { count: 'exact', head: true })
      .in('status', ['completed', 'failed', 'cancelled'])
      .lt('created_at', fourteenDaysAgo);

    log(`  Would delete: ${count ?? 0} import_jobs`);
    return count ?? 0;
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║  Supabase Free Tier Cleanup  ${EXECUTE ? '(EXECUTE)' : '(DRY RUN)'}${' '.repeat(13 - (EXECUTE ? 8 : 8))}║`);
  console.log('╚══════════════════════════════════════════════════════╝\n');

  log('📊 BEFORE — Row counts:');
  const before = await getRowCounts();
  for (const [k, v] of Object.entries(before)) log(`   ${k}: ${v}`);

  console.log();

  const orphaned = await cleanupOrphanedChapterImages();
  const normalized = await normalizeUrls();
  const notifs = await cleanupOldNotifications();
  const jobs = await cleanupOldImportJobs();

  console.log('\n' + '─'.repeat(56));
  log('📊 SUMMARY:');
  log(`   Orphaned images:   ${orphaned}`);
  log(`   Normalized URLs:   ${normalized}`);
  log(`   Old notifications: ${notifs}`);
  log(`   Old import_jobs:   ${jobs}`);

  if (!EXECUTE) {
    console.log('\n⚠️  DRY RUN — no changes made.');
    console.log('   Run with --execute to apply: node scripts/cleanup-supabase-free-tier.mjs --execute\n');
  } else {
    console.log('\n✅ Cleanup complete!');
    console.log('   💡 For maximum space reclaim, run in Supabase SQL Editor:');
    console.log('      VACUUM FULL ANALYZE chapter_images;\n');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});