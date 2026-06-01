'use client';

import { useState, useMemo } from 'react';
import { Search, X, Users } from 'lucide-react';
import { ChangeRoleButton } from '@/components/admin/ChangeRoleButton';
import { SelectInput } from '@/components/ui/SelectInput';

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  role: 'USER' | 'ADMIN';
  avatar_url: string | null;
  created_at: string;
}

export function UsersClient({ users: initial, meId }: { users: UserRow[]; meId: string | undefined }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return initial.filter(u => {
      const matchSearch = !q || (u.username ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      return matchSearch && matchRole;
    });
  }, [initial, search, roleFilter]);

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Users</h1>
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}>
            {filtered.length}{search || roleFilter !== 'ALL' ? ` / ${initial.length}` : ''}
          </span>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Cari username atau email…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>
        <SelectInput value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="max-w-[130px]">
          <option value="ALL">Semua Role</option>
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </SelectInput>
      </div>

      <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="grid border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '1fr 80px 120px 80px' }}>
          <span>User</span>
          <span className="hidden sm:block">Role</span>
          <span className="hidden sm:block">Joined</span>
          <span className="text-right">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="text-4xl opacity-20">👤</span>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {initial.length === 0 ? 'No users yet' : 'No results found'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {filtered.map(u => (
              <div key={u.id} className="grid items-center px-4 py-2.5"
                style={{ gridTemplateColumns: '1fr 80px 120px 80px' }}>
                <div className="min-w-0 pr-3">
                  <p className="truncate text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    {u.username ?? <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                  </p>
                  <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>{u.email}</p>
                </div>
                <span className="hidden sm:inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                  style={u.role === 'ADMIN'
                    ? { background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'var(--text-tertiary)' }}>
                  {u.role}
                </span>
                <span className="hidden text-xs sm:block" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(u.created_at).toLocaleDateString('id-ID')}
                </span>
                <div className="flex justify-end">
                  <ChangeRoleButton userId={u.id} currentRole={u.role} isSelf={u.id === meId} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
