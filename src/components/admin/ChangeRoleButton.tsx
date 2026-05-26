'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, UserRound } from 'lucide-react';

interface Props {
  userId: string;
  currentRole: 'USER' | 'ADMIN';
  isSelf: boolean;
}

export function ChangeRoleButton({ userId, currentRole, isSelf }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);

  if (isSelf) {
    return <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>;
  }

  const nextRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';

  const toggle = () => {
    setError(false);
    start(async () => {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      setConfirm(false);
      if (!res.ok) { setError(true); return; }
      router.refresh();
    });
  };

  if (error) {
    return (
      <button onClick={() => setError(false)} className="text-xs px-1.5 py-1 rounded"
        style={{ color: '#f87171' }} title="Gagal — klik untuk tutup">
        Gagal
      </button>
    );
  }

  if (confirm) {
    return (
      <div className="flex gap-1">
        <button onClick={() => setConfirm(false)}
          className="rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-tertiary)' }}>
          Batal
        </button>
        <button onClick={toggle} disabled={pending}
          className="rounded px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: nextRole === 'ADMIN' ? 'rgba(255,107,53,0.8)' : 'rgba(156,163,175,0.3)' }}>
          {pending ? '…' : nextRole}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      disabled={pending}
      title={`Make ${nextRole}`}
      className="flex size-7 items-center justify-center rounded-md transition-colors disabled:opacity-50"
      style={{
        color: currentRole === 'ADMIN' ? '#f97316' : 'var(--text-tertiary)',
        background: currentRole === 'ADMIN' ? 'rgba(255,107,53,0.1)' : 'transparent',
      }}
    >
      {currentRole === 'ADMIN' ? <UserRound size={13} /> : <ShieldCheck size={13} />}
    </button>
  );
}
