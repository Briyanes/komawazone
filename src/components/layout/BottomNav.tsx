'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Bookmark, User, LogIn, History } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';

const navItems = [
  { href: '/',           icon: Home,     label: 'Home'      },
  { href: '/search',     icon: Search,   label: 'Search'    },
  { href: '/history',    icon: History,  label: 'History'   },
  { href: '/bookmarks',  icon: Bookmark, label: 'Bookmark'  },
  { href: '/profile',    icon: User,     label: 'Profile'   },
];

export function BottomNav() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();

  // Hide in reader mode
  if (pathname.includes('/chapter/')) return null;

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-[var(--z-header)] md:hidden"
      style={{ background: 'var(--bg-primary)', borderTop: '1px solid var(--border-light)' }}
    >
      {/* Safe area for notched phones */}
      <div className="flex items-center justify-around pb-safe">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isProfile = href === '/profile';
          const resolvedHref = isProfile && !isAuthenticated ? '/login' : href;
          const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
          const ActiveIcon = isProfile && !isAuthenticated ? LogIn : Icon;
          const displayLabel = isProfile && !isAuthenticated ? 'Login' : label;

          return (
            <Link
              key={href}
              href={resolvedHref}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 min-h-[56px]',
                'transition-colors',
                isActive
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--text-tertiary)]'
              )}
              aria-label={displayLabel}
              aria-current={isActive ? 'page' : undefined}
            >
              <ActiveIcon
                size={22}
                strokeWidth={isActive ? 2.5 : 2}
                fill={isActive ? 'var(--color-primary)' : 'none'}
                style={{ opacity: isActive ? 1 : 0.6 }}
              />
              <span className="text-[10px] font-medium">{displayLabel}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
