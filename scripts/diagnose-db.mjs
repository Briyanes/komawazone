#!/usr/bin/env node
/**
 * DIAGNOSE DATABASE — Find why API returns empty & admin login fails
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

async function diagnose() {
  console.log('🔬 ========================================');
  console.log('🔬 MANGA ZONE — DEEP DIAGNOSIS');
  console.log('🔬 ========================================\n');

  // 1. Check users and roles
  console.log('👤 === USERS & ROLES ===');
  const { data: users } = await adminClient.from('users').select('id, email, username, role').limit(20);
  if (users && users.length > 0) {
    users.forEach(u => {
      const isAdmin = u.role === 'ADMIN';
      console.log(`  ${isAdmin ? '👑' : '👤'} ${u.email} (${u.username}) → role: ${u.role}`);
    });
    const adminCount = users.filter(u => u.role === 'ADMIN').length;
    console.log(`\n  Total: ${users.length} users, ${adminCount} admin(s)`);
  } else {
    console.log('  ❌ No users found');
  }

  // 2. Check manga via SERVICE ROLE (bypass RLS)
  console.log('\n📚 === MANGA (Service Role) ===');
  const { data: mangaAdmin, count: mangaAdminCount } = await adminClient
    .from('manga').select('id, slug, title, deleted_at', { count: 'exact' }).limit(3);
  console.log(`  Total manga (bypass RLS): ${mangaAdminCount}`);
  if (mangaAdmin) {
    console.log(`  Sample: ${mangaAdmin.map(m => `${m.title} (deleted=${m.deleted_at ? 'Y' : 'N'})`).join(', ')}`);
  }

  // 3. Check manga via ANON key (what API uses)
  console.log('\n🌐 === MANGA (Anon Key - simulating API) ===');
  const { data: mangaAnon, count: mangaAnonCount, error: mangaAnonErr } = await anonClient
    .from('manga').select('id, slug, title', { count: 'exact' }).limit(3);
  
  if (mangaAnonErr) {
    console.log(`  ❌ ERROR: ${mangaAnonErr.message}`);
    console.log(`  → This confirms RLS is blocking public access!`);
  } else {
    console.log(`  Total manga (anon): ${mangaAnonCount}`);
    if (mangaAnon && mangaAnon.length > 0) {
      console.log(`  Sample: ${mangaAnon.map(m => m.title).join(', ')}`);
    } else {
      console.log(`  ⚠️ EMPTY! RLS policy is filtering everything.`);
    }
  }

  // 4. Check manga with deleted_at filter
  console.log('\n🗑️ === SOFT-DELETED CHECK ===');
  const { count: deletedCount } = await adminClient
    .from('manga').select('*', { count: 'exact', head: true }).not('deleted_at', 'is', null);
  console.log(`  Soft-deleted manga: ${deletedCount}`);
  
  const { count: activeCount } = await adminClient
    .from('manga').select('*', { count: 'exact', head: true }).is('deleted_at', null);
  console.log(`  Active manga: ${activeCount}`);

  // 5. Check content_rating filter
  console.log('\n🔞 === CONTENT RATING CHECK ===');
  try {
    const { data: ratings } = await adminClient.from('manga').select('content_rating').limit(100);
    if (ratings) {
      const ratingCounts = {};
      ratings.forEach(r => {
        const val = r.content_rating || 'NULL';
        ratingCounts[val] = (ratingCounts[val] || 0) + 1;
      });
      console.log(`  Content ratings: ${JSON.stringify(ratingCounts)}`);
    }
  } catch (e) {
    console.log(`  content_rating column may not exist: ${e.message}`);
  }

  // 6. Test the actual API endpoint
  console.log('\n🔗 === API ENDPOINT TEST ===');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/manga?select=id&limit=3`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    console.log(`  Direct REST API status: ${res.status}`);
    const data = await res.text();
    console.log(`  Response: ${data.substring(0, 200)}`);
  } catch (e) {
    console.log(`  API error: ${e.message}`);
  }

  console.log('\n📋 === SUMMARY & FIX ===');
  if (mangaAdminCount > 0 && (mangaAnonCount === 0 || mangaAnonErr)) {
    console.log('  🔴 ROOT CAUSE: RLS policies are blocking public read access');
    console.log('  → FIX: Run migration 031_public_all_manga_rls.sql again');
  }
  if (users && users.filter(u => u.role === 'ADMIN').length === 0) {
    console.log('  🔴 ROOT CAUSE: No admin user found');
    console.log('  → FIX: Promote existing user to ADMIN role');
  }
}

diagnose().catch(err => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});