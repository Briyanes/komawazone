'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck } from 'lucide-react';

export function DismissReportButton({ id, onDismiss }: { id: string; onDismiss?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);

  const dismiss = () => {
    start(async () => {
      await fetch(`/api/v1/admin/reports/${id}`, { method: 'DELETE' });
      setDone(true);
      if (onDismiss) onDismiss(); else router.refresh();
    });
  };

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
