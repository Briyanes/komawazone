import { cn } from '@/lib/cn';

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'ongoing' | 'completed' | 'hiatus' | 'dropped';

const variantStyles: Record<BadgeVariant, string> = {
  default:   'bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
  success:   'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  warning:   'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  error:     'bg-[var(--color-error)]/15 text-[var(--color-error)]',
  info:      'bg-[var(--color-info)]/15 text-[var(--color-info)]',
  ongoing:   'bg-[var(--color-success)]/15 text-[var(--color-success)]',
  completed: 'bg-[var(--color-info)]/15 text-[var(--color-info)]',
  hiatus:    'bg-[var(--color-warning)]/15 text-[var(--color-warning)]',
  dropped:   'bg-[var(--color-error)]/15 text-[var(--color-error)]',
};

interface BadgeProps {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}

export function Badge({ variant = 'default', className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
