'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/cn';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg transition-colors',
        'hover:bg-[var(--bg-secondary)]',
        className
      )}
      aria-label="Toggle theme"
    >
      <Sun size={18} className="hidden [data-theme=dark]_&:flex" style={{ color: 'var(--text-secondary)' }} />
      <Moon size={18} className="[data-theme=dark]_&:hidden" style={{ color: 'var(--text-secondary)' }} />
      {/* Simple fallback — always show both, hide via JS */}
      <span className="sr-only">Toggle theme</span>
    </button>
  );
}

// Simplified icon-only toggle that shows the current mode icon
export function ThemeToggleIcon({ className }: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch — render placeholder until mounted
  if (!mounted) {
    return (
      <button
        className={cn('flex size-9 items-center justify-center rounded-lg', className)}
        aria-label="Toggle theme"
        disabled
      >
        <Moon size={18} style={{ color: 'var(--text-secondary)', opacity: 0 }} />
      </button>
    );
  }

  return (
    <button
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      className={cn(
        'flex size-9 items-center justify-center rounded-lg transition-colors',
        'hover:bg-[var(--bg-secondary)]',
        className
      )}
      aria-label="Toggle theme"
    >
      {resolvedTheme === 'dark' ? (
        <Sun size={18} style={{ color: 'var(--text-secondary)' }} />
      ) : (
        <Moon size={18} style={{ color: 'var(--text-secondary)' }} />
      )}
    </button>
  );
}
