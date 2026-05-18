'use client';

import { useState, useTransition, useEffect } from 'react';
import { Save, CheckCircle, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

interface BannerSettings {
  active: boolean;
  message: string;
  type: 'info' | 'warning' | 'success' | 'promo';
}

export default function AdminSettingsPage() {
  const [siteName, setSiteName] = useState('Komawa Zone');
  const [siteDesc, setSiteDesc] = useState('');
  const [gaCode, setGaCode] = useState('');
  const [headerCode, setHeaderCode] = useState('');
  const [bodyCode, setBodyCode] = useState('');

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
      })
      .catch(() => {});
  }, []);

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
    <div className="max-w-xl space-y-6">
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
