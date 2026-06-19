'use client';

import { useState, useMemo, type ReactNode } from 'react';
import { Search, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';

/* ---------------- SearchInput ---------------- */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Cari...',
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        size={15}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-tertiary)' }}
      />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:ring-2 focus:ring-[var(--color-primary)]/30"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-light)',
          color: 'var(--text-primary)',
        }}
      />
    </div>
  );
}

/* ---------------- Badge ---------------- */
export function Badge({
  children,
  color = '#6B7280',
  className,
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        className
      )}
      style={{ background: `${color}18`, color }}
    >
      {children}
    </span>
  );
}

/* ---------------- Skeleton ---------------- */
export function TableSkeleton({ rows = 8, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-lg p-3" style={{ background: 'var(--bg-secondary)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <div
              key={j}
              className="h-4 flex-1 animate-pulse rounded"
              style={{ background: 'var(--border-light)' }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ---------------- EmptyState ---------------- */
export function EmptyState({
  icon: Icon = Inbox,
  title = 'Tidak ada data',
  description,
  action,
}: {
  icon?: React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
      <Icon size={32} style={{ opacity: 0.2, color: 'var(--text-tertiary)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
        {title}
      </p>
      {description && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

/* ---------------- Pagination ---------------- */
export function Pagination({
  page,
  totalPages,
  onPageChange,
  total,
  pageSize,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
  total: number;
  pageSize: number;
}) {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between gap-2 pt-3">
      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
        Menampilkan {from.toLocaleString()}–{to.toLocaleString()} dari {total.toLocaleString()}
      </p>
      <div className="flex items-center gap-1">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          <ChevronLeft size={15} />
        </button>
        {Array.from({ length: totalPages }).slice(0, 7).map((_, i) => {
          const p = i + 1;
          const isActive = p === page;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'flex size-8 items-center justify-center rounded-lg text-xs font-medium tabular-nums transition-colors',
                isActive ? 'text-white' : 'hover:bg-[var(--bg-tertiary)]'
              )}
              style={isActive ? { background: 'var(--color-primary)' } : { color: 'var(--text-secondary)' }}
            >
              {p}
            </button>
          );
        })}
        <button
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex size-8 items-center justify-center rounded-lg transition-colors disabled:opacity-30"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- useClientPagination hook ---------------- */
export function useClientPagination<T>(items: T[], pageSize: number = 20) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(item =>
      JSON.stringify(item).toLowerCase().includes(q)
    );
  }, [items, search]);

  const totalPages = Math.ceil(filtered.length / pageSize) || 1;
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return {
    page: currentPage,
    setPage,
    search,
    setSearch,
    filtered,
    paged,
    totalPages,
    total: filtered.length,
    pageSize,
  };
}

/* ---------------- Breadcrumb ---------------- */
export function Breadcrumb({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
          {item.href ? (
            <a href={item.href} className="transition-colors hover:text-[var(--color-primary)]">
              {item.label}
            </a>
          ) : (
            <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}