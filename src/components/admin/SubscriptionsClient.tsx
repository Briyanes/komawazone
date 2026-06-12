'use client';

import { useState, useTransition } from 'react';
import { Crown, Search, Plus, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { SelectInput } from '@/components/ui/SelectInput';

interface VipUser {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  vip_expires_at: string | null;
}

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  amount: number;
  started_at: string;
  expires_at: string;
  status: string;
  payment_method: string | null;
  notes: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users: any;
}

interface SubscriptionsClientProps {
  initialSubscriptions: Subscription[];
}

export function SubscriptionsClient({ initialSubscriptions }: SubscriptionsClientProps) {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(initialSubscriptions);
  const [showGrant, setShowGrant] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [foundUser, setFoundUser] = useState<VipUser | null>(null);
  const [durationDays, setDurationDays] = useState(30);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [isPending, startTransition] = useTransition();

  async function loadSubscriptions() {
    try {
      const res = await fetch('/api/v1/admin/subscriptions');
      const data = await res.json() as { status: string; data: Subscription[] };
      if (data.status === 'success') setSubscriptions(data.data);
    } catch { /* network error — keep existing list */ }
  }

  const handleSearch = () => {
    if (!searchEmail.trim()) return;
    setError('');
    setFoundUser(null);
    startTransition(async () => {
      const res = await fetch(`/api/v1/admin/subscriptions?find_user=${encodeURIComponent(searchEmail)}`);
      const data = await res.json() as { status: string; data: VipUser | null };
      if (data.status === 'success') {
        setFoundUser(data.data);
        if (!data.data) setError('User tidak ditemukan');
      }
    });
  };

  const handleGrant = () => {
    if (!foundUser) return;
    setError('');
    startTransition(async () => {
      const res = await fetch('/api/v1/admin/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: foundUser.id,
          duration_days: durationDays,
          payment_method: paymentMethod || null,
          notes: notes || null,
        }),
      });
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'success') {
        setShowGrant(false);
        setSearchEmail('');
        setFoundUser(null);
        setNotes('');
        setPaymentMethod('');
        await loadSubscriptions();
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Grant failed');
      }
    });
  };

  const handleRevoke = (subId: string, email: string) => {
    if (!confirm(`Cabut VIP dari ${email}?`)) return;
    startTransition(async () => {
      const res = await fetch(`/api/v1/admin/subscriptions/${subId}/revoke`, { method: 'POST' });
      if (!res.ok) {
        setError('Gagal mencabut VIP. Coba lagi.');
        return;
      }
      await loadSubscriptions();
    });
  };

  const isActive = (sub: Subscription) =>
    sub.status === 'active' && new Date(sub.expires_at) > new Date();

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Subscriptions VIP
        </h1>
        <Button size="sm" onClick={() => setShowGrant(v => !v)}>
          <Plus size={14} /> Grant VIP
        </Button>
      </div>

      {/* Grant VIP panel */}
      {showGrant && (
        <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Grant VIP ke User</h2>
            <button
              onClick={() => { setShowGrant(false); setFoundUser(null); setSearchEmail(''); setError(''); }}
              className="size-6 flex items-center justify-center rounded"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X size={14} />
            </button>
          </div>

          <div className="flex gap-2">
            <input
              value={searchEmail}
              onChange={e => setSearchEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Email user (exact match)…"
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            />
            <Button size="sm" onClick={handleSearch} isLoading={isPending}>
              <Search size={14} />
            </Button>
          </div>

          {foundUser && (
            <>
              <div className="rounded-lg p-3 border" style={{ background: 'var(--bg-tertiary)', borderColor: 'var(--border-light)' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{foundUser.email}</p>
                {foundUser.username && <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>@{foundUser.username}</p>}
                {foundUser.vip_expires_at && new Date(foundUser.vip_expires_at) > new Date() && (
                  <p className="text-xs text-amber-500 mt-1">
                    VIP aktif s/d {new Date(foundUser.vip_expires_at).toLocaleDateString('id-ID')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Durasi</label>
                  <SelectInput
                    value={durationDays}
                    onChange={e => setDurationDays(Number(e.target.value))}
                    className="w-full"
                  >
                    <option value={30}>30 hari (1 bulan)</option>
                    <option value={90}>90 hari (3 bulan)</option>
                    <option value={180}>180 hari (6 bulan)</option>
                    <option value={365}>365 hari (1 tahun)</option>
                  </SelectInput>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Metode Bayar</label>
                  <input
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    placeholder="Transfer, QRIS, dll"
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Catatan (opsional)</label>
                <input
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Bukti TF BCA 15rb tgl 1 Jan"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
              </div>

              <Button onClick={handleGrant} isLoading={isPending}>
                <Crown size={14} /> Grant VIP {durationDays} hari
              </Button>
            </>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}

      {/* Subscription list */}
      <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
        <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-light)' }}>
          <Crown size={14} style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
            {subscriptions.length} subscription{subscriptions.length !== 1 ? 's' : ''}
          </span>
        </div>

        {subscriptions.length === 0 ? (
          <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Belum ada subscriber VIP.
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {subscriptions.map(sub => {
              const active = isActive(sub);
              return (
                <div key={sub.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {sub.users?.[0]?.email ?? 'Unknown'}
                      </span>
                      <span
                        className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-bold')}
                        style={{
                          background: active ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                          color: active ? '#10b981' : '#ef4444',
                        }}
                      >
                        {active ? 'ACTIVE' : sub.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      s/d {new Date(sub.expires_at).toLocaleDateString('id-ID')}
                      {sub.payment_method && ` · ${sub.payment_method}`}
                      {sub.notes && ` · ${sub.notes}`}
                    </p>
                  </div>
                  {active && (
                    <button
                      onClick={() => handleRevoke(sub.id, sub.users?.[0]?.email ?? '')}
                      className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:bg-red-50/10"
                      style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)' }}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}