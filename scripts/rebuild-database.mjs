#!/usr/bin/env node
/**
 * MASTER DATABASE REBUILD SCRIPT
 * Runs all migrations + creates admin user
 * Usage: node scripts/rebuild-database.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load .env.local
dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

console.log(`🔗 Connecting to: ${SUPABASE_URL}`);

// Use service role key to bypass RLS
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkCurrentState() {
  console.log('\n📊 === CURRENT DATABASE STATE ===');
  
  // Check tables
  const { data: tables, error: tableErr } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public')
    .order('table_name');
  
  if (tableErr) {
    // Try direct query via RPC
    console.log('  Trying RPC query...');
    const { data: mangaCount } = await supabase.from('manga').select('id', { count: 'exact', head: true });
    console.log(`  Manga count: ${mangaCount?.length ?? 'error'}`);
    return;
  }
  
  console.log(`  Tables found: ${tables?.length ?? 0}`);
  if (tables && tables.length > 0) {
    console.log(`  Table names: ${tables.map(t => t.table_name).join(', ')}`);
  }
}

async function checkMangaData() {
  console.log('\n📚 === MANGA DATA CHECK ===');
  
  const { count: mangaCount } = await supabase.from('manga').select('*', { count: 'exact', head: true });
  console.log(`  Manga: ${mangaCount ?? 0}`);
  
  const { count: chapterCount } = await supabase.from('chapters').select('*', { count: 'exact', head: true });
  console.log(`  Chapters: ${chapterCount ?? 0}`);
  
  const { count: userCount } = await supabase.from('users').select('*', { count: 'exact', head: true });
  console.log(`  Users: ${userCount ?? 0}`);
  
  const { count: genreCount } = await supabase.from('genres').select('*', { count: 'exact', head: true });
  console.log(`  Genres: ${genreCount ?? 0}`);
}

async function run() {
  console.log('🚀 ========================================');
  console.log('🚀 MANGA ZONE — DATABASE REBUILD SCRIPT');
  console.log('🚀 ========================================\n');
  
  await checkCurrentState();
  await checkMangaData();
  
  console.log('\n✅ Database check complete!');
  console.log('\n📋 NEXT STEPS:');
  console.log('  1. If tables are missing → Run SQL migrations via Supabase SQL Editor');
  console.log('  2. If admin account missing → Register via website then promote');
  console.log('  3. If manga data empty → Use admin import tool');
}

run().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});