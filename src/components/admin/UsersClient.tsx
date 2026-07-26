'use client';

import { useState, useMemo } from 'react';
import { Search, X, Users, Trash2 } from 'lucide-react';
import { ChangeRoleButton } from '@/components/admin/ChangeRoleButton';
import { SelectInput } from '@/components/ui/SelectInput';
import { Pagination } from '@/components/ui/admin-table';

const PAGE_SIZE = 25;

interface UserRow {
  id: string;
  email: string;
  username: string | null;
  role: 'USER' | 'ADMIN';
  avatar_url: string | null;
  created_at: string;
  vip_expires_at?: string | null;
  trial_claimed_at?: string | null;
}

export function UsersClient({ users: initial, meId }: { users: UserRow[]; meId: string | undefined }) {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [vipFilter, setVipFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const now = new Date();

  function getVipStatus(u: UserRow): { label: string; color: string; bg: string } {
    if (u.vip_expires_at && new Date(u.vip_expires_at) > now) {
      // Trial user?
      if (u.trial_claimed_at) {
        const claimed = new Date(u.trial_claimed_at);
        const expires = new Date(u.vip_expires_at);
        const diffDays = Math.round((expires.getTime() - claimed.getTime()) / 86400000);
        if (diffDays <= 31) {
          return { label: 'TRIAL', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
        }
      }
      return { label: 'VIP', color: '#10B981', bg: 'rgba(16,185,129,0.12)' };
    }
    if (u.trial_claimed_at) return { label: 'EXPIRED', color: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
    return { label: 'FREE', color: '#6B7280', bg: 'rgba(107,114,128,0.08)' };
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return users.filter(u => {
      const matchSearch = !q || (u.username ?? '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchRole = roleFilter === 'ALL' || u.role === roleFilter;
      const s = getVipStatus(u).label;
      const matchVip = vipFilter === 'ALL' || s === vipFilter;
      return matchSearch && matchRole && matchVip;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, search, roleFilter, vipFilter]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function confirmDelete() {
    if (!deleteId) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/v1/admin/users/${deleteId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to delete user');
      setUsers(prev => prev.filter(u => u.id !== deleteId));
      setDeleteId(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Users size={16} style={{ color: 'var(--color-primary)' }} />
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Users</h1>
          <span className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}>
            {filtered.length}{search || roleFilter !== 'ALL' || vipFilter !== 'ALL' ? ` / ${users.length}` : ''}
          </span>
          {totalPages > 1 && (
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              · Hal {currentPage}/{totalPages}
            </span>
          )}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-tertiary)' }} />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Cari username atau email…"
            className="w-full rounded-lg pl-8 pr-8 py-2 text-sm outline-none"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }} />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
              <X size={13} style={{ color: 'var(--text-tertiary)' }} />
            </button>
          )}
        </div>
        <SelectInput value={roleFilter} onChange={e => { setRoleFilter(e.target.value); setPage(1); }} className="max-w-[130px]">
          <option value="ALL">Semua Role</option>
          <option value="USER">User</option>
          <option value="ADMIN">Admin</option>
        </SelectInput>
        <SelectInput value={vipFilter} onChange={e => { setVipFilter(e.target.value); setPage(1); }} className="max-w-[130px]">
          <option value="ALL">Semua Status</option>
          <option value="VIP">VIP</option>
          <option value="TRIAL">Trial</option>
          <option value="EXPIRED">Expired</option>
          <option value="FREE">Free</option>
        </SelectInput>
      </div>

      <div className="rounded-xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="grid border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider"
          style={{ borderColor: 'var(--border-light)', color: 'var(--text-tertiary)', gridTemplateColumns: '1fr 70px 80px 90px 60px' }}>
          <span>User</span>
          <span className="hidden sm:block">Role</span>
          <span className="hidden sm:block">VIP</span>
          <span className="hidden sm:block">Joined</span>
          <span className="text-right">Action</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12">
            <span className="text-4xl opacity-20">👤</span>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              {users.length === 0 ? 'No users yet' : 'No results found'}
            </p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {paged.map(u => {
              const vs = getVipStatus(u);
              return (
                <div key={u.id} className="grid items-center px-4 py-2.5"
                  style={{ gridTemplateColumns: '1fr 70px 80px 90px 60px' }}>
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
                  <span className="hidden sm:inline-flex w-fit items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
                    style={{ background: vs.bg, color: vs.color }}>
                    {vs.label}
                  </span>
                  <span className="hidden text-xs sm:block" style={{ color: 'var(--text-tertiary)' }}>
                    {new Date(u.created_at).toLocaleDateString('id-ID')}
                  </span>
                  <div className="flex justify-end gap-1">
                    <ChangeRoleButton userId={u.id} currentRole={u.role} isSelf={u.id === meId} />
                    {u.id !== meId && (
                      <button
                        onClick={() => { setDeleteId(u.id); setDeleteError(null); }}
                        className="rounded-md p-1.5 transition-colors hover:bg-red-500/10"
                        title="Hapus user"
                        style={{ color: '#EF4444' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={currentPage}
          totalPages={totalPages}
          onPageChange={setPage}
          total={filtered.length}
          pageSize={PAGE_SIZE}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => !deleting && setDeleteId(null)}>
          <div
            className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
            style={{ background: 'var(--bg-secondary)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-full bg-red-500/10">
                <Trash2 size={20} style={{ color: '#EF4444' }} />
              </div>
              <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>Hapus User?</h3>
            </div>
            <p className="mb-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
              Tindakan ini bersifat permanen. Semua data pengguna (bookmark, riwayat baca, komentar) akan dihapus dan tidak bisa dikembalikan.
            </p>
            {deleteError && (
              <p className="mb-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs" style={{ color: '#EF4444' }}>
                {deleteError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 rounded-lg py-2 text-sm font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
              >
                Batal
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 rounded-lg py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: '#EF4444' }}
              >
                {deleting ? 'Menghapus…' : 'Hapus'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}