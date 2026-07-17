import { readFileSync } from 'fs';

// Parse env
const envFile = readFileSync('.env.local', 'utf-8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const pg = (await import('pg')).default;
const client = new pg.Client({
  host: 'aws-0-ap-northeast-1.pooler.supabase.com',
  port: 5432,
  user: 'postgres.qxevzzxjpdoryupeborm',
  password: 'kSsJ78&3e@hpqHT',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  console.log('✅ Connected to Supabase DB');

  const sql = readFileSync('supabase/migrations/050_fix_users_table_rls.sql', 'utf-8');
  await client.query(sql);
  console.log('✅ Migration 050 applied successfully');

  const result = await client.query(
    `SELECT policyname, cmd FROM pg_policies 
     WHERE tablename = 'users' AND schemaname = 'public' 
     ORDER BY policyname`
  );

  console.log('\n=== USERS TABLE POLICIES AFTER MIGRATION ===');
  for (const row of result.rows) {
    console.log(`  ${row.cmd.padEnd(6)} → ${row.policyname}`);
  }
  console.log(`\nTotal: ${result.rows.length} policies`);

} catch (err) {
  console.error('❌ Error:', err.message);
  process.exit(1);
} finally {
  await client.end();
}