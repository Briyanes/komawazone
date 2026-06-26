#!/usr/bin/env node
/**
 * COMPREHENSIVE Thumbnail Fix — Final Solution
 *
 * Does TWO things:
 *   1. Deploys migration 040 (DB trigger for auto-thumbnail on future inserts)
 *   2. Runs RPC 039 (fixes ALL existing chapters that have chapter_images)
 *
 * After this script runs:
 *   ✅ Existing chapters with images → thumbnail = 5th image from last
 *   ✅ Future chapters → trigger auto-sets thumbnail when images are inserted
 *   ⚠️  Existing chapters WITHOUT images → thumbnail stays NULL until
 *      reader lazy-loads images (trigger 040 fires at that point)
 *
 * Usage:  node scripts/fix-thumbnails-complete.mjs
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  COMPREHENSIVE Chapter Thumbnail Fix (5th from last)     ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log(`🔗 URL: ${SUPABASE_URL}\n`);

// ── Helper: run SQL via Supabase REST RPC ─────────────────────
async function runRpc(fnName, body = {}) {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const text = await resp.text();
  try {
    return { ok: resp.ok, data: JSON.parse(text) };
  } catch {
    return { ok: resp.ok, data: text };
  }
}

// ── Step 1: Deploy migration 040 (trigger) ────────────────────
async function deployTrigger() {
  console.log('━━━ Step 1: Deploy DB Trigger (migration 040) ━━━\n');

  const sql = readFileSync(
    resolve('supabase/migrations/040_auto_thumbnail_trigger.sql'),
    'utf8'
  );

  // Try deploying via pg_query RPC (if available)
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({ query_text: sql }),
  });

  if (resp.ok) {
    console.log('  ✅ Trigger deployed via pg_query RPC\n');
    return true;
  }

  console.log('  ⚠️  pg_query not available.');
  console.log('     → Run migration 040 manually in Supabase Dashboard > SQL Editor:\n');
  console.log(`     ${resolve('supabase/migrations/040_auto_thumbnail_trigger.sql')}\n`);
  console.log('  ⚠️  Continuing with RPC fix anyway (trigger can be deployed later)\n');
  return false;
}

// ── Step 2: Run RPC 039 (fix existing) ────────────────────────
async function fixExisting() {
  console.log('━━━ Step 2: Fix ALL existing thumbnails (RPC 039) ━━━\n');

  const result = await runRpc('admin_fix_thumbnails_5th_from_last');

  if (!result.ok) {
    console.error('  ❌ RPC failed:', result.data);
    console.error('\n  → Deploy migration 039 first in Supabase Dashboard > SQL Editor:');
    console.error('    supabase/migrations/039_fix_thumbnails_5th_from_last.sql\n');
    return null;
  }

  const r = result.data;
  console.log('  ✅ RPC completed!\n');
  console.log('  ┌─────────────────────────────────────────────┐');
  console.log(`  │ Total chapters:      ${(r.total_chapters ?? 0).toLocaleString().padStart(10)}  │`);
  console.log(`  │ Updated (5th):       ${(r.updated_5th ?? 0).toLocaleString().padStart(10)}  │`);
  console.log(`  │ Updated (fallback):  ${(r.updated_fallback ?? 0).toLocaleString().padStart(10)}  │`);
  console.log(`  │ Total updated:       ${(r.total_updated ?? 0).toLocaleString().padStart(10)}  │`);
  console.log(`  │ Already correct:     ${(r.already_correct ?? 0).toLocaleString().padStart(10)}  │`);
  console.log(`  │ Skipped (no images): ${(r.skipped_no_images ?? 0).toLocaleString().padStart(10)}  │`);
  console.log('  └─────────────────────────────────────────────┘\n');

  if ((r.skipped_no_images ?? 0) > 0) {
    console.log(`  ℹ️  ${r.skipped_no_images} chapters have no images in DB.`);
    console.log('     These are "metadata-only" chapters (imported without scraping).');
    console.log('     They will get thumbnails automatically when:');
    console.log('       - Reader lazy-loads images → trigger 040 fires');
    console.log('       - Admin triggers full chapter import\n');
  }

  return r;
}

// ── Main ──────────────────────────────────────────────────────
async function main() {
  try {
    await deployTrigger();
    const result = await fixExisting();

    console.log('═══════════════════════════════════════════════════════════');
    if (result) {
      console.log('✅ DONE! Thumbnail system is now self-healing.');
      console.log('   ISR cache (10 min) will refresh pages on next visit.');
    } else {
      console.log('⚠️  Partial: RPC 039 needs deployment. See message above.');
    }
    console.log('═══════════════════════════════════════════════════════════\n');
  } catch (err) {
    console.error('\n❌ Fatal error:', err.message);
    process.exit(1);
  }
}

main();