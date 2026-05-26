'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function DeleteCommentButton({ id, onDelete }: { id: string; onDelete?: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState(false);

  const del = () => {
    setError(false);
    start(async () => {
      const res = await fetch(`/api/v1/admin/comments/${id}`, { method: 'DELETE' });
      if (!res.ok) { setError(true); setConfirm(false); return; }
      setConfirm(false);
      if (onDelete) onDelete(); else router.refresh();
    });
  };

  if (error) {
    return (
      <button
        onClick={() => setError(false)}
        className="flex size-7 shrink-0 items-center justify-center rounded-md"
        style={{ color: '#EF4444' }}
        title="Gagal menghapus — klik untuk tutup"
      >
        <Trash2 size={13} />
      </button>
    );
  }

  if (confirm) {
    return (
      <div className="flex gap-1">
        <button
          onClick={() => setConfirm(false)}
          className="rounded-lg px-2.5 py-1.5 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Cancel
        </button>
        <button
          onClick={del}
          disabled={pending}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
          style={{ background: '#EF4444' }}
        >
          <Trash2 size={11} /> {pending ? '…' : 'Delete'}
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
      style={{ color: 'var(--text-tertiary)' }}
      title="Delete comment"
    >
      <Trash2 size={13} />
    </button>
  );
}
