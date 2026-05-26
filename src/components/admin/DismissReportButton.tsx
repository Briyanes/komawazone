'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, X } from 'lucide-react';

export function DismissReportButton({ id, onDismiss }: { id: string; onDismiss?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  const dismiss = () => {
    setError(false);
    start(async () => {
      const res = await fetch(`/api/v1/admin/reports/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError(true); return; }
      setDone(true);
      if (onDismiss) onDismiss(); else router.refresh();
    });
  };

  if (error) {
    return (
      <button
        onClick={() => setError(false)}
        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
        style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}
        title="Gagal dismiss — klik untuk tutup"
      >
        <X size={13} /> Gagal
      </button>
    );
  }

  return (
    <button
      onClick={dismiss}
      disabled={pending || done}
      className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
      style={{ background: 'rgba(16,185,129,0.1)', color: '#34d399' }}
      title="Dismiss report"
    >
      <CheckCheck size={13} />
      {done ? 'Done' : pending ? '…' : 'Dismiss'}
    </button>
  );
}
