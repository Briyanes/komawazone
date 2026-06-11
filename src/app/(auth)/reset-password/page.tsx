'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, Eye, EyeOff, Check, Loader2 } from 'lucide-react';
import { resetPassword } from '@/lib/auth/actions';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Kata sandi minimal 6 karakter');
      return;
    }
    if (password !== confirmPassword) {
      setError('Kata sandi tidak cocok');
      return;
    }

    setLoading(true);
    const result = await resetPassword(password);

    if (result.error) {
      setError(result.error);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
        <div
          className="mx-auto flex size-12 items-center justify-center rounded-full"
          style={{ background: 'rgba(34,197,94,0.1)' }}
        >
          <Check size={24} className="text-emerald-500" />
        </div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Kata Sandi Berhasil Diubah!
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Kata sandi kamu sudah diperbarui. Silakan login dengan kata sandi baru.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: 'var(--color-primary)' }}
        >
          Login Sekarang
        </Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-bold text-center" style={{ color: 'var(--text-primary)' }}>
        Reset Kata Sandi
      </h1>
      <p className="text-sm text-center mt-2" style={{ color: 'var(--text-secondary)' }}>
        Masukkan kata sandi baru untuk akun kamu.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Kata Sandi Baru
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimal 6 karakter"
              minLength={6}
              className="w-full rounded-xl py-2.5 pl-10 pr-10 text-sm"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-light)' }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-tertiary)' }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Konfirmasi Kata Sandi
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Ulangi kata sandi"
              minLength={6}
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
          disabled={loading || !password || !confirmPassword}
          className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ background: 'var(--color-primary)' }}
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
          Ubah Kata Sandi
        </button>
      </form>
    </>
  );
}