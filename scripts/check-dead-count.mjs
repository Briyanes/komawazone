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

const { count } = await sb
  .from('chapter_images')
  .select('*', { count: 'exact', head: true })
  .not('image_url', 'like', '/api/r2/image/%');

// Output ONLY the number, nothing else
process.stdout.write(String(count || 0));
process.exit(0);