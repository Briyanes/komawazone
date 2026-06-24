#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Use .not() correctly — Supabase head count with .not().like() works
const { count: deadCount } = await sb
  .from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .not('image_url', 'like', '/api/r2/image/%');

const { count: totalCount } = await sb
  .from('chapter_images')
  .select('*', { count: 'exact', head: true });

const { count: r2Count } = await sb
  .from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .like('image_url', '/api/r2/image/%');

const pct = totalCount > 0 ? ((r2Count / totalCount) * 100).toFixed(1) : 0;
console.log(`Total: ${totalCount?.toLocaleString()}`);
console.log(`R2:    ${r2Count?.toLocaleString()} (${pct}%)`);
console.log(`Dead:  ${deadCount?.toLocaleString()}`);
process.exit(0);
