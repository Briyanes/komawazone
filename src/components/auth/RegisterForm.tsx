'use client';

import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import Link from 'next/link';
import { Eye, EyeOff, UserPlus, MailOpen } from 'lucide-react';
import { registerSchema, type RegisterInput } from '@/lib/validations/auth';
import { signUp } from '@/lib/auth/actions';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export function RegisterForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterInput>({ resolver: zodResolver(registerSchema) });

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const onSubmit = ({ confirmPassword: _confirmPassword, ...data }: RegisterInput) => {
    setServerError(null);
    startTransition(async () => {
      const result = await signUp(data);
      if (result?.error) {
        setServerError(result.error);
      } else if (result?.success) {
        setSuccess(result.message ?? 'Account created!');
      }
    });
  };

  if (success) {
    return (
      <div className="space-y-4 text-center">
      <div className="flex justify-center">
          <MailOpen size={48} style={{ color: 'var(--color-primary)' }} />
        </div>
        <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Check your email
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {success}
        </p>
        <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Back to Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Create account
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-secondary)' }}>
          Join Komawa Zone and track your reading
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {serverError && (
          <div
            className="rounded-lg px-3 py-2 text-sm text-white"
            style={{ background: 'var(--color-error)' }}
          >
            {serverError}
          </div>
        )}

        <Input
          label="Username"
          type="text"
          placeholder="mangafan99"
          autoComplete="username"
          error={errors.username?.message}
          hint="3–20 characters. Letters, numbers, underscores only."
          {...register('username')}
        />

        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          autoComplete="email"
          error={errors.email?.message}
          {...register('email')}
        />

        <div className="relative">
          <Input
            label="Password"
            type={showPassword ? 'text' : 'password'}
            placeholder="Min. 8 characters"
            autoComplete="new-password"
            error={errors.password?.message}
            hint="Must include uppercase letter and number."
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-[34px]"
            style={{ color: 'var(--text-tertiary)' }}
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        <Input
          label="Confirm Password"
          type="password"
          placeholder="••••••••"
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          {...register('confirmPassword')}
        />

        <Button type="submit" className="w-full" isLoading={isPending}>
          <UserPlus size={16} />
          Create Account
        </Button>
      </form>

      <p className="text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--color-primary)', fontWeight: 600 }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}
