import Link from 'next/link';

const QUICK_LINKS = [
  { label: 'Home',        href: '/'          },
  { label: 'Browse',      href: '/search'    },
  { label: 'Genre',       href: '/genres'    },
  { label: 'Terbaru',     href: '/search?sort=latest'   },
  { label: 'Populer',     href: '/search?sort=popular'  },
];

const ACCOUNT_LINKS = [
  { label: 'Login',       href: '/login'     },
  { label: 'Daftar',      href: '/register'  },
  { label: 'Profil',      href: '/profile'   },
  { label: 'Daftar Baca', href: '/bookmarks' },
];

const SOCIAL_LINKS = [
  {
    label: 'Twitter / X',
    href: 'https://twitter.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
      </svg>
    ),
  },
  {
    label: 'Discord',
    href: 'https://discord.com',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="size-5">
        <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
      </svg>
    ),
  },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}>
      <div className="mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">

          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              <span className="text-2xl font-bold" style={{ fontFamily: 'var(--font-playfair)', color: 'var(--color-primary)' }}>
                KZ
              </span>
              <span className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>
                Komawa Zone
              </span>
            </Link>
            <p className="text-xs leading-relaxed mb-4" style={{ color: 'var(--text-tertiary)' }}>
              Baca manga, manhwa, dan manhua favoritmu secara gratis dan legal.
            </p>
            {/* Social */}
            <div className="flex items-center gap-3">
              {SOCIAL_LINKS.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  title={s.label}
                  className="rounded-lg p-2 transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--text-tertiary)' }}>
                  {s.icon}
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Navigasi
            </h3>
            <ul className="space-y-2">
              {QUICK_LINKS.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm transition-colors hover:text-[var(--color-primary)]"
                    style={{ color: 'var(--text-secondary)' }}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Account */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Akun
            </h3>
            <ul className="space-y-2">
              {ACCOUNT_LINKS.map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm transition-colors hover:text-[var(--color-primary)]"
                    style={{ color: 'var(--text-secondary)' }}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
              Info
            </h3>
            <ul className="space-y-2">
              {[
                { label: 'Tentang Kami',     href: '/about'   },
                { label: 'Kontak',           href: '/contact' },
                { label: 'Kebijakan Privasi',href: '/privacy' },
                { label: 'Syarat & Ketentuan',href: '/terms'  },
              ].map(l => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm transition-colors hover:text-[var(--color-primary)]"
                    style={{ color: 'var(--text-secondary)' }}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-2 border-t pt-6 sm:flex-row"
          style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            © {year} Komawa Zone. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Made with <span style={{ color: 'var(--color-primary)' }}>♥</span> for manga lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
