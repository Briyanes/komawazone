'use client';

import { useState, useTransition, useEffect } from 'react';
import { Save, CheckCircle, Megaphone, Globe, Link2, AlertTriangle, ShoppingBag } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface BannerSettings {
  active: boolean;
  message: string;
  type: 'info' | 'warning' | 'success' | 'promo';
}

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState('OLLUQ');
  const [siteDesc, setSiteDesc] = useState('');
  const [gaCode, setGaCode] = useState('');
  const [headerCode, setHeaderCode] = useState('');
  const [bodyCode, setBodyCode] = useState('');

  // Domain settings
  const [hubDomain, setHubDomain] = useState('olluq.com');
  const [readerDomain, setReaderDomain] = useState('olluq.xyz');

  // Bio link settings
  const [bioTagline, setBioTagline] = useState('Beyond Every Story ✦ Beyond Fantasy');
  const [bioDescription, setBioDescription] = useState('Platform manga Indonesia terlengkap. Baca ribuan judul manga gratis dengan update setiap hari.');
  const [bioDiscordUrl, setBioDiscordUrl] = useState('https://discord.gg/olluq');

  // Marketplace links
  const [tokopediaUrl, setTokopediaUrl] = useState('');
  const [shopeeUrl, setShopeeUrl] = useState('');
  const [waUrl, setWaUrl] = useState('');
  const [waLabel, setWaLabel] = useState('');

  // Announcement banner
  const [banner, setBanner] = useState<BannerSettings>({ active: false, message: '', type: 'info' });
  const [bannerSaved, setBannerSaved] = useState(false);
  const [bannerPending, startBannerTransition] = useTransition();

  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load all settings from API on mount
  useEffect(() => {
    fetch('/api/v1/admin/settings')
      .then(r => r.json())
      .then((d: { data?: Record<string, unknown> }) => {
        const data = d.data ?? {};
        if (typeof data.site_name === 'string')  setSiteName(data.site_name);
        if (typeof data.site_desc === 'string')   setSiteDesc(data.site_desc);
        if (typeof data.ga_code   === 'string')   setGaCode(data.ga_code);
        if (typeof data.header_code === 'string') setHeaderCode(data.header_code);
        if (typeof data.body_code   === 'string') setBodyCode(data.body_code);
        if (data.announcement_banner && typeof data.announcement_banner === 'object') {
          setBanner(data.announcement_banner as BannerSettings);
        }
        if (typeof data.hub_domain === 'string')     setHubDomain(data.hub_domain);
        if (typeof data.reader_domain === 'string')   setReaderDomain(data.reader_domain);
        if (typeof data.bio_tagline === 'string')     setBioTagline(data.bio_tagline);
        if (typeof data.bio_description === 'string') setBioDescription(data.bio_description);
        if (typeof data.bio_discord_url === 'string') setBioDiscordUrl(data.bio_discord_url);
        if (typeof data.marketplace_tokopedia_url === 'string') setTokopediaUrl(data.marketplace_tokopedia_url);
        if (typeof data.marketplace_shopee_url === 'string') setShopeeUrl(data.marketplace_shopee_url);
        if (typeof data.marketplace_whatsapp_url === 'string') setWaUrl(data.marketplace_whatsapp_url);
        if (typeof data.marketplace_wa_label === 'string') setWaLabel(data.marketplace_wa_label);
      })
      .catch(() => {});
  }, []);

  // Marketplace links save
  const [marketSaved, setMarketSaved] = useState(false);
  const [marketPending, startMarketTransition] = useTransition();

  const handleSaveMarket = () => {
    startMarketTransition(async () => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marketplace_tokopedia_url: tokopediaUrl,
          marketplace_shopee_url: shopeeUrl,
          marketplace_whatsapp_url: waUrl,
          marketplace_wa_label: waLabel,
        }),
      });
      if (res.ok) {
        setMarketSaved(true);
        setTimeout(() => setMarketSaved(false), 3000);
      }
    });
  };

  // Domain settings save
  const [domainSaved, setDomainSaved] = useState(false);
  const [domainPending, startDomainTransition] = useTransition();

  const handleSaveDomain = () => {
    startDomainTransition(async () => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hub_domain: hubDomain,
          reader_domain: readerDomain,
        }),
      });
      if (res.ok) {
        setDomainSaved(true);
        setTimeout(() => setDomainSaved(false), 3000);
      }
    });
  };

  // Bio link settings save
  const [bioSaved, setBioSaved] = useState(false);
  const [bioPending, startBioTransition] = useTransition();

  const handleSaveBio = () => {
    startBioTransition(async () => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bio_tagline: bioTagline,
          bio_description: bioDescription,
          bio_discord_url: bioDiscordUrl,
        }),
      });
      if (res.ok) {
        setBioSaved(true);
        setTimeout(() => setBioSaved(false), 3000);
      }
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          site_name: siteName,
          site_desc: siteDesc,
          ga_code: gaCode,
          header_code: headerCode,
          body_code: bodyCode,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    });
  };

  const handleSaveBanner = () => {
    startBannerTransition(async () => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ announcement_banner: banner }),
      });
      if (res.ok) {
        setBannerSaved(true);
        setTimeout(() => setBannerSaved(false), 3000);
      }
    });
  };

  const sections = [
    {
      title: 'Site Information',
      fields: [
        {
          label: 'Site Name',
          node: <Input value={siteName} onChange={e => setSiteName(e.target.value)} />,
        },
        {
          label: 'Site Description',
          node: (
            <textarea
              value={siteDesc}
              onChange={e => setSiteDesc(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          ),
        },
      ],
    },
    {
      title: 'Analytics',
      fields: [
        {
          label: 'Google Analytics Measurement ID',
          node: (
            <Input
              value={gaCode}
              onChange={e => setGaCode(e.target.value)}
              placeholder="G-XXXXXXXXXX"
            />
          ),
        },
      ],
    },
    {
      title: 'Custom Code Injection',
      fields: [
        {
          label: '<head> Code (Pixels, Meta Tags, etc.)',
          node: (
            <textarea
              value={headerCode}
              onChange={e => setHeaderCode(e.target.value)}
              rows={5}
              placeholder="<!-- code injected into <head> -->"
              className="w-full resize-none rounded-xl border px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          ),
        },
        {
          label: '<body> Code (Chat widgets, scripts, etc.)',
          node: (
            <textarea
              value={bodyCode}
              onChange={e => setBodyCode(e.target.value)}
              rows={5}
              placeholder="<!-- code injected before </body> -->"
              className="w-full resize-none rounded-xl border px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          ),
        },
      ],
    },
  ];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
        Site Settings
      </h1>

      {/* Announcement Banner Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <div className="flex items-center gap-2">
            <Megaphone size={15} style={{ color: 'var(--color-primary)' }} />
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Announcement Banner
            </h2>
          </div>
          {/* Active toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={banner.active}
            onClick={() => setBanner(b => ({ ...b, active: !b.active }))}
            className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200"
            style={{ background: banner.active ? 'var(--color-primary)' : 'var(--bg-tertiary)' }}
          >
            <span
              className="inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 mt-0.5"
              style={{ transform: banner.active ? 'translateX(18px)' : 'translateX(2px)' }}
            />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Message
            </label>
            <input
              value={banner.message}
              onChange={e => setBanner(b => ({ ...b, message: e.target.value }))}
              placeholder="e.g. We've added 50 new chapters today! 🎉"
              className="w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Type
            </label>
            <div className="flex gap-2 flex-wrap">
              {(['info', 'warning', 'success', 'promo'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBanner(b => ({ ...b, type: t }))}
                  className="rounded-full px-3 py-1 text-xs font-semibold border transition-colors capitalize"
                  style={{
                    borderColor: banner.type === t ? 'var(--color-primary)' : 'var(--border-default)',
                    background: banner.type === t ? 'rgba(255,107,53,0.1)' : 'transparent',
                    color: banner.type === t ? 'var(--color-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          {banner.active && banner.message && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: banner.type === 'info' ? 'rgba(59,130,246,0.08)' :
                  banner.type === 'warning' ? 'rgba(245,158,11,0.08)' :
                  banner.type === 'success' ? 'rgba(16,185,129,0.08)' :
                  'rgba(255,107,53,0.08)',
                color: banner.type === 'info' ? '#3B82F6' :
                  banner.type === 'warning' ? '#F59E0B' :
                  banner.type === 'success' ? '#10B981' :
                  'var(--color-primary)',
              }}
            >
              Preview: {banner.message}
            </div>
          )}
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={handleSaveBanner} isLoading={bannerPending}>
              <Save size={13} /> Save Banner
            </Button>
            {bannerSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle size={13} /> Saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Domain Settings Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <Globe size={15} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Domain Settings
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Hub Domain (Link Bio)
            </label>
            <Input value={hubDomain} onChange={e => setHubDomain(e.target.value)} placeholder="olluq.com" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Reader Domain (Manga)
            </label>
            <Input value={readerDomain} onChange={e => setReaderDomain(e.target.value)} placeholder="olluq.xyz" />
          </div>
          <details className="rounded-xl p-3 text-xs" style={{ background: 'rgba(245,158,11,0.08)' }}>
            <summary className="flex items-center gap-2 cursor-pointer font-semibold" style={{ color: '#f59e0b' }}>
              <AlertTriangle size={14} className="shrink-0" />
              Jika reader domain berubah, update berikut:
            </summary>
            <ol className="mt-2 ml-5 space-y-1.5 list-decimal" style={{ color: '#f59e0b' }}>
              <li>Env var <code className="font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)' }}>NEXT_PUBLIC_READER_DOMAIN</code> di Vercel</li>
              <li>Add domain baru di Vercel → Settings → Domains</li>
              <li>Update DNS records di registrar (A/CNAME)</li>
              <li>Supabase → Auth → URL Config → Redirect URLs: tambah <code className="font-mono px-1 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)' }}>https://newdomain.com/**</code></li>
              <li>Google OAuth → Authorized redirect URIs: tambah callback URL baru</li>
              <li>Discord OAuth → Redirect URL: update ke domain baru</li>
              <li>X/Twitter OAuth → Callback URL: update ke domain baru</li>
              <li>Redeploy di Vercel</li>
            </ol>
          </details>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={handleSaveDomain} isLoading={domainPending}>
              <Save size={13} /> Save Domain
            </Button>
            {domainSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle size={13} /> Saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bio Link Settings Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <Link2 size={15} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Bio Link (olluq.com)
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Tagline
            </label>
            <Input value={bioTagline} onChange={e => setBioTagline(e.target.value)} placeholder="Beyond Every Story ✦ Beyond Fantasy" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Description
            </label>
            <textarea
              value={bioDescription}
              onChange={e => setBioDescription(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: 'var(--text-primary)',
              }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Discord URL
            </label>
            <Input value={bioDiscordUrl} onChange={e => setBioDiscordUrl(e.target.value)} placeholder="https://discord.gg/..." />
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={handleSaveBio} isLoading={bioPending}>
              <Save size={13} /> Save Bio Link
            </Button>
            {bioSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle size={13} /> Saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Marketplace Links Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
        <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <ShoppingBag size={15} style={{ color: 'var(--color-primary)' }} />
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Marketplace & Kontak (VIP Page)
          </h2>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Tokopedia URL
            </label>
            <Input value={tokopediaUrl} onChange={e => setTokopediaUrl(e.target.value)} placeholder="https://www.tokopedia.com/olluq" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              Shopee URL
            </label>
            <Input value={shopeeUrl} onChange={e => setShopeeUrl(e.target.value)} placeholder="https://shopee.co.id/olluq" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              WhatsApp URL
            </label>
            <Input value={waUrl} onChange={e => setWaUrl(e.target.value)} placeholder="https://wa.me/6281xxx" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
              WhatsApp Label (opsional)
            </label>
            <Input value={waLabel} onChange={e => setWaLabel(e.target.value)} placeholder="Chat Admin (08:00 - 22:00)" />
          </div>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Kosongkan link yang tidak digunakan — tombolnya otomatis hilang dari halaman VIP.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Button size="sm" onClick={handleSaveMarket} isLoading={marketPending}>
              <Save size={13} /> Save Marketplace
            </Button>
            {marketSaved && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle size={13} /> Saved!
              </span>
            )}
          </div>
        </div>
      </div>

      {sections.map(section => (
        <div
          key={section.title}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'var(--bg-secondary)' }}
        >
          <div className="px-5 py-4 border-b" style={{ borderColor: 'var(--border-light)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {section.title}
            </h2>
          </div>
          <div className="px-5 py-4 space-y-4">
            {section.fields.map(f => (
              <div key={f.label} className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  {f.label}
                </label>
                {f.node}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} isLoading={isPending}>
          <Save size={14} /> Save Settings
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-emerald-500">
            <CheckCircle size={14} /> Saved!
          </span>
        )}
      </div>
    </div>
  );
}
