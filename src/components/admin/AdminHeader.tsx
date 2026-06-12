'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, Bell, ChevronRight } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { ThemeToggle } from '@/components/ui/ThemeToggle';

interface AdminHeaderProps {
  profile: {
    username: string | null;
    avatar_url: string | null;
    email: string;
    role: string;
  };
  onMenuClick: () => void;
}

const breadcrumbMap: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/manga': 'Manga',
  '/admin/chapters': 'Chapters',
  '/admin/genres': 'Genres',
  '/admin/import': 'Import',
  '/admin/sources': 'Sources',
  '/admin/comments': 'Comments',
  '/admin/reports': 'Reports',
  '/admin/users': 'Users',
  '/admin/ads': 'Ads',
  '/admin/subscriptions': 'Subscriptions',
  '/admin/voucher-codes': 'Voucher Codes',
  '/admin/stats': 'Analytics',
  '/admin/settings': 'Settings',
  '/admin/storage-backfill': 'Storage Backfill',
};

export function AdminHeader({ profile, onMenuClick }: AdminHeaderProps) {
  const pathname = usePathname();
  const displayName = profile.username || profile.email.split('@')[0];

  // Build breadcrumb segments
  const segments: { label: string; href: string }[] = [
    { label: 'Admin', href: '/admin' },
  ];
  const matchedKey = Object.entries(breadcrumbMap)
    .filter(([k]) => k !== '/admin')
    .reverse()
    .find(([k]) => pathname.startsWith(k));
  if (matchedKey) {
    segments.push({ label: matchedKey[1], href: matchedKey[0] });
    // Sub-page (e.g. /admin/manga/new)
    if (pathname.includes('/new')) segments.push({ label: 'New', href: pathname });
    else if (pathname.split('/').length > 3 && !pathname.endsWith(matchedKey[0])) {
      segments.push({ label: 'Edit', href: pathname });
    }
  }

  return (
    <header
      className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b px-4"
      style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuClick}
        className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)] lg:hidden"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Open sidebar"
      >
        <Menu size={18} />
      </button>

      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1 text-sm">
        {segments.map((seg, i) => (
          <span key={seg.href} className="flex items-center gap-1 min-w-0">
            {i > 0 && <ChevronRight size={12} style={{ color: 'var(--text-tertiary)' }} className="shrink-0" />}
            {i === segments.length - 1 ? (
              <span className="font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                {seg.label}
              </span>
            ) : (
              <Link
                href={seg.href}
                className="truncate transition-colors hover:underline"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {seg.label}
              </Link>
            )}
          </span>
        ))}
      </nav>

      {/* Right controls */}
      <div className="ml-auto flex items-center gap-1.5">
        <ThemeToggle />
        <button
          className="flex size-8 items-center justify-center rounded-lg transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Bell size={16} />
        </button>
        <Link
          href="/admin/settings"
          className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-[var(--bg-tertiary)]"
        >
          <Avatar fallback={displayName} src={profile.avatar_url ?? undefined} className="size-7" />
          <span className="hidden text-xs font-medium md:block" style={{ color: 'var(--text-primary)' }}>
            {displayName}
          </span>
        </Link>
      </div>
    </header>
  );
}
