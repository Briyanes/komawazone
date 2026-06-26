#!/usr/bin/env node
/**
 * Run the admin_fix_thumbnails_5th_from_last() RPC to fix ALL chapter
 * thumbnails to use the 5th image FROM LAST (or first if <5 images).
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const headers = {
  'apikey': supabaseKey,
  'Authorization': `Bearer ${supabaseKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

console.log('🔄 Running RPC admin_fix_thumbnails_5th_from_last()...\n');

const res = await fetch(
  `${supabaseUrl}/rest/v1/rpc/admin_fix_thumbnails_5th_from_last`,
  {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  }
);

const text = await res.text();

if (!res.ok) {
  console.error(`❌ RPC failed (HTTP ${res.status}):`);
  console.error(text);
  process.exit(1);
}

let result;
try {
  result = JSON.parse(text);
} catch {
  console.error('❌ Could not parse RPC response:');
  console.error(text);
  process.exit(1);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ RPC COMPLETED — admin_fix_thumbnails_5th_from_last()');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`  Total chapters       : ${result.total_chapters}`);
console.log(`  Updated (5th)       : ${result.updated_5th}`);
console.log(`  Updated (fallback)  : ${result.updated_fallback}`);
console.log(`  Already correct     : ${result.already_correct}`);
console.log(`  Skipped (no images) : ${result.skipped_no_images}`);
console.log(`  ───────────────────`);
console.log(`  TOTAL UPDATED       : ${result.total_updated}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');