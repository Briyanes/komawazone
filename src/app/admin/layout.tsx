import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Use service client to bypass RLS for reading user profile
  const serviceClient = createServiceClient();
  const { data: profile } = await serviceClient
    .from('users')
    .select('role, username, avatar_url, email')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'ADMIN') redirect('/');

  return <AdminShell profile={profile}>{children}</AdminShell>;
}
