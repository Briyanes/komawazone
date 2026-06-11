'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, ArrowLeft, Check, Loader2 } from 'lucide-react';
import { forgotPassword } from '@/lib/auth/actions';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await forgotPassword(email);

    if (result.error) {
      setError(result.error);
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  return (
    <>
      <h1 className="text-xl font-bold text-center" style={{ color: 'var(--text-primary)' }}>
        Lupa Kata Sandi
      </h1>
      <p className="text-sm text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
        Masukkan email kamu dan kami akan mengirimkan link untuk mereset kata sandi.
      </p>

      {sent ? (
        <div className="mt-6 space-y-4 text-center">
          <div
            className="mx-auto flex size-12 items-center justify-center rounded-full"
            style={{ background: 'rgba(34,197,94,0.1)' }}
          >
            <Check size={24} className="text-emerald-500" />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
            Email telah dikirim!
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Cek inbox email <strong>{email}</strong> untuk link reset kata sandi.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm font-medium hover:underline"
            style={{ color: 'var(--color-primary)' }}
          >
            <ArrowLeft size={14} /> Kembali ke Login
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Email
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nama@email.com"
                className="w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !email}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Kirim Link Reset
          </button>

          <div className="text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1 text-xs hover:underline"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <ArrowLeft size={12} /> Kembali ke Login
            </Link>
          </div>
        </form>
      )}
    </>
  );
}