'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Search, X, LogIn, User as UserIcon, Bookmark, LogOut, Crown, LayoutDashboard } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/cn';
import { useAuth } from '@/hooks/useAuth';
import { ThemeToggleIcon } from '@/components/ui/ThemeToggle';
import { NotificationBell } from '@/components/NotificationBell';
import { Avatar } from '@/components/ui/Avatar';

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, signOut, isVip } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Hide in reader mode
  const isReader = pathname.includes('/chapter/');
  if (isReader) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <header
      className="sticky top-0 z-[var(--z-header)] w-full"
      style={{
        background: 'var(--header-bg)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        borderBottom: '1px solid var(--glass-border)',
      }}
    >
      <div className="mx-auto flex h-14 md:h-20 max-w-7xl items-center gap-3 px-4 md:px-6">
        {/* Logo */}
        <Link href="/" className="mr-2 shrink-0 flex items-center gap-2">
          <span
            className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-xl md:rounded-2xl text-sm md:text-base font-black shadow-lg text-white"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
          >
            OQ
          </span>
          <span
            className="hidden sm:inline text-xl font-black tracking-tight"
            style={{ color: 'var(--text-primary)' }}
          >
            OLLUQ
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-0.5 flex-1" aria-label="Navigasi utama">
          {[
            { href: '/',                      label: 'Home',    match: pathname === '/' },
            { href: '/search',                label: 'Browse',  match: pathname.startsWith('/search') && !pathname.includes('sort=') },
            { href: '/search?sort=latest',    label: 'Terbaru', match: pathname.includes('sort=latest') },
            { href: '/search?sort=popular',   label: 'Populer', match: pathname.includes('sort=popular') },
            { href: '/genre',                 label: 'Genre',   match: pathname.startsWith('/genre') },
          ].map(({ href, label, match }) => (
            <Link
              key={label}
              href={href}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                match
                  ? 'text-white font-semibold'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
              )}
              style={match ? { background: 'var(--color-primary)' } : {}}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Desktop search */}
        <form
          onSubmit={handleSearch}
          className="hidden md:flex flex-1 max-w-lg items-center gap-2 rounded-full px-5 py-3 transition-shadow focus-within:ring-2 focus-within:ring-[var(--color-primary)]/30"
          style={{
            border: '1px solid var(--border-medium)',
            background: 'var(--bg-secondary)',
          }}
        >
          <Search size={14} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            type="search"
            placeholder="Cari manga..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari manga atau manhwa"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: 'var(--text-primary)' }}
          />
        </form>

        <div className="ml-auto flex items-center gap-1">
          {/* Mobile search toggle */}
          <button
            className="flex md:hidden size-8 items-center justify-center rounded-full transition-colors hover:bg-[var(--bg-tertiary)]"
            onClick={() => { setSearchOpen(v => !v); setTimeout(() => searchRef.current?.focus(), 50); }}
            aria-label="Search"
          >
            {searchOpen
              ? <X size={18} style={{ color: 'var(--text-secondary)' }} />
              : <Search size={18} style={{ color: 'var(--text-secondary)' }} />
            }
          </button>

          <ThemeToggleIcon />

          <NotificationBell />

          {isAuthenticated ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen(v => !v)}
                className="ml-1 rounded-full transition-opacity hover:opacity-80"
                aria-label="User menu"
              >
                <div className="relative">
                  <Avatar
                    src={user?.user_metadata?.avatar_url}
                    alt={user?.user_metadata?.username ?? user?.email ?? ''}
                    size="sm"
                  />
                  {isVip && (
                    <span
                      className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full"
                      style={{ background: '#f59e0b' }}
                    >
                      <Crown size={9} className="text-white" />
                    </span>
                  )}
                </div>
              </button>

              {menuOpen && (
                <UserMenu
                  username={user?.user_metadata?.username ?? 'User'}
                  isVip={isVip}
                  isAdmin={user?.user_metadata?.role === 'ADMIN'}
                  onSignOut={async () => { setMenuOpen(false); await signOut(); }}
                  onClose={() => setMenuOpen(false)}
                  email={user?.email}
                />
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="hidden md:flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              <LogIn size={14} />
              Masuk
            </Link>
          )}
        </div>
      </div>

      {/* Mobile search bar */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="md:hidden flex items-center gap-2 border-t px-4 py-2.5"
          style={{ borderColor: 'var(--glass-border)', background: 'var(--header-bg)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}
        >
          <Search size={15} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={searchRef}
            type="search"
            placeholder="Cari manga, manhwa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Cari manga atau manhwa"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
        </form>
      )}
    </header>
  );
}

// ── User dropdown ──────────────────────────────────────────────────────────

function UserMenu({
  username,
  isVip,
  isAdmin,
  onSignOut,
  onClose,
  email,
}: {
  username: string;
  isVip: boolean;
  isAdmin?: boolean;
  onSignOut: () => void;
  onClose: () => void;
  email?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute right-0 top-10 w-48 rounded-xl border py-1 shadow-[var(--shadow-lg)]"
      style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-light)', zIndex: 'var(--z-overlay)' }}
    >
      <div className="border-b px-3 py-2" style={{ borderColor: 'var(--border-light)' }}>
        <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>@{username}</p>
        {email && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{email}</p>
        )}
        <div className="flex items-center gap-1.5 mt-1">
          {isVip && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: '#f59e0b' }}>
              <Crown size={9} />VIP
            </span>
          )}
          {isAdmin && (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ background: 'var(--color-primary)' }}>
              ADMIN
            </span>
          )}
        </div>
      </div>
      {[
        ...(isAdmin ? [{ href: '/admin', label: 'Admin Dashboard', icon: LayoutDashboard }] : []),
        { href: '/profile',   label: 'Profile',   icon: UserIcon },
        { href: '/bookmarks', label: 'Bookmarks', icon: Bookmark },
      ].map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          onClick={onClose}
          className="flex items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-secondary)]"
          style={{ color: 'var(--text-primary)' }}
        >
          <Icon size={14} style={{ color: 'var(--text-tertiary)' }} />
          {label}
        </Link>
      ))}
      <hr style={{ borderColor: 'var(--border-light)' }} />
      <button
        onClick={onSignOut}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--bg-secondary)]"
        style={{ color: 'var(--color-error)' }}
      >
        <LogOut size={14} />
        Keluar
      </button>
    </div>
  );
}
