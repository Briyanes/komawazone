'use client';

import Link from 'next/link';
import { useState } from 'react';

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://instagram.com/olluqhub',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" /></svg>,
  },
  {
    label: 'X',
    href: 'https://x.com/olluqhub',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622 5.912-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>,
  },
  {
    label: 'TikTok',
    href: 'https://tiktok.com/@olluqhub',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34l-.01-8.83a8.16 8.16 0 0 0 4.77 1.52V4.56a4.85 4.85 0 0 1-1-.13z" /></svg>,
  },
  {
    label: 'Discord',
    href: 'https://discord.gg/olluq',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" /></svg>,
  },
  {
    label: 'YouTube',
    href: 'https://youtube.com/@olluqhub',
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="size-4"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" /></svg>,
  },
];

export function Footer() {
  const year = new Date().getFullYear();
  const [openNav, setOpenNav] = useState(false);
  const [openQuick, setOpenQuick] = useState(false);

  return (
    <footer className="mt-16 relative overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
      {/* Top accent gradient line */}
      <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent 0%, #FF6B35 30%, #a855f7 70%, transparent 100%)' }} />

      <div className="mx-auto max-w-7xl px-4 py-10">

        {/* ── 3-card grid ── */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">

          {/* Card 1 — Brand */}
          <div className="rounded-2xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            <Link href="/" className="mb-4 flex items-center gap-3">
              <div
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white font-black text-base shadow-lg"
                style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
              >
                OQ
              </div>
              <div>
                <div className="text-base font-black leading-none" style={{ color: 'var(--text-primary)' }}>OLLUQ</div>
                <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: '#FF6B35' }}>All Look Beyond Fantasy</div>
              </div>
            </Link>
            <p className="mb-5 text-xs leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
              <strong>OLLUQ</strong> menghadirkan pengalaman membaca manga, manhwa, dan manhua Indonesia dengan tampilan modern, cepat, dan nyaman.
            </p>
            {/* Socials */}
            <div>
              <p className="mb-2.5 text-[10px] font-black uppercase tracking-widest" style={{ color: '#FF6B35' }}>Ikuti Kami</p>
              <div className="flex flex-wrap gap-2">
                {SOCIALS.map(s => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={s.label}
                    className="flex size-8 items-center justify-center rounded-lg text-white transition-all hover:scale-110 hover:opacity-90"
                    style={{ background: 'linear-gradient(135deg, #FF6B35, #E85A28)' }}
                  >
                    {s.icon}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2 — Navigate */}
          <div className="rounded-2xl p-4 md:p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            {/* Mobile: clickable header */}
            <button
              type="button"
              className="flex w-full items-center justify-between md:cursor-default"
              onClick={() => setOpenNav(v => !v)}
            >
              <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: '#FF6B35' }}>
                Navigasi
              </p>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={`size-4 transition-transform duration-200 md:hidden ${openNav ? 'rotate-180' : ''}`}
                style={{ color: '#FF6B35' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <ul className={`${openNav ? 'block' : 'hidden'} md:block space-y-2.5 mt-3 md:mt-4`}>
              {[
                { label: 'All Genre',       href: '/genre'                   },
                { label: 'Update Terbaru',  href: '/search?sort=latest'      },
                { label: 'Rekomendasi',     href: '/search?sort=rating'      },
                { label: 'Top Minggu Ini',  href: '/search?sort=popular'     },
                { label: 'Sudah Tamat',     href: '/search?status=COMPLETED' },
              ].map(l => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="group flex items-center gap-2 text-sm transition-colors hover:text-[#FF6B35]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span
                      className="h-0.5 w-3 shrink-0 rounded-full transition-all group-hover:w-5"
                      style={{ background: '#FF6B35', opacity: 0.5 }}
                    />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Card 3 — Info */}
          <div className="rounded-2xl p-4 md:p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            {/* Mobile: clickable header */}
            <button
              type="button"
              className="flex w-full items-center justify-between md:cursor-default"
              onClick={() => setOpenQuick(v => !v)}
            >
              <p className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: '#FF6B35' }}>
                Tautan Cepat
              </p>
              <svg
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className={`size-4 transition-transform duration-200 md:hidden ${openQuick ? 'rotate-180' : ''}`}
                style={{ color: '#FF6B35' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <ul className={`${openQuick ? 'block' : 'hidden'} md:block space-y-2.5 mt-3 md:mt-4`}>
              {[
                { label: 'Tentang Kami',              href: '/about'     },
                { label: 'Iklan Bersama Kami',         href: '/advertise' },
                { label: 'Hubungi Kami',               href: '/contact'   },
                { label: 'Syarat & Ketentuan',         href: '/terms'     },
              ].map(l => (
                <li key={l.label}>
                  <Link
                    href={l.href}
                    className="group flex items-center gap-2 text-sm transition-colors hover:text-[#FF6B35]"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span
                      className="h-0.5 w-3 shrink-0 rounded-full transition-all group-hover:w-5"
                      style={{ background: '#FF6B35', opacity: 0.5 }}
                    />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

        </div>

        {/* ── Bottom bar ── */}
        <div
          className="mt-8 flex flex-col items-center justify-center gap-1.5 border-t pt-6 pb-24 md:pb-6 text-center"
          style={{ borderColor: 'var(--border-light)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            © {year}{' '}
            <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>
              OLLUQ
            </span>
            . All Rights Reserved.
          </p>
        </div>

      </div>
    </footer>
  );
}
