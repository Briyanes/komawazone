import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Load .env.local
const envFile = readFileSync(join(root, '.env.local'), 'utf8');
const env = {};
for (const line of envFile.split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
}

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY');
  process.exit(1);
}

// Use Supabase management API to run raw SQL via pg_net or direct fetch
// Actually, let's use the REST API with pgmacro approach or just use supabase client

// Simplest approach: use fetch with the SQL endpoint
const sql = `
-- Trigger: update manga.updated_at when chapter inserted
CREATE OR REPLACE FUNCTION update_manga_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE manga SET updated_at = NOW() WHERE id = NEW.manga_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_chapter_insert ON chapters;
CREATE TRIGGER on_chapter_insert
  AFTER INSERT ON chapters
  FOR EACH ROW
  EXECUTE FUNCTION update_manga_timestamp();

-- Backfill: set manga.updated_at to latest chapter's created_at
UPDATE manga m
SET updated_at = COALESCE(
  (SELECT MAX(c.created_at) FROM chapters c WHERE c.manga_id = m.id),
  m.updated_at
)
WHERE m.deleted_at IS NULL;
`;

// Run via Supabase SQL endpoint (management API)
// The Supabase client doesn't support raw SQL, so we use the REST SQL endpoint
const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
}).catch(() => null);

if (response && response.ok) {
  const data = await response.json();
  console.log('✅ Migration executed successfully:', data);
} else {
  // Fallback: try the pg_net approach
  console.log('REST rpc not available, trying alternative...');
  
  // Use Supabase co-cl API
  const resp2 = await fetch(`${supabaseUrl}/pg/query`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }).catch(() => null);

  if (resp2) {
    console.log('pg/query response:', resp2.status, await resp2.text());
  } else {
    console.log('⚠️  Could not run SQL via API. Please run manually in Supabase Dashboard SQL Editor:');
    console.log('---');
    console.log(sql);
    console.log('---');
  }
}