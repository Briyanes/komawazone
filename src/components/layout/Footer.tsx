import Link from 'next/link';

const NAV_COLS = [
  {
    title: 'Jelajahi',
    links: [
      { label: 'Home',          href: '/'                      },
      { label: 'Browse',        href: '/search'                },
      { label: 'Genre',         href: '/genres'                },
      { label: 'Terbaru',       href: '/search?sort=latest'    },
      { label: 'Populer',       href: '/search?sort=popular'   },
      { label: 'Rating Tinggi', href: '/search?sort=rating'    },
    ],
  },
  {
    title: 'Akun',
    links: [
      { label: 'Login',         href: '/login'      },
      { label: 'Daftar',        href: '/register'   },
      { label: 'Profil',        href: '/profile'    },
      { label: 'Daftar Baca',   href: '/bookmarks'  },
      { label: 'Notifikasi',    href: '/profile?tab=notifications' },
    ],
  },
  {
    title: 'Informasi',
    links: [
      { label: 'Tentang Kami',        href: '/about'   },
      { label: 'Kontak',              href: '/contact' },
      { label: 'Kebijakan Privasi',   href: '/privacy' },
      { label: 'Syarat & Ketentuan',  href: '/terms'   },
      { label: 'DMCA',                href: '/dmca'    },
    ],
  },
];

const SOCIALS = [
  {
    label: 'X',
    href: 'https://twitter.com',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
  },
  {
    label: 'Instagram',
    href: 'https://instagram.com',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
  },
  {
    label: 'Discord',
    href: 'https://discord.com',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" /></svg>,
  },
  {
    label: 'TikTok',
    href: 'https://tiktok.com',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.16 8.16 0 0 0 4.77 1.52V4.56a4.85 4.85 0 0 1-1-.13z"/></svg>,
  },
];

const GENRES_HOT = ['Action', 'Romance', 'Fantasy', 'Horror', 'Slice of Life', 'Isekai'];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-20 overflow-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* Top accent line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #FF6B35 30%, #FF6B35 70%, transparent)' }} />

      {/* Decorative background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full opacity-[0.04]"
          style={{ background: 'radial-gradient(circle, #FF6B35, transparent)' }} />
        <div className="absolute -right-32 top-0 h-80 w-80 rounded-full opacity-[0.03]"
          style={{ background: 'radial-gradient(circle, #FF6B35, transparent)' }} />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pt-14 pb-8">

        {/* ── Main grid ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-[2fr_1fr_1fr_1fr]">

          {/* Brand col */}
          <div className="col-span-2 lg:col-span-1">
            {/* Logo */}
            <Link href="/" className="group mb-5 inline-flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-white font-black text-lg shadow-lg"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}>
                KZ
              </div>
              <div>
                <div className="text-base font-black tracking-tight leading-none"
                  style={{ color: 'var(--text-primary)' }}>
                  Komawa Zone
                </div>
                <div className="text-[10px] font-semibold tracking-[0.2em] uppercase mt-0.5"
                  style={{ color: '#FF6B35' }}>
                  Read · Discover · Enjoy
                </div>
              </div>
            </Link>

            <p className="mb-5 text-sm leading-relaxed max-w-xs"
              style={{ color: 'var(--text-tertiary)' }}>
              Platform baca manga, manhwa & manhua terlengkap. Update harian, gratis selamanya.
            </p>

            {/* Hot genres */}
            <div className="mb-6">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
                Genre Populer
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GENRES_HOT.map(g => (
                  <Link key={g} href={`/genres/${g.toLowerCase().replace(/ /g, '-')}`}
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all hover:scale-105"
                    style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                    {g}
                  </Link>
                ))}
              </div>
            </div>

            {/* Socials */}
            <div className="flex items-center gap-2">
              {SOCIALS.map(s => (
                <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                  title={s.label}
                  className="group flex size-9 items-center justify-center rounded-xl transition-all hover:scale-110"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}>
                  <span className="transition-colors group-hover:text-[#FF6B35]">{s.icon}</span>
                </a>
              ))}
            </div>
          </div>

          {/* Link cols */}
          {NAV_COLS.map(col => (
            <div key={col.title}>
              <h3 className="mb-4 text-[11px] font-black uppercase tracking-[0.18em]"
                style={{ color: '#FF6B35' }}>
                {col.title}
              </h3>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l.href}>
                    <Link href={l.href}
                      className="group flex items-center gap-1.5 text-sm transition-colors hover:text-[#FF6B35]"
                      style={{ color: 'var(--text-secondary)' }}>
                      <span className="h-px w-3 flex-shrink-0 transition-all group-hover:w-4"
                        style={{ background: 'currentColor', opacity: 0.4 }} />
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── Stats bar ────────────────────────────────────── */}
        <div className="mt-12 grid grid-cols-3 gap-4 rounded-2xl p-5"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
          {[
            { value: '10.000+', label: 'Judul Manga' },
            { value: '500K+',   label: 'Pembaca Aktif' },
            { value: 'Update',  label: 'Setiap Hari' },
          ].map(s => (
            <div key={s.label} className="flex flex-col items-center gap-0.5">
              <span className="text-xl font-black sm:text-2xl" style={{ color: '#FF6B35' }}>{s.value}</span>
              <span className="text-center text-[11px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Bottom bar ───────────────────────────────────── */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
          style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            © {year} <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Komawa Zone</span>. All rights reserved.
          </p>
          <div className="flex items-center gap-4">
            {['Privasi', 'Terms', 'DMCA'].map((t, i) => (
              <Link key={t} href={['privacy', 'terms', 'dmca'][i] ? `/${['privacy', 'terms', 'dmca'][i]}` : '/'}
                className="text-xs transition-colors hover:text-[#FF6B35]"
                style={{ color: 'var(--text-tertiary)' }}>
                {t}
              </Link>
            ))}
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Made with <span style={{ color: '#FF6B35' }}>♥</span> for manga lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
