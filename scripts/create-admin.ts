#!/usr/bin/env tsx
/**
 * Create Admin Account - One Script Setup
 * Run: npx tsx scripts/create-admin.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

async function createAdmin() {
  const email = 'admin@olluq.com';
  const password = 'AdminOLLUQ123!';

  console.log('🔧 Creating admin account...\n');

  // 1. Get existing user or create new
  console.log('1. Checking auth user...');
  const { data: { users } } = await supabase.auth.admin.listUsers();
  let adminUser = users.find(u => u.email === email);

  if (!adminUser) {
    console.log('   Creating new auth user...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: 'admin' },
    });

    if (authError) {
      console.error('❌ Auth error:', authError.message);
      process.exit(1);
    }
    adminUser = authData.user;
    console.log('✅ Auth user created');
  } else {
    console.log('✅ Auth user exists');
    console.log('2. Resetting password to ensure it works...');
    const { error: updateError } = await supabase.auth.admin.updateUserById(adminUser.id, {
      password,
      email_confirm: true,
    });
    if (updateError) {
      console.error('❌ Password reset error:', updateError.message);
      process.exit(1);
    }
    console.log('✅ Password reset successful');
  }

  console.log(`   User ID: ${adminUser.id}`);

  // 3. Create/update in public.users
  console.log('2. Setting admin role...');
  const { error: dbError } = await supabase
    .from('users')
    .upsert({
      id: adminUser.id,
      email,
      username: 'admin',
      role: 'ADMIN',
      vip_expires_at: '2099-12-31 23:59:59+00',
    }, { onConflict: 'id' });

  if (dbError) {
    console.error('❌ DB error:', dbError.message);
    process.exit(1);
  }
  console.log('✅ Admin role set');

  // 4. Verify
  const { data: verify } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  console.log('\n✅ ADMIN CREATED SUCCESSFULLY!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Email:    ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Role:     ${verify?.role}`);
  console.log(`VIP:      Lifetime (2099)`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('👉 Login: http://localhost:3000/login');
  console.log('👉 Admin: http://localhost:3000/admin\n');
}

createAdmin().catch(console.error);
