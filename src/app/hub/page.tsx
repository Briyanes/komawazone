import { Metadata } from 'next';
import { Zap, BookOpen, Crown, MessageCircle } from 'lucide-react';
import { READER_DOMAIN } from '@/config/domains';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'OLLUQ — Beyond Every Story',
  description: 'Platform manga Indonesia terlengkap. Baca ribuan manga gratis, genre lengkap, update harian.',
  openGraph: {
    title: 'OLLUQ — Beyond Every Story',
    description: 'Platform manga Indonesia terlengkap. Baca ribuan manga gratis.',
    siteName: 'OLLUQ',
  },
};

const DEFAULTS = {
  bio_tagline: 'Beyond Every Story ✦ Beyond Fantasy',
  bio_description: 'Platform manga Indonesia terlengkap. Baca ribuan judul manga gratis dengan update setiap hari.',
  bio_discord_url: 'https://discord.gg/olluq',
};

export default async function HubPage() {
  // Fetch bio link settings from DB
  const supabase = await createClient();
  const { data: settings } = await supabase
    .from('site_settings')
    .select('key, value')
    .in('key', ['bio_tagline', 'bio_description', 'bio_discord_url', 'reader_domain']);

  const get = (key: string) => {
    const row = settings?.find(s => s.key === key);
    return typeof row?.value === 'string' ? row.value : (DEFAULTS as Record<string, string>)[key] ?? '';
  };

  const tagline = get('bio_tagline');
  const description = get('bio_description');
  const discordUrl = get('bio_discord_url');
  const readerDomain = get('reader_domain') || READER_DOMAIN;

  const LINKS = [
    {
      label: 'Baca Manga',
      href: `https://${readerDomain}`,
      icon: BookOpen,
      variant: 'primary' as const,
      desc: 'Ribuan manga gratis, update harian',
    },
    {
      label: 'Upgrade VIP',
      href: `https://${readerDomain}/vip`,
      icon: Crown,
      variant: 'vip' as const,
      desc: 'Akses konten 18+, tanpa iklan',
    },
    ...(discordUrl ? [{
      label: 'Discord',
      href: discordUrl,
      icon: MessageCircle,
      variant: 'default' as const,
      desc: 'Gabung komunitas',
    }] : []),
  ];

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '420px',
        padding: '0 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Spacer */}
        <div style={{ height: '80px' }} />

        {/* Logo */}
        <div style={{
          width: '80px',
          height: '80px',
          borderRadius: '24px',
          background: 'linear-gradient(135deg, #FF6B35 0%, #E85A28 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 8px 32px rgba(255, 107, 53, 0.3)',
        }}>
          <Zap size={40} color="white" />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: '32px',
          fontWeight: 800,
          marginTop: '24px',
          marginBottom: '4px',
          letterSpacing: '-0.5px',
          fontFamily: 'var(--font-playfair)',
          color: 'var(--text-primary)',
        }}>
          OLLUQ
        </h1>

        {/* Tagline */}
        <p style={{
          fontSize: '14px',
          color: 'var(--text-tertiary)',
          marginTop: 0,
          marginBottom: '8px',
        }}>
          {tagline}
        </p>

        {/* Description */}
        <p style={{
          fontSize: '13px',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          lineHeight: 1.5,
          marginTop: 0,
          marginBottom: '32px',
          maxWidth: '320px',
        }}>
          {description}
        </p>

        {/* Links */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                  padding: '16px 20px',
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
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: isPrimary
                    ? 'rgba(255,255,255,0.2)'
                    : isVip
                      ? 'rgba(245,158,11,0.15)'
                      : 'var(--bg-tertiary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <link.icon size={20} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '15px',
                    fontWeight: 600,
                    marginBottom: '2px',
                  }}>
                    {link.label}
                  </div>
                  <div style={{
                    fontSize: '12px',
                    color: isPrimary ? 'rgba(255,255,255,0.7)' : 'var(--text-tertiary)',
                  }}>
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

        {/* Divider */}
        <div style={{
          width: '48px',
          height: '1px',
          background: 'var(--border-light)',
          marginTop: '32px',
          marginBottom: '24px',
        }} />

        {/* Footer */}
        <footer style={{
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          lineHeight: 1.6,
          paddingBottom: '40px',
        }}>
          <p style={{ margin: 0 }}>© {new Date().getFullYear()} OLLUQ</p>
          <p style={{ margin: '4px 0 0' }}>All Look Beyond Fantasy</p>
        </footer>
      </div>
    </div>
  );
}