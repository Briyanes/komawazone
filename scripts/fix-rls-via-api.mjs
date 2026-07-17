#!/usr/bin/env node
/**
 * Fix RLS Policies via Supabase service role + pg/query endpoint
 * This bypasses pooler connection issues entirely
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function checkBefore() {
  console.log('\n📊 === BEFORE FIX: Testing anon access ===');
  
  const { count: mangaBefore, error: mangaErr } = await anonClient
    .from('manga').select('id', { count: 'exact', head: true });
  console.log(`  Manga (anon): ${mangaBefore ?? 'ERROR'} ${mangaErr ? '— ' + mangaErr.message : ''}`);
  
  const { count: chBefore, error: chErr } = await anonClient
    .from('chapters').select('id', { count: 'exact', head: true });
  console.log(`  Chapters (anon): ${chBefore ?? 'ERROR'} ${chErr ? '— ' + chErr.message : ''}`);
  
  const { count: genBefore, error: genErr } = await anonClient
    .from('genres').select('id', { count: 'exact', head: true });
  console.log(`  Genres (anon): ${genBefore ?? 'ERROR'} ${genErr ? '— ' + genErr.message : ''}`);
  
  return { manga: mangaBefore, chapters: chBefore, genres: genBefore };
}

async function tryPgQuery() {
  console.log('\n🔧 === Attempting /pg/query endpoint ===');
  
  // Try the Supabase /pg/query endpoint (available in newer versions)
  const queries = [
    `ALTER TABLE IF EXISTS public.manga ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE IF EXISTS public.chapters ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE IF EXISTS public.chapter_images ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE IF EXISTS public.genres ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE IF EXISTS public.manga_genres ENABLE ROW LEVEL SECURITY;`,
    // Drop old policies
    `DROP POLICY IF EXISTS "Public can read all manga" ON public.manga;`,
    `DROP POLICY IF EXISTS "Users can read manga based on VIP status" ON public.manga;`,
    `DROP POLICY IF EXISTS "Public manga read" ON public.manga;`,
    `DROP POLICY IF EXISTS "Anyone can read manga" ON public.manga;`,
    `DROP POLICY IF EXISTS "Public can read all chapters" ON public.chapters;`,
    `DROP POLICY IF EXISTS "Users can read chapters based on manga VIP status" ON public.chapters;`,
    `DROP POLICY IF EXISTS "Public chapters read" ON public.chapters;`,
    `DROP POLICY IF EXISTS "Public can read chapter_images" ON public.chapter_images;`,
    `DROP POLICY IF EXISTS "Public can read genres" ON public.genres;`,
    `DROP POLICY IF EXISTS "Public can read manga_genres" ON public.manga_genres;`,
    // Create permissive policies
    `CREATE POLICY "Public can read all manga" ON public.manga FOR SELECT USING (deleted_at IS NULL);`,
    `CREATE POLICY "Public can read all chapters" ON public.chapters FOR SELECT USING (deleted_at IS NULL);`,
    `CREATE POLICY "Public can read chapter_images" ON public.chapter_images FOR SELECT USING (true);`,
    `CREATE POLICY "Public can read genres" ON public.genres FOR SELECT USING (true);`,
    `CREATE POLICY "Public can read manga_genres" ON public.manga_genres FOR SELECT USING (true);`,
  ];

  // Combine all into one query
  const fullQuery = queries.join('\n');
  
  try {
    const res = await fetch(`${SUPABASE_URL}/pg/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: fullQuery })
    });
    
    if (res.ok) {
      console.log('  ✅ /pg/query endpoint worked! RLS fixed!');
      return true;
    } else {
      const text = await res.text();
      console.log(`  ❌ /pg/query failed: ${res.status} - ${text.substring(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ /pg/query error: ${e.message}`);
    return false;
  }
}

async function tryRPC() {
  console.log('\n🔧 === Attempting RPC exec_sql ===');
  
  // Check if exec_sql function exists
  const checkQuery = `
    ALTER TABLE IF EXISTS public.manga ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chapters ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.chapter_images ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.genres ENABLE ROW LEVEL SECURITY;
    ALTER TABLE IF EXISTS public.manga_genres ENABLE ROW LEVEL SECURITY;
  `;
  
  try {
    // Try calling exec_sql if it exists
    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql_text: checkQuery })
    });
    
    if (res.ok) {
      console.log('  ✅ exec_sql RPC worked!');
      return true;
    } else {
      const text = await res.text();
      console.log(`  ❌ exec_sql failed: ${res.status} - ${text.substring(0, 150)}`);
      return false;
    }
  } catch (e) {
    console.log(`  ❌ exec_sql error: ${e.message}`);
    return false;
  }
}

async function checkAfter() {
  console.log('\n📊 === AFTER FIX: Testing anon access ===');
  
  const { count: mangaAfter } = await anonClient
    .from('manga').select('id', { count: 'exact', head: true });
  console.log(`  Manga (anon): ${mangaAfter}`);
  
  const { count: chAfter } = await anonClient
    .from('chapters').select('id', { count: 'exact', head: true });
  console.log(`  Chapters (anon): ${chAfter}`);
  
  const { count: genAfter } = await anonClient
    .from('genres').select('id', { count: 'exact', head: true });
  console.log(`  Genres (anon): ${genAfter}`);
  
  return { manga: mangaAfter, chapters: chAfter, genres: genAfter };
}

async function checkAdminData() {
  console.log('\n👤 === DATABASE STATUS (Service Role) ===');
  
  const { count: mangaCount } = await adminClient
    .from('manga').select('id', { count: 'exact', head: true });
  console.log(`  Total manga in DB: ${mangaCount}`);
  
  const { count: chCount } = await adminClient
    .from('chapters').select('id', { count: 'exact', head: true });
  console.log(`  Total chapters in DB: ${chCount}`);
  
  const { data: admins } = await adminClient
    .from('users').select('email, username, role').eq('role', 'ADMIN');
  if (admins && admins.length > 0) {
    console.log(`  Admin accounts: ${admins.length}`);
    admins.forEach(a => console.log(`    👑 ${a.email} (${a.username})`));
  }
}

async function run() {
  console.log('🚀 ========================================');
  console.log('🚀 MANGA ZONE — RLS FIX via API');
  console.log('🚀 ========================================');

  await checkAdminData();
  const before = await checkBefore();
  
  // Try different methods to fix RLS
  let fixed = false;
  
  if (!fixed) fixed = await tryPgQuery();
  if (!fixed) fixed = await tryRPC();
  
  if (!fixed) {
    console.log('\n⚠️ ========================================');
    console.log('⚠️ Cannot fix RLS via API automatically!');
    console.log('⚠️ ========================================');
    console.log('\n📋 MANUAL FIX REQUIRED:');
    console.log('  1. Open Supabase Dashboard:');
    console.log('     → https://supabase.com/dashboard/project/qxevzzxjpdoryupeborm/sql/new');
    console.log('  2. Paste this SQL and click RUN:');
    console.log('\n  ──────── BEGIN SQL ────────');
    const sql = `
ALTER TABLE IF EXISTS public.manga ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chapter_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.manga_genres ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read all manga" ON public.manga;
DROP POLICY IF EXISTS "Users can read manga based on VIP status" ON public.manga;
DROP POLICY IF EXISTS "Public manga read" ON public.manga;
DROP POLICY IF EXISTS "Anyone can read manga" ON public.manga;
DROP POLICY IF EXISTS "Public can read all chapters" ON public.chapters;
DROP POLICY IF EXISTS "Users can read chapters based on manga VIP status" ON public.chapters;
DROP POLICY IF EXISTS "Public chapters read" ON public.chapters;
DROP POLICY IF EXISTS "Public can read chapter_images" ON public.chapter_images;
DROP POLICY IF EXISTS "Public can read genres" ON public.genres;
DROP POLICY IF EXISTS "Public can read manga_genres" ON public.manga_genres;

CREATE POLICY "Public can read all manga" ON public.manga FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Public can read all chapters" ON public.chapters FOR SELECT USING (deleted_at IS NULL);
CREATE POLICY "Public can read chapter_images" ON public.chapter_images FOR SELECT USING (true);
CREATE POLICY "Public can read genres" ON public.genres FOR SELECT USING (true);
CREATE POLICY "Public can read manga_genres" ON public.manga_genres FOR SELECT USING (true);
    `.trim();
    console.log(sql);
    console.log('  ──────── END SQL ────────\n');
    console.log('  3. After running SQL, verify by visiting: https://olluq.com');
    return;
  }
  
  const after = await checkAfter();
  
  console.log('\n🎉 ========================================');
  console.log('🎉 RLS FIX COMPLETE!');
  console.log('🎉 ========================================');
  console.log(`\n  Before: manga=${before.manga}, chapters=${before.chapters}, genres=${before.genres}`);
  console.log(`  After:  manga=${after.manga}, chapters=${after.chapters}, genres=${after.genres}`);
  
  if (after.manga > 0) {
    console.log('\n✅ Website should now display content!');
    console.log('   Visit: https://olluq.com');
  } else {
    console.log('\n⚠️ Still no manga visible. May need additional debugging.');
  }
}

run().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});