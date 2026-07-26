'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Bookmark, User, LogIn, History, Crown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/',           icon: Home,     label: 'Beranda'  },
  { href: '/search',     icon: Search,   label: 'Jelajah'  },
  { href: '/history',    icon: History,  label: 'Riwayat'  },
  { href: '/bookmarks',  icon: Bookmark, label: 'Daftar'   },
  { href: '/profile',    icon: User,     label: 'Profil'   },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isAuthenticated, isVip } = useAuth();

  // Hide in reader mode
  if (pathname.includes('/chapter/')) return null;

  // Non-VIP logged-in: show VIP upgrade badge on Profile tab
  const showVipBadge = isAuthenticated && !isVip;

  return (
    <nav
      className="fixed left-3 right-3 z-[var(--z-header)] md:hidden rounded-2xl"
      style={{
        bottom: 'calc(12px + env(safe-area-inset-bottom))',
        background: 'var(--glass-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        WebkitBackdropFilter: 'blur(24px) saturate(180%)',
        border: '1px solid var(--glass-border)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.1)',
        transform: 'translate3d(0,0,0)',
        WebkitTransform: 'translate3d(0,0,0)',
        willChange: 'transform',
      }}
    >
      <div className="flex items-center justify-around px-1 py-1.5">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isProfile = href === '/profile';
          const resolvedHref = isProfile && !isAuthenticated ? '/login' : href;
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const ActiveIcon = isProfile && !isAuthenticated ? LogIn : Icon;
          const displayLabel = isProfile && !isAuthenticated ? 'Masuk' : label;

          return (
            <Link
              key={href}
              href={resolvedHref}
              className="flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 transition-all"
              aria-label={displayLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <span
                className={cn(
                  'relative flex size-9 items-center justify-center rounded-xl transition-all',
                  isActive ? 'shadow-sm' : ''
                )}
                style={isActive ? { background: 'var(--color-primary)', boxShadow: '0 4px 12px rgba(255,107,53,0.35)' } : {}}
              >
                <ActiveIcon
                  size={19}
                  strokeWidth={isActive ? 2.5 : 1.8}
                  color={isActive ? '#fff' : 'var(--text-tertiary)'}
                />
                {/* VIP upgrade badge for non-VIP logged-in users */}
                {isProfile && showVipBadge && (
                  <span
                    className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full"
                    style={{
                      background: '#f59e0b',
                      boxShadow: '0 0 0 2px var(--bg-primary)',
                    }}
                  >
                    <Crown size={8} className="text-white" />
                  </span>
                )}
              </span>
              <span
                className="text-[9px] font-semibold tracking-wide"
                style={{ color: isActive ? 'var(--color-primary)' : 'var(--text-tertiary)' }}
              >
                {displayLabel}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}