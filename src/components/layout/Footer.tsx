'use client';

import Link from 'next/link';

const TOP_LINKS = [
  { label: 'Home',          href: '/'                    },
  { label: 'Browse',        href: '/search'              },
  { label: 'Terbaru',       href: '/search?sort=latest'  },
  { label: 'Populer',       href: '/search?sort=popular' },
  { label: 'Rating Tinggi', href: '/search?sort=rating'  },
  { label: 'Daftar Baca',   href: '/bookmarks'           },
  { label: 'Riwayat',       href: '/history'             },
  { label: 'Profil',        href: '/profile'             },
];

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer style={{ background: 'var(--bg-primary)', borderTop: '1px solid var(--border-light)' }}>

      {/* ── Top nav row ── */}
      <div style={{ borderBottom: '1px solid var(--border-light)' }}>
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {TOP_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="text-[11px] font-bold uppercase tracking-widest transition-colors hover:text-[#FF6B35]"
              style={{ color: 'var(--text-secondary)' }}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="mx-auto max-w-7xl px-4 py-5 flex flex-col sm:flex-row items-center justify-between gap-4">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white font-black text-sm shadow"
            style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
          >
            KZ
          </div>
          <div>
            <div className="text-sm font-black tracking-tight leading-none" style={{ color: 'var(--text-primary)' }}>
              Komawa Zone
            </div>
            <div className="text-[9px] font-semibold tracking-[0.2em] uppercase mt-0.5" style={{ color: '#FF6B35' }}>
              Virtual Manga
            </div>
          </div>
        </Link>

        {/* Copyright */}
        <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
          © {year} komawazone.com All Rights Reserved.
        </p>

        {/* Back to top */}
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="flex items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white transition-opacity hover:opacity-90 shrink-0 cursor-pointer"
          style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
        >
          Back to Top
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="size-3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
          </svg>
        </button>

      </div>
    </footer>
  );
}
