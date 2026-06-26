#!/usr/bin/env node
/**
 * Fix ALL chapter thumbnails → 5th image FROM LAST (via Supabase REST RPC)
 *
 * Tries to call the RPC function via REST API. If function doesn't exist,
 * deploys it first via the SQL endpoint.
 */

import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

console.log('🔧 Fix ALL Chapter Thumbnails → 5th Image FROM LAST (REST RPC)');
console.log('='.repeat(60));
console.log(`🔗 URL: ${SUPABASE_URL}`);
console.log('');

async function tryCallRpc() {
  console.log('📋 Attempting to call RPC function...');
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/admin_fix_thumbnails_5th_from_last`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
    body: JSON.stringify({}),
  });

  if (resp.ok) {
    const result = await resp.json();
    return result;
  }

  const text = await resp.text();
  return { error: true, status: resp.status, body: text };
}

async function deployAndRun() {
  // Try calling first
  let result = await tryCallRpc();

  if (!result.error) {
    return result;
  }

  // If function doesn't exist (404 or PGRST202), deploy it
  if (result.status === 404 || result.body?.includes('Could not find the function')) {
    console.log('  ⚠️  RPC function not found. Deploying via SQL endpoint...\n');

    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const sql = readFileSync(
      resolve('supabase/migrations/039_fix_thumbnails_5th_from_last.sql'),
      'utf8'
    );

    // Use pg_query if available via REST, or use Supabase SQL API
    const deployResp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query_text: sql }),
    });

    if (!deployResp.ok) {
      console.log('  ⚠️  pg_query not available. Trying direct function deploy...\n');
      // Can't deploy via REST. Return error with guidance.
      return {
        error: true,
        message:
          'Cannot deploy RPC via REST. Need to run SQL migration manually in Supabase Dashboard.',
      };
    }

    console.log('  ✅ RPC deployed. Now executing...\n');
    result = await tryCallRpc();
  }

  return result;
}

async function main() {
  try {
    const result = await deployAndRun();

    if (result.error) {
      console.error('\n❌ Failed:', result.message || result.body || JSON.stringify(result));
      process.exit(1);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ DONE!');
    console.log('='.repeat(60));
    console.log(`Total chapters:      ${result.total_chapters?.toLocaleString()}`);
    console.log(`Updated (5th):       ${result.updated_5th?.toLocaleString()}`);
    console.log(`Updated (fallback):  ${result.updated_fallback?.toLocaleString()}`);
    console.log(`Total updated:       ${result.total_updated?.toLocaleString()}`);
    console.log(`Already correct:     ${result.already_correct?.toLocaleString()}`);
    console.log(`Skipped (no images): ${result.skipped_no_images?.toLocaleString()}`);
    console.log('\n💡 ISR cache (10 min) will auto-refresh on next visit.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();