import Link from 'next/link';

const NAV_COLS = [
  {
    title: 'Jelajahi',
    links: [
      { label: 'Home',          href: '/'                    },
      { label: 'Browse',        href: '/search'              },
      { label: 'Terbaru',       href: '/search?sort=latest'  },
      { label: 'Populer',       href: '/search?sort=popular' },
      { label: 'Rating Tinggi', href: '/search?sort=rating'  },
    ],
  },
  {
    title: 'Akun',
    links: [
      { label: 'Login',       href: '/login'                      },
      { label: 'Daftar',      href: '/register'                   },
      { label: 'Profil',      href: '/profile'                    },
      { label: 'Daftar Baca', href: '/bookmarks'                  },
      { label: 'Riwayat',     href: '/history'                    },
      { label: 'Notifikasi',  href: '/profile?tab=notifications'  },
    ],
  },
];

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
        <div className="grid grid-cols-2 gap-10 lg:grid-cols-[2fr_1fr_1fr]">

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

            <p className="text-sm leading-relaxed max-w-xs"
              style={{ color: 'var(--text-tertiary)' }}>
              Platform baca manga, manhwa & manhua. Update harian, gratis selamanya.
            </p>
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

        {/* ── Bottom bar ───────────────────────────────────── */}
        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t pt-6 sm:flex-row"
          style={{ borderColor: 'var(--border-light)' }}>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            © {year} <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Komawa Zone</span>. All rights reserved.
          </p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Made with <span style={{ color: '#FF6B35' }}>♥</span> for manga lovers
          </p>
        </div>
      </div>
    </footer>
  );
}
