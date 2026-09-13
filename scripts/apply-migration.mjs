#!/usr/bin/env node
/**
 * Generic SQL migration runner — reads a .sql file and executes via pg.
 * Usage: node scripts/apply-migration.mjs <path/to/file.sql>
 */
import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const { Client } = pg;

const sqlFile = process.argv[2];
if (!sqlFile) {
  console.error('Usage: node scripts/apply-migration.mjs <path/to/file.sql>');
  process.exit(1);
}

// Parse DATABASE_URL manually because password contains '@' (breaks URL parsing)
const rawUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!rawUrl) {
  console.error('❌ DATABASE_URL or DIRECT_URL not found in .env.local');
  process.exit(1);
}

// Extract parts manually: postgresql://user:password@host:port/db
const m = rawUrl.match(/^postgresql:\/\/([^:]+):(.+)@([^:]+):(\d+)\/(.+)$/);
if (!m) {
  console.error('❌ Cannot parse DATABASE_URL. Format unexpected.');
  console.error('   Make sure DIRECT_URL is set (non-pooler, port 5432)');
  process.exit(1);
}
const [, user, password, host, port, database] = m;

console.log(`   Host: ${host}:${port}`);
console.log(`   User: ${user}`);
console.log(`   DB:   ${database}\n`);

const pgClient = new Client({
  host,
  port: parseInt(port),
  database,
  user,
  password,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
});

const sql = readFileSync(sqlFile, 'utf8');

console.log(`📋 Applying migration: ${sqlFile}`);
console.log(`   SQL size: ${sql.length} bytes\n`);

try {
  await pgClient.connect();
  console.log('✅ Connected to Supabase DB\n');

  await pgClient.query(sql);
  console.log('✅ Migration applied successfully!\n');

  // Verify trigger status (if applicable to this migration)
  const check = await pgClient.query(`
    SELECT tgname, tgenabled
    FROM pg_trigger
    WHERE tgname = 'trg_auto_set_chapter_thumbnail';
  `);
  console.log('🔍 Trigger status:', check.rows);

  await pgClient.end();
} catch (err) {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
}