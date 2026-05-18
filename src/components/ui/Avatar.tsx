import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { cn } from '@/lib/cn';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeStyles: Record<AvatarSize, string> = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
};

interface AvatarProps {
  src?: string | null;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({ src, alt = '', fallback, size = 'md', className }: AvatarProps) {
  const initials = fallback
    ? fallback.slice(0, 2).toUpperCase()
    : alt.slice(0, 2).toUpperCase() || '?';

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex shrink-0 overflow-hidden rounded-full',
        'bg-[var(--color-primary)]/20',
        sizeStyles[size],
        className
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt={alt}
          className="aspect-square size-full object-cover"
        />
      )}
      <AvatarPrimitive.Fallback
        className={cn(
          'flex size-full items-center justify-center',
          'font-semibold text-[var(--color-primary)]',
          'bg-[var(--color-primary)]/10'
        )}
      >
        {initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
