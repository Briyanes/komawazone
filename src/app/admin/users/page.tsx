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
  const { data, error } = await supabase
    .from('users')
    .select('id, email, username, role, avatar_url, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-4xl opacity-20">⚠️</span>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Gagal memuat users: {error.message}</p>
      </div>
    );
  }

  const users = (data ?? []) as UserRow[];
  return <UsersClient users={users} meId={me?.id} />;
}
