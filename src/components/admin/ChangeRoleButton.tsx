'use client';

import { useTransition } from 'react';
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

  if (isSelf) {
    return (
      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>—</span>
    );
  }

  const nextRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';

  const toggle = () => {
    if (!confirm(`Change role to ${nextRole}?`)) return;
    start(async () => {
      await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      router.refresh();
    });
  };

  return (
    <button
      onClick={toggle}
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
