'use client';

import { useState, useTransition, useEffect, useCallback } from 'react';
import { Crown, Search, Plus, X, Ticket, Copy, Check, Gift, Users as UsersIcon, Clock } from 'lucide-react';
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

interface Voucher {
  id: string;
  code: string;
  plan: string;
  created_at: string;
  used_at: string | null;
  used_by: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  users?: any;
}

interface TrialClaim {
  id: string;
  user_id: string;
  source: string;
  ip_address: string | null;
  user_agent: string | null;
  claimed_at: string;
  expires_at: string;
  users?: { email?: string; username?: string | null; avatar_url?: string | null }[];
}

interface TrialStats {
  total_users: number;
  claimed: number;
  active: number;
  eligible: number;
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

  // Voucher + Trial state
  const [activeTab, setActiveTab] = useState<'subs' | 'vouchers' | 'trials'>('subs');
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherFilter, setVoucherFilter] = useState<'all' | 'unused' | 'used'>('all');
  const [showGenPanel, setShowGenPanel] = useState(false);
  const [genPlan, setGenPlan] = useState<'1-month' | '3-month' | '6-month'>('1-month');
  const [genCount, setGenCount] = useState(10);
  const [genResult, setGenResult] = useState<Voucher[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  // Trial state
  const [trialClaims, setTrialClaims] = useState<TrialClaim[]>([]);
  const [trialStats, setTrialStats] = useState<TrialStats | null>(null);

  const loadVouchers = useCallback(async () => {
    try {
      const filterParam = voucherFilter !== 'all' ? `?filter=${voucherFilter}` : '';
      const res = await fetch(`/api/v1/admin/vouchers${filterParam}`);
      const data = await res.json() as { status: string; data: Voucher[] };
      if (data.status === 'success') setVouchers(data.data);
    } catch { /* network error */ }
  }, [voucherFilter]);

  const loadTrials = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/trials');
      const data = await res.json() as { status: string; data: { stats: TrialStats; claims: TrialClaim[] } };
      if (data.status === 'success') {
        setTrialStats(data.data.stats);
        setTrialClaims(data.data.claims);
      }
    } catch { /* network error */ }
  }, []);

  useEffect(() => {
    if (activeTab === 'vouchers') loadVouchers();
    if (activeTab === 'trials') loadTrials();
  }, [activeTab, loadVouchers, loadTrials]);

  const handleGenerate = () => {
    setError('');
    startTransition(async () => {
      const res = await fetch('/api/v1/admin/vouchers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: genPlan, count: genCount }),
      });
      const data = await res.json() as { status: string; data: Voucher[]; error?: string };
      if (data.status === 'success') {
        setGenResult(data.data);
        setShowGenPanel(false);
        await loadVouchers();
      } else {
        setError(data.error ?? 'Gagal generate kode');
      }
    });
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCopyAllUnused = () => {
    const unused = vouchers.filter(v => !v.used_by).map(v => v.code).join('\n');
    navigator.clipboard.writeText(unused);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

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

  const unusedCount = vouchers.filter(v => !v.used_by).length;

  return (
    <div className="w-full max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Subscriptions & Vouchers
        </h1>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background: 'var(--bg-secondary)' }}>
        <button
          onClick={() => setActiveTab('subs')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'subs' ? 'text-white' : ''
          )}
          style={activeTab === 'subs' ? { background: 'var(--color-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <Crown size={14} className="inline mr-1" /> Subscriptions
        </button>
        <button
          onClick={() => setActiveTab('vouchers')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'vouchers' ? 'text-white' : ''
          )}
          style={activeTab === 'vouchers' ? { background: 'var(--color-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <Ticket size={14} className="inline mr-1" /> Vouchers
          {unusedCount > 0 && activeTab !== 'vouchers' && (
            <span className="ml-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] text-white">{unusedCount}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('trials')}
          className={cn(
            'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
            activeTab === 'trials' ? 'text-white' : ''
          )}
          style={activeTab === 'trials' ? { background: 'var(--color-primary)' } : { color: 'var(--text-secondary)' }}
        >
          <Gift size={14} className="inline mr-1" /> Free Trials
        </button>
      </div>

      {/* ════════════════ VOUCHER TAB ════════════════ */}
      {activeTab === 'vouchers' && (
        <div className="space-y-4">
          {/* Generate result modal */}
          {genResult && (
            <div className="rounded-2xl border p-5 space-y-3" style={{ background: 'rgba(16,185,129,0.06)', borderColor: 'rgba(16,185,129,0.3)' }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Check size={16} className="text-emerald-500" />
                  <h2 className="text-sm font-semibold text-emerald-500">
                    {genResult.length} kode berhasil dibuat!
                  </h2>
                </div>
                <button
                  onClick={() => setGenResult(null)}
                  className="size-6 flex items-center justify-center rounded"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {genResult.map(v => (
                  <div key={v.code} className="flex items-center justify-between rounded-lg px-3 py-2 font-mono text-sm"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>
                    {v.code}
                    <button onClick={() => handleCopyCode(v.code)} className="hover:opacity-70">
                      {copiedCode === v.code ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    </button>
                  </div>
                ))}
              </div>
              <Button size="sm" onClick={() => { navigator.clipboard.writeText(genResult.map(v => v.code).join('\n')); setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2000); }}>
                {copiedAll ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy All Codes</>}
              </Button>
            </div>
          )}

          {/* Generate panel */}
          {showGenPanel ? (
            <div className="rounded-2xl border p-5 space-y-4" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Generate Voucher Codes</h2>
                <button onClick={() => setShowGenPanel(false)} className="size-6 flex items-center justify-center rounded" style={{ color: 'var(--text-tertiary)' }}>
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Paket</label>
                  <SelectInput value={genPlan} onChange={e => setGenPlan(e.target.value as typeof genPlan)} className="w-full">
                    <option value="1-month">1 Bulan (Rp 15.000)</option>
                    <option value="3-month">3 Bulan (Rp 40.000)</option>
                    <option value="6-month">6 Bulan (Rp 75.000)</option>
                  </SelectInput>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>Jumlah</label>
                  <input
                    type="number" min={1} max={100} value={genCount}
                    onChange={e => setGenCount(Math.min(100, Math.max(1, Number(e.target.value))))}
                    className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
                    style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>
              <Button onClick={handleGenerate} isLoading={isPending}>
                <Ticket size={14} /> Generate {genCount} Kode
              </Button>
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowGenPanel(true)}>
                <Plus size={14} /> Generate Voucher
              </Button>
              {unusedCount > 0 && (
                <Button size="sm" variant="secondary" onClick={handleCopyAllUnused}>
                  {copiedAll ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy All Unused ({unusedCount})</>}
                </Button>
              )}
            </div>
          )}

          {/* Filter buttons */}
          <div className="flex gap-1 text-xs">
            {(['all', 'unused', 'used'] as const).map(f => (
              <button
                key={f}
                onClick={() => setVoucherFilter(f)}
                className={cn('rounded-lg px-3 py-1.5 font-medium', voucherFilter === f ? 'text-white' : '')}
                style={voucherFilter === f
                  ? { background: 'var(--color-primary)' }
                  : { background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
              >
                {f === 'all' ? 'Semua' : f === 'unused' ? 'Belum Dipakai' : 'Sudah Dipakai'}
              </button>
            ))}
          </div>

          {/* Voucher list */}
          <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
            {vouchers.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Belum ada voucher. Klik &ldquo;Generate Voucher&rdquo; untuk membuat.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {vouchers.map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {v.code}
                        </span>
                        <span
                          className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                          style={{
                            background: v.used_by ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
                            color: v.used_by ? '#ef4444' : '#10b981',
                          }}
                        >
                          {v.used_by ? 'USED' : 'AVAILABLE'}
                        </span>
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {v.plan} · dibuat {new Date(v.created_at).toLocaleDateString('id-ID')}
                        {v.used_by && v.users?.[0]?.email && ` · dipakai oleh ${v.users[0].email}`}
                      </p>
                    </div>
                    {!v.used_by && (
                      <button
                        onClick={() => handleCopyCode(v.code)}
                        className="text-xs px-2.5 py-1 rounded-lg border"
                        style={{ color: 'var(--text-secondary)', borderColor: 'var(--border-light)' }}
                      >
                        {copiedCode === v.code ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ TRIALS TAB ════════════════ */}
      {activeTab === 'trials' && (
        <div className="space-y-4">
          {/* Trial stats cards */}
          {trialStats && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <UsersIcon size={16} style={{ color: '#10B981' }} />
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {trialStats.total_users}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Total Users</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg" style={{ background: 'rgba(245,158,11,0.1)' }}>
                  <Gift size={16} style={{ color: '#F59E0B' }} />
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {trialStats.claimed}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Trial Claimed</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <Check size={16} style={{ color: '#10B981' }} />
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {trialStats.active}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Active Now</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: 'var(--bg-secondary)' }}>
                <div className="mb-2 flex size-8 items-center justify-center rounded-lg" style={{ background: 'rgba(139,92,246,0.1)' }}>
                  <Clock size={16} style={{ color: '#8B5CF6' }} />
                </div>
                <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                  {trialStats.eligible}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Eligible (Belum Claim)</p>
              </div>
            </div>
          )}

          {/* Conversion rate callout */}
          {trialStats && trialStats.total_users > 0 && (
            <div className="rounded-xl p-4 border" style={{ background: 'rgba(245,158,11,0.05)', borderColor: 'rgba(245,158,11,0.2)' }}>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                <span className="font-bold" style={{ color: '#F59E0B' }}>Conversion Rate:</span>{' '}
                {((trialStats.claimed / trialStats.total_users) * 100).toFixed(1)}% pengguna telah klaim trial gratis.
                {trialStats.claimed > 0 && trialStats.active > 0 && (
                  <> Dari yang klaim, {((trialStats.active / trialStats.claimed) * 100).toFixed(1)}% masih aktif.</>
                )}
              </p>
            </div>
          )}

          {/* Trial claims list */}
          <div className="rounded-2xl overflow-hidden border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}>
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border-light)' }}>
              <Gift size={14} style={{ color: 'var(--text-tertiary)' }} />
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
                100 Trial Claim Terbaru
              </span>
            </div>

            {trialClaims.length === 0 ? (
              <div className="py-10 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Belum ada yang klaim free trial.
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {trialClaims.map((claim: TrialClaim) => {
                  const user = claim.users?.[0];
                  const isActive = new Date(claim.expires_at) > new Date();
                  return (
                    <div key={claim.id} className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                            {user?.email ?? 'Unknown'}
                          </span>
                          {user?.username && (
                            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              @{user.username}
                            </span>
                          )}
                          <span
                            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                            style={{
                              background: isActive ? 'rgba(16,185,129,0.1)' : 'rgba(107,114,128,0.1)',
                              color: isActive ? '#10b981' : '#6b7280',
                            }}
                          >
                            {isActive ? 'ACTIVE' : 'EXPIRED'}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                          Claimed {new Date(claim.claimed_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          {' · '}expires {new Date(claim.expires_at).toLocaleDateString('id-ID')}
                          {claim.ip_address && ` · IP ${claim.ip_address}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════ SUBSCRIPTIONS TAB ════════════════ */}
      {activeTab === 'subs' && (
        <>
          <div className="flex justify-end">
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
        </>
      )}
    </div>
  );
}