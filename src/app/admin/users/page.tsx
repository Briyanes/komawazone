import { createClient } from '@/lib/supabase/server';
import { UsersClient } from '@/components/admin/UsersClient';

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  role: 'USER' | 'ADMIN';
  avatar_url: string | null;
  created_at: string;
}

export default async function AdminUsersPage() {
  const supabase = await createClient();
  const { data: { user: me } } = await supabase.auth.getUser();
  const { data } = await supabase
    .from('users')
    .select('id, email, username, role, avatar_url, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  const users = (data ?? []) as UserRow[];
  return <UsersClient users={users} meId={me?.id} />;
}
