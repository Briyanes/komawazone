import { Metadata } from 'next';
import { Zap, BookOpen, MessageCircle, Flame, TrendingUp, Gift, Sparkles } from 'lucide-react';
import { READER_DOMAIN } from '@/config/domains';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'OLLUQ — Beyond Every Story | Baca Manga & Manhwa Gratis',
  description: 'Platform manga & manhwa Indonesia terlengkap. Baca ribuan judul gratis dengan update setiap hari. 100% Tanpa Iklan — Didukung oleh VIP Members.',
  keywords: ['olluq', 'baca manga', 'manhwa indonesia', 'baca manhwa gratis', 'manga online', 'beyond every story'],
  openGraph: {
    title: 'OLLUQ — Beyond Every Story',
    description: 'Baca ribuan manga & manhwa gratis. Update harian. 100% Tanpa Iklan.',
    siteName: 'OLLUQ',
    type: 'website',
    locale: 'id_ID',
    images: [{ url: '/api/og?title=OLLUQ&subtitle=Beyond%20Every%20Story', width: 1200, height: 630, alt: 'OLLUQ — Beyond Every Story' }],
  },
  twitter: { card: 'summary_large_image' },
  alternates: { canonical: 'https://olluq.com' },
};

const DEFAULTS = {
  bio_tagline: 'Beyond Every Story ✦ Beyond Fantasy',
  bio_description: 'Platform manga Indonesia terlengkap. Baca ribuan judul manga gratis dengan update setiap hari.',
  bio_discord_url: 'https://discord.gg/olluq',
};

export default async function HubPage() {
  const supabase = await createClient();

  // Parallel: settings + trending manga + counts
  const [{ data: settings }, { data: trendingManga }, { count: mangaCount }, { count: chapterCount }] = await Promise.all([
    supabase.from('site_settings').select('key, value').in('key', ['bio_tagline', 'bio_description', 'bio_discord_url', 'reader_domain']),
    supabase.from('manga').select('slug, title, cover_url').is('deleted_at', null).order('updated_at', { ascending: false }).limit(6),
    supabase.from('manga').select('id', { count: 'exact', head: true }).is('deleted_at', null),
    supabase.from('chapters').select('id', { count: 'exact', head: true }),
  ]);

  const get = (key: string) => {
    const row = settings?.find(s => s.key === key);
    return typeof row?.value === 'string' ? row.value : (DEFAULTS as Record<string, string>)[key] ?? '';
  };

  const tagline = get('bio_tagline');
  const description = get('bio_description');
  const discordUrl = get('bio_discord_url');
  const readerDomain = get('reader_domain') || READER_DOMAIN;
  const readerBase = `https://${readerDomain}`;

  const stats = [
    { label: 'Judul', value: mangaCount && mangaCount > 1000 ? `${(mangaCount / 1000).toFixed(1)}K+` : `${mangaCount ?? 0}+` },
    { label: 'Chapter', value: chapterCount && chapterCount > 1000 ? `${(chapterCount / 1000).toFixed(0)}K+` : `${chapterCount ?? 0}` },
    { label: 'Iklan', value: '0' },
  ];

  const LINKS = [
    {
      label: 'Baca Manga',
      href: readerBase,
      icon: BookOpen,
      variant: 'primary' as const,
      desc: 'Ribuan manga gratis, update harian',
    },
    {
      label: 'Klaim 1 Bulan VIP Gratis',
      href: `${readerBase}/vip`,
      icon: Gift,
      variant: 'vip' as const,
      desc: 'Trial gratis untuk user baru — tanpa kartu kredit',
    },
    ...(discordUrl ? [{
      label: 'Discord',
      href: discordUrl,
      icon: MessageCircle,
      variant: 'default' as const,
      desc: 'Gabung komunitas manga terbesar',
    }] : []),
  ];

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'OLLUQ',
    alternateName: 'All Look Beyond Fantasy',
    url: 'https://olluq.com',
    description: 'Platform manga & manhwa Indonesia terlengkap. Baca ribuan judul gratis.',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${readerBase}/search?q={search_term_string}`,
      'query-input': 'required name=search_term_string',
    },
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div style={{ width: '100%', maxWidth: '420px', padding: '0 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Spacer */}
        <div style={{ height: '64px' }} />

        {/* Logo */}
        <div style={{
          width: '80px', height: '80px', borderRadius: '24px',
          background: 'linear-gradient(135deg, #FF6B35 0%, #E85A28 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(255, 107, 53, 0.3)',
        }}>
          <Zap size={40} color="white" />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '32px', fontWeight: 800, marginTop: '24px', marginBottom: '4px',
          letterSpacing: '-0.5px', fontFamily: 'var(--font-playfair)', color: 'var(--text-primary)',
        }}>
          OLLUQ
        </h1>

        {/* Tagline */}
        <p style={{ fontSize: '14px', color: 'var(--text-tertiary)', marginTop: 0, marginBottom: '8px' }}>
          {tagline}
        </p>

        {/* Description */}
        <p style={{
          fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center',
          lineHeight: 1.5, marginTop: 0, marginBottom: '20px', maxWidth: '320px',
        }}>
          {description}
        </p>

        {/* Stats Bar — Social Proof */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '24px',
          padding: '12px 20px', borderRadius: '16px', marginBottom: '24px',
          background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', width: '100%',
        }}>
          {stats.map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: 800, color: s.label === 'Iklan' ? '#10b981' : 'var(--text-primary)' }}>
                {s.value}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* Trending Manga Preview */}
        {trendingManga && trendingManga.length > 0 && (
          <div style={{ width: '100%', marginBottom: '24px' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px',
              fontSize: '13px', fontWeight: 700, color: 'var(--text-secondary)',
            }}>
              <Flame size={14} color="#FF6B35" />
              TRENDING SAAT INI
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px',
            }}>
              {trendingManga.map((m) => (
                <a
                  key={m.slug}
                  href={`${readerBase}/manga/${m.slug}`}
                  style={{
                    display: 'block', position: 'relative', borderRadius: '8px',
                    overflow: 'hidden', aspectRatio: '2/3', background: 'var(--bg-secondary)',
                    textDecoration: 'none', transition: 'transform 0.15s ease',
                  }}
                >
                  {m.cover_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.cover_url}
                      alt={m.title}
                      loading="lazy"
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{
                      width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', color: 'var(--text-tertiary)', textAlign: 'center', padding: '4px',
                    }}>
                      {m.title}
                    </div>
                  )}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0,
                    background: 'linear-gradient(to top, rgba(0,0,0,0.9), transparent)',
                    padding: '16px 6px 4px', fontSize: '9px', fontWeight: 600, color: 'white',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {m.title}
                  </div>
                </a>
              ))}
            </div>
            <a
              href={`${readerBase}/search?sort=popular`}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                marginTop: '10px', fontSize: '12px', fontWeight: 600, color: 'var(--color-primary)',
                textDecoration: 'none',
              }}
            >
              <TrendingUp size={12} />
              Lihat Semua Manga
            </a>
          </div>
        )}

        {/* Links */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {LINKS.map((link) => {
            const isPrimary = link.variant === 'primary';
            const isVip = link.variant === 'vip';
            const isExternal = link.href.startsWith('https://discord');

            return (
              <a
                key={link.label}
                href={link.href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px',
                  borderRadius: '16px',
                  background: isPrimary
                    ? 'linear-gradient(135deg, #FF6B35 0%, #E85A28 100%)'
                    : isVip
                      ? 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%)'
                      : 'var(--bg-secondary)',
                  border: isPrimary
                    ? 'none'
                    : isVip
                      ? '1px solid rgba(245,158,11,0.3)'
                      : '1px solid var(--border-light)',
                  color: isPrimary ? 'white' : isVip ? '#f59e0b' : 'var(--text-primary)',
                  textDecoration: 'none',
                  transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: '40px', height: '40px', borderRadius: '12px',
                  background: isPrimary ? 'rgba(255,255,255,0.2)' : isVip ? 'rgba(245,158,11,0.15)' : 'var(--bg-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <link.icon size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, marginBottom: '2px' }}>
                    {link.label}
                  </div>
                  <div style={{ fontSize: '12px', color: isPrimary ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)' }}>
                    {link.desc}
                  </div>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, flexShrink: 0 }}>
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
            );
          })}
        </div>

        {/* USP Badge */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
          marginTop: '20px', padding: '8px 16px', borderRadius: '999px',
          background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
        }}>
          <Sparkles size={12} color="#10b981" />
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#10b981' }}>
            100% Tanpa Iklan — Didukung oleh VIP Members
          </span>
        </div>

        {/* Divider */}
        <div style={{ width: '48px', height: '1px', background: 'var(--border-light)', marginTop: '24px', marginBottom: '20px' }} />

        {/* Footer */}
        <footer style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center', lineHeight: 1.6, paddingBottom: '40px' }}>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} OLLUQ</p>
          <p style={{ margin: '4px 0 0' }}>All Look Beyond Fantasy</p>
        </footer>
      </div>
    </div>
  );
}