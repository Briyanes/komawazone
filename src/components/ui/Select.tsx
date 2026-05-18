'use client';

import { ChevronDown } from 'lucide-react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  hint?: string;
  options: { value: string; label: string }[];
  error?: string;
}

export function Select({ label, hint, options, error, className, ...props }: SelectProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
      )}
      <div className="relative">
        <select
          {...props}
          className={`w-full appearance-none rounded-xl border px-3 py-2.5 pr-9 text-sm outline-none transition-colors focus:border-[var(--color-primary)] ${className ?? ''}`}
          style={{
            background: 'var(--bg-primary)',
            borderColor: error ? 'var(--color-error)' : 'var(--border-default)',
            color: 'var(--text-primary)',
            ...props.style,
          }}
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
          style={{ color: 'var(--text-tertiary)' }}
        />
      </div>
      {hint && !error && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: 'var(--color-error)' }}>{error}</p>
      )}
    </div>
  );
}
