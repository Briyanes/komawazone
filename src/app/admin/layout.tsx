import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminShell } from '@/components/admin/AdminShell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, username, avatar_url, email')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'ADMIN') redirect('/');

  return <AdminShell profile={profile}>{children}</AdminShell>;
}
