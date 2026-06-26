#!/usr/bin/env node
/**
 * Fix ALL chapter thumbnails → 5th image FROM LAST (via pg direct connection)
 *
 * Uses node pg with manual URL parsing (password has special chars).
 */

import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve } from 'path';

dotenv.config({ path: '.env.local' });

const RAW_DB_URL = process.env.DATABASE_URL;

if (!RAW_DB_URL) {
  console.error('❌ DATABASE_URL not set in .env.local');
  process.exit(1);
}

// Manual parse: password may contain @ and & which break URL parsing
// Format: postgresql://USER:PASSWORD@HOST:PORT/DATABASE?params
function parseDbUrl(url) {
  const withoutScheme = url.replace(/^postgresql?:\/\//, '');
  // Split at LAST @ because password may contain @
  const lastAt = withoutScheme.lastIndexOf('@');
  const creds = withoutScheme.substring(0, lastAt);
  const hostPart = withoutScheme.substring(lastAt + 1);

  // creds = USER:PASSWORD (split at FIRST colon)
  const firstColon = creds.indexOf(':');
  const user = creds.substring(0, firstColon);
  const password = creds.substring(firstColon + 1);

  // hostPart = HOST:PORT/DB?params
  const dbSlash = hostPart.indexOf('/');
  const hostPort = dbSlash >= 0 ? hostPart.substring(0, dbSlash) : hostPart;
  const dbPart = dbSlash >= 0 ? hostPart.substring(dbSlash + 1) : 'postgres';
  const database = dbPart.split('?')[0];

  const [host, port] = hostPort.split(':');

  return { user, password, host, port: parseInt(port) || 5432, database };
}

const config = parseDbUrl(RAW_DB_URL);

console.log('🔧 Fix ALL Chapter Thumbnails → 5th Image FROM LAST (PG)');
console.log('='.repeat(60));
console.log(`🔗 Host: ${config.host}:${config.port}`);
console.log(`👤 User: ${config.user}`);
console.log(`🗄️  DB:   ${config.database}`);
console.log('');

async function main() {
  const { default: pg } = await import('pg');
  const { Client } = pg;

  const client = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: { rejectUnauthorized: false },
    query_timeout: 300000, // 5 min
    connectionTimeoutMillis: 30000,
  });

  console.log('📋 Connecting to database...');
  await client.connect();
  console.log('  ✅ Connected\n');

  // Step 1: Deploy RPC function
  console.log('📋 Step 1: Deploying RPC function...');
  const migrationPath = resolve('supabase/migrations/039_fix_thumbnails_5th_from_last.sql');
  const sql = readFileSync(migrationPath, 'utf8');

  await client.query(sql);
  console.log('  ✅ RPC function deployed\n');

  // Step 2: Execute
  console.log('📋 Step 2: Executing fix...');
  console.log('  ⏳ Running server-side update (this takes ~10-30s)...');

  const { rows } = await client.query('SELECT admin_fix_thumbnails_5th_from_last();');
  const result = rows[0].admin_fix_thumbnails_5th_from_last;

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

  await client.end();
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});