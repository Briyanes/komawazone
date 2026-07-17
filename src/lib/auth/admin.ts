import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { User } from '@supabase/supabase-js';

/**
 * Centralized admin authentication helper.
 *
 * Uses the SSR client to verify the user session (cookies),
 * then uses the service role client to fetch the role (bypass RLS).
 *
 * @returns The authenticated user object if admin, otherwise null.
 */
export async function assertAdmin(): Promise<User | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') return null;
  return user;
}