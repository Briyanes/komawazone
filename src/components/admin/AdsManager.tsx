'use client';

import { useState, useTransition } from 'react';
import { Plus, Trash2, ToggleLeft, ToggleRight, Code, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface AdProvider {
  id: string;
  name: string;
  type: string;
  pixel_code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdZone {
  id: string;
  name: string;
  placement: string;
  description: string | null;
  provider_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface AdCampaign {
  id: string;
  name: string;
  zone_id: string;
  type: string;
  html_content: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

type Tab = 'providers' | 'zones' | 'campaigns';

interface AdsManagerProps {
  providers: AdProvider[];
  zones: AdZone[];
  campaigns: AdCampaign[];
}

export function AdsManager({ providers: initialProviders, zones: initialZones, campaigns: initialCampaigns }: AdsManagerProps) {
  const [tab, setTab] = useState<Tab>('providers');
  const [providers, setProviders] = useState(initialProviders);
  const [zones] = useState(initialZones);
  const [campaigns] = useState(initialCampaigns);
  const [isPending, startTransition] = useTransition();

  // New provider form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('BANNER');
  const [newPixelCode, setNewPixelCode] = useState('');
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [formError, setFormError] = useState('');

  const createProvider = () => {
    if (!newName.trim()) { setFormError('Name required'); return; }
    setFormError('');
    startTransition(async () => {
      const res = await fetch('/api/v1/admin/ads/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, type: newType, pixel_code: newPixelCode || null }),
      });
      const data = await res.json() as { status: string; data?: AdProvider };
      if (data.status === 'success' && data.data) {
        setProviders(prev => [data.data!, ...prev]);
        setNewName(''); setNewPixelCode(''); setShowNewProvider(false);
      }
    });
  };

  const toggleProvider = (id: string, isActive: boolean) => {
    startTransition(async () => {
      await fetch(`/api/v1/admin/ads/providers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !isActive } : p));
    });
  };

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'providers', label: 'Providers', count: providers.length },
    { id: 'zones',     label: 'Zones',     count: zones.length },
    { id: 'campaigns', label: 'Campaigns', count: campaigns.length },
  ];

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div
        className="flex rounded-2xl p-1 gap-1"
        style={{ background: 'var(--bg-secondary)' }}
      >
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="flex-1 rounded-xl py-2 text-sm font-medium transition-colors"
            style={tab === t.id
              ? { background: 'var(--color-primary)', color: 'white' }
              : { color: 'var(--text-secondary)' }
            }
          >
            {t.label}
            <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs"
              style={{ background: tab === t.id ? 'rgba(255,255,255,.2)' : 'var(--bg-tertiary)' }}>
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Providers tab */}
      {tab === 'providers' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNewProvider(v => !v)}>
              <Plus size={14} /> Add Provider
            </Button>
          </div>

          {showNewProvider && (
            <div className="rounded-2xl p-4 space-y-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Ad Provider</h3>
              <Input label="Name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Google AdSense" />
              <Select
                label="Type"
                value={newType}
                onChange={e => setNewType(e.target.value)}
                options={[
                  { value: 'BANNER',      label: 'Banner' },
                  { value: 'PIXEL',       label: 'Pixel' },
                  { value: 'CUSTOM_HTML', label: 'Custom HTML' },
                  { value: 'NATIVE',      label: 'Native' },
                ]}
              />
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Code size={11} className="inline mr-1" />
                  Pixel / Script Code
                </label>
                <textarea
                  value={newPixelCode}
                  onChange={e => setNewPixelCode(e.target.value)}
                  rows={4}
                  placeholder="<script>...</script> or pixel tracking code"
                  className="w-full resize-none rounded-xl border px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)]"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
              </div>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={createProvider} isLoading={isPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewProvider(false)}>Cancel</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {providers.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <Megaphone size={32} style={{ color: 'var(--text-tertiary)', opacity: .4 }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No ad providers yet</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {providers.map(p => (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{p.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {p.type} {p.pixel_code ? '· has pixel code' : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => toggleProvider(p.id, p.is_active)}
                      style={{ color: p.is_active ? 'var(--color-primary)' : 'var(--text-tertiary)' }}
                    >
                      {p.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: p.is_active ? 'rgba(16,185,129,.15)' : 'var(--bg-tertiary)',
                        color: p.is_active ? '#10B981' : 'var(--text-tertiary)',
                      }}
                    >
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zones tab */}
      {tab === 'zones' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          {zones.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                No ad zones yet. Zones are created via the API.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {zones.map(z => (
                <div key={z.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{z.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{z.placement}</p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: z.is_active ? 'rgba(16,185,129,.15)' : 'var(--bg-tertiary)',
                      color: z.is_active ? '#10B981' : 'var(--text-tertiary)',
                    }}
                  >
                    {z.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Campaigns tab */}
      {tab === 'campaigns' && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
          {campaigns.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No campaigns yet.</p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
              {campaigns.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</p>
                    <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                      {c.type} · priority {c.priority}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: c.is_active ? 'rgba(16,185,129,.15)' : 'var(--bg-tertiary)',
                      color: c.is_active ? '#10B981' : 'var(--text-tertiary)',
                    }}
                  >
                    {c.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
