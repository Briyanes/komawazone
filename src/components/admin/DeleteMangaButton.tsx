'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';

interface DeleteMangaButtonProps {
  id: string;
  title: string;
}

export function DeleteMangaButton({ id, title }: DeleteMangaButtonProps) {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/admin/manga/${id}`, { method: 'DELETE' });
      const data = await res.json() as { status: string };
      if (data.status === 'success') {
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  if (showConfirm) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div
          className="rounded-2xl border p-6 shadow-xl w-80 space-y-4"
          style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)' }}
        >
          <div className="space-y-1">
            <h3 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
              Delete Manga
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              Are you sure you want to delete <strong>&quot;{title}&quot;</strong>? This action cannot be undone.
            </p>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={isDeleting}
              className="rounded-lg px-4 py-2 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-secondary)' }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-80 disabled:opacity-60"
              style={{ background: '#EF4444' }}
            >
              <Trash2 size={13} />
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowConfirm(true)}
      className="flex size-7 items-center justify-center rounded-md transition-colors hover:bg-red-500/10"
      style={{ color: 'var(--text-tertiary)' }}
      title="Delete"
    >
      <Trash2 size={13} />
    </button>
  );
}
