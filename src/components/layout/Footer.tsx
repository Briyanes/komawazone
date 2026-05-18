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

        {/* Social media */}
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-tertiary)' }}>
            Follow us :
          </span>
          {[
            {
              label: 'Instagram',
              href: 'https://instagram.com/komawazone',
              icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
            },
            {
              label: 'X',
              href: 'https://x.com/komawazone',
              icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
            },
            {
              label: 'TikTok',
              href: 'https://tiktok.com/@komawazone',
              icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.16 8.16 0 0 0 4.77 1.52V4.56a4.85 4.85 0 0 1-1-.13z" /></svg>,
            },
          ].map(s => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              title={s.label}
              className="flex size-9 items-center justify-center rounded-full text-white transition-opacity hover:opacity-80"
              style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
            >
              {s.icon}
            </a>
          ))}
        </div>

      </div>
    </footer>
  );
}
