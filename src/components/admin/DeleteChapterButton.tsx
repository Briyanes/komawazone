'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

export function DeleteChapterButton({ id, number }: { id: string; number: number }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    const res = await fetch(`/api/v1/admin/chapters/${id}`, { method: 'DELETE' });
    const json = await res.json() as { status: string };
    setDeleting(false);
    if (json.status === 'success') {
      setConfirm(false);
      router.refresh();
    }
  };

  if (confirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div
          className="rounded-2xl border p-6 shadow-xl w-80 space-y-4"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
        >
          <div className="space-y-1">
            <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Delete Chapter {number}?</h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              All images will be removed. This cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setConfirm(false)}
              disabled={deleting}
              className="rounded-lg px-4 py-2 text-sm hover:bg-[var(--bg-tertiary)] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: '#EF4444' }}
            >
              <Trash2 size={13} />
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
      style={{ color: 'var(--text-tertiary)' }}
      title="Delete chapter"
    >
      <Trash2 size={13} />
    </button>
  );
}
