'use client';

import { useState, useRef, useEffect } from 'react';
import { Flag, X, Send, CheckCircle } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

const REASONS = [
  { value: 'wrong_info',      label: 'Info salah (judul, genre, dll)' },
  { value: 'broken_images',   label: 'Gambar rusak / tidak muncul' },
  { value: 'duplicate',       label: 'Duplikat manga lain' },
  { value: 'inappropriate',   label: 'Konten tidak pantas' },
  { value: 'other',           label: 'Lainnya' },
] as const;

type Reason = typeof REASONS[number]['value'];

export function ReportMangaButton({ mangaSlug }: { mangaSlug: string }) {
  const { isAuthenticated } = useAuth();
  const [open, setOpen]         = useState(false);
  const [reason, setReason]     = useState<Reason | ''>('');
  const [notes, setNotes]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]       = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const submit = async () => {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`/api/v1/manga/${mangaSlug}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, notes: notes.trim() || undefined }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) { setError(json.error ?? 'Gagal mengirim laporan'); return; }
      setSubmitted(true);
      setTimeout(() => { setOpen(false); setSubmitted(false); setReason(''); setNotes(''); }, 2000);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
        style={{ color: 'var(--text-tertiary)', background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}
        title="Laporkan manga ini"
      >
        <Flag size={12} />
        <span className="hidden sm:inline">Laporkan</span>
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div className="fixed inset-0 z-40 sm:hidden bg-black/50" onClick={() => setOpen(false)} />

          <div
            ref={panelRef}
            className={cn(
              'z-50 rounded-2xl p-4 shadow-2xl',
              'fixed bottom-0 inset-x-0 sm:absolute sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-72 sm:inset-x-auto',
              'rounded-b-none sm:rounded-2xl'
            )}
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-medium)' }}
          >
            {/* Drag handle mobile */}
            <div className="flex justify-center -mt-1 mb-3 sm:hidden">
              <div className="h-1 w-10 rounded-full" style={{ background: 'var(--border-medium)' }} />
            </div>

            {submitted ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle size={32} style={{ color: '#22c55e' }} />
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Laporan terkirim!</p>
                <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>Tim kami akan meninjau laporan ini.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Flag size={14} style={{ color: '#ef4444' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Laporkan Manga</span>
                  </div>
                  <button onClick={() => setOpen(false)} className="rounded-lg p-1 hover:opacity-70" style={{ color: 'var(--text-tertiary)' }}>
                    <X size={15} />
                  </button>
                </div>

                {!isAuthenticated ? (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    Kamu harus <a href="/login" className="font-semibold" style={{ color: 'var(--color-primary)' }}>login</a> untuk melaporkan.
                  </p>
                ) : (
                  <>
                    <p className="mb-2 text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Alasan laporan:</p>
                    <div className="space-y-1.5 mb-3">
                      {REASONS.map(r => (
                        <button
                          key={r.value}
                          onClick={() => setReason(r.value)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs text-left transition-colors"
                          style={{
                            background: reason === r.value ? 'rgba(239,68,68,0.1)' : 'var(--bg-tertiary)',
                            border: `1px solid ${reason === r.value ? 'rgba(239,68,68,0.4)' : 'var(--border-light)'}`,
                            color: reason === r.value ? '#ef4444' : 'var(--text-primary)',
                            fontWeight: reason === r.value ? 600 : 400,
                          }}
                        >
                          <span
                            className="flex size-3.5 shrink-0 items-center justify-center rounded-full border"
                            style={{ borderColor: reason === r.value ? '#ef4444' : 'var(--border-medium)', background: reason === r.value ? '#ef4444' : 'transparent' }}
                          >
                            {reason === r.value && <span className="size-1.5 rounded-full bg-white" />}
                          </span>
                          {r.label}
                        </button>
                      ))}
                    </div>

                    {reason === 'other' && (
                      <textarea
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        placeholder="Jelaskan masalahnya..."
                        rows={2}
                        maxLength={500}
                        className="mb-3 w-full resize-none rounded-xl px-3 py-2 text-xs outline-none"
                        style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
                      />
                    )}

                    {error && <p className="mb-2 text-xs" style={{ color: '#ef4444' }}>{error}</p>}

                    <button
                      onClick={submit}
                      disabled={!reason || submitting}
                      className={cn(
                        'flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-bold text-white transition-opacity',
                        (!reason || submitting) ? 'opacity-40 cursor-not-allowed' : 'hover:opacity-90'
                      )}
                      style={{ background: '#ef4444' }}
                    >
                      <Send size={12} />
                      {submitting ? 'Mengirim...' : 'Kirim Laporan'}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
