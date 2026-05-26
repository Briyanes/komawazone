'use client';

import { useState, useTransition } from 'react';
import { Plus, ToggleLeft, ToggleRight, Code, Megaphone, Trash2 } from 'lucide-react';
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
  const [zones, setZones] = useState(initialZones);
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [providersPending, startProviders] = useTransition();
  const [zonesPending, startZones] = useTransition();
  const [campaignsPending, startCampaigns] = useTransition();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // New provider form
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('BANNER');
  const [newPixelCode, setNewPixelCode] = useState('');
  const [showNewProvider, setShowNewProvider] = useState(false);
  const [formError, setFormError] = useState('');

  // New zone form
  const [showNewZone, setShowNewZone] = useState(false);
  const [zoneName, setZoneName] = useState('');
  const [zonePlacement, setZonePlacement] = useState('');
  const [zoneProviderId, setZoneProviderId] = useState('');
  const [zoneDesc, setZoneDesc] = useState('');
  const [zoneError, setZoneError] = useState('');

  // New campaign form
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [campName, setCampName] = useState('');
  const [campZoneId, setCampZoneId] = useState('');
  const [campType, setCampType] = useState('BANNER');
  const [campHtml, setCampHtml] = useState('');
  const [campImageUrl, setCampImageUrl] = useState('');
  const [campLinkUrl, setCampLinkUrl] = useState('');
  const [campPriority, setCampPriority] = useState('0');
  const [campError, setCampError] = useState('');

  const createProvider = () => {
    if (!newName.trim()) { setFormError('Name required'); return; }
    setFormError('');
    startProviders(async () => {
      const res = await fetch('/api/v1/admin/ads/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, type: newType, pixel_code: newPixelCode || null }),
      });
      const data = await res.json() as { status: string; data?: AdProvider };
      if (data.status === 'success' && data.data) {
        setProviders(prev => [data.data!, ...prev]);
        setNewName(''); setNewPixelCode(''); setShowNewProvider(false);
      } else {
        setFormError('Gagal membuat provider');
      }
    });
  };

  const toggleProvider = async (id: string, isActive: boolean) => {
    if (togglingId) return;
    setTogglingId(id);
    setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: !isActive } : p));
    const res = await fetch(`/api/v1/admin/ads/providers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setTogglingId(null);
    if (!res.ok) setProviders(prev => prev.map(p => p.id === id ? { ...p, is_active: isActive } : p));
  };

  const deleteProvider = async (id: string) => {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/v1/admin/ads/providers/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setProviders(prev => prev.filter(p => p.id !== id));
  };

  const createZone = () => {
    if (!zoneName.trim() || !zonePlacement.trim() || !zoneProviderId) {
      setZoneError('Name, Placement, dan Provider wajib diisi'); return;
    }
    setZoneError('');
    startZones(async () => {
      const res = await fetch('/api/v1/admin/ads/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: zoneName, placement: zonePlacement, provider_id: zoneProviderId, description: zoneDesc || null }),
      });
      const data = await res.json() as { status: string; data?: AdZone };
      if (data.status === 'success' && data.data) {
        setZones(prev => [data.data!, ...prev]);
        setZoneName(''); setZonePlacement(''); setZoneProviderId(''); setZoneDesc('');
        setShowNewZone(false);
      } else {
        setZoneError('Gagal membuat zone');
      }
    });
  };

  const toggleZone = async (id: string, isActive: boolean) => {
    if (togglingId) return;
    setTogglingId(id);
    setZones(prev => prev.map(z => z.id === id ? { ...z, is_active: !isActive } : z));
    const res = await fetch(`/api/v1/admin/ads/zones/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setTogglingId(null);
    if (!res.ok) setZones(prev => prev.map(z => z.id === id ? { ...z, is_active: isActive } : z));
  };

  const deleteZone = async (id: string) => {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/v1/admin/ads/zones/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setZones(prev => prev.filter(z => z.id !== id));
    setCampaigns(prev => prev.filter(c => c.zone_id !== id));
  };

  const createCampaign = () => {
    if (!campName.trim() || !campZoneId) {
      setCampError('Name dan Zone wajib diisi'); return;
    }
    setCampError('');
    startCampaigns(async () => {
      const res = await fetch('/api/v1/admin/ads/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: campName, zone_id: campZoneId, type: campType,
          html_content: campHtml || null,
          image_url: campImageUrl || null,
          link_url: campLinkUrl || null,
          priority: parseInt(campPriority) || 0,
        }),
      });
      const data = await res.json() as { status: string; data?: AdCampaign };
      if (data.status === 'success' && data.data) {
        setCampaigns(prev => [data.data!, ...prev]);
        setCampName(''); setCampZoneId(''); setCampType('BANNER');
        setCampHtml(''); setCampImageUrl(''); setCampLinkUrl(''); setCampPriority('0');
        setShowNewCampaign(false);
      } else {
        setCampError('Gagal membuat campaign');
      }
    });
  };

  const toggleCampaign = async (id: string, isActive: boolean) => {
    if (togglingId) return;
    setTogglingId(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
    const res = await fetch(`/api/v1/admin/ads/campaigns/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !isActive }),
    });
    setTogglingId(null);
    if (!res.ok) setCampaigns(prev => prev.map(c => c.id === id ? { ...c, is_active: isActive } : c));
  };

  const deleteCampaign = async (id: string) => {
    setConfirmDeleteId(null);
    const res = await fetch(`/api/v1/admin/ads/campaigns/${id}`, { method: 'DELETE' });
    if (!res.ok) return;
    setCampaigns(prev => prev.filter(c => c.id !== id));
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
                <Button size="sm" onClick={createProvider} isLoading={providersPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewProvider(false)}>Batal</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {providers.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <Megaphone size={32} style={{ color: 'var(--text-tertiary)', opacity: .4 }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Belum ada ad provider</p>
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
                      disabled={togglingId === p.id}
                      style={{ color: p.is_active ? 'var(--color-primary)' : 'var(--text-tertiary)', opacity: togglingId === p.id ? 0.4 : 1 }}
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
                    {confirmDeleteId === p.id ? (
                      <div className="flex gap-1 items-center">
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
                          style={{ color: 'var(--text-tertiary)' }}>Batal</button>
                        <button onClick={() => deleteProvider(p.id)}
                          className="rounded px-2 py-1 text-xs font-semibold text-white"
                          style={{ background: '#EF4444' }}>Hapus</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(p.id)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-error, #ef4444)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zones tab */}
      {tab === 'zones' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNewZone(v => !v)}>
              <Plus size={14} /> Add Zone
            </Button>
          </div>

          {showNewZone && (
            <div className="rounded-2xl p-4 space-y-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Ad Zone</h3>
              <Input label="Name" value={zoneName} onChange={e => setZoneName(e.target.value)} placeholder="e.g. Reader Top Banner" />
              <Input label="Placement" value={zonePlacement} onChange={e => setZonePlacement(e.target.value)} placeholder="e.g. READER_TOP" />
              <Select
                label="Provider"
                value={zoneProviderId}
                onChange={e => setZoneProviderId(e.target.value)}
                options={[
                  { value: '', label: '-- Pilih Provider --' },
                  ...providers.map(p => ({ value: p.id, label: p.name })),
                ]}
              />
              <Input label="Deskripsi (opsional)" value={zoneDesc} onChange={e => setZoneDesc(e.target.value)} placeholder="Keterangan zone" />
              {zoneError && <p className="text-xs text-red-500">{zoneError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={createZone} isLoading={zonesPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewZone(false)}>Batal</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {zones.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Belum ada ad zone. Klik &quot;Add Zone&quot; untuk membuat.</p>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
                {zones.map(z => (
                  <div key={z.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{z.name}</p>
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{z.placement}{z.description ? ` · ${z.description}` : ''}</p>
                    </div>
                    <button
                      onClick={() => toggleZone(z.id, z.is_active)}
                      disabled={togglingId === z.id}
                      style={{ color: z.is_active ? 'var(--color-primary)' : 'var(--text-tertiary)', opacity: togglingId === z.id ? 0.4 : 1 }}
                    >
                      {z.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: z.is_active ? 'rgba(16,185,129,.15)' : 'var(--bg-tertiary)',
                        color: z.is_active ? '#10B981' : 'var(--text-tertiary)',
                      }}
                    >
                      {z.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {confirmDeleteId === z.id ? (
                      <div className="flex gap-1 items-center">
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
                          style={{ color: 'var(--text-tertiary)' }}>Batal</button>
                        <button onClick={() => deleteZone(z.id)}
                          className="rounded px-2 py-1 text-xs font-semibold text-white"
                          style={{ background: '#EF4444' }}>Hapus</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(z.id)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-error, #ef4444)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Campaigns tab */}
      {tab === 'campaigns' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={() => setShowNewCampaign(v => !v)}>
              <Plus size={14} /> Add Campaign
            </Button>
          </div>

          {showNewCampaign && (
            <div className="rounded-2xl p-4 space-y-3 border" style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-default)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>New Campaign</h3>
              <Input label="Name" value={campName} onChange={e => setCampName(e.target.value)} placeholder="e.g. Summer Promo Banner" />
              <Select
                label="Zone"
                value={campZoneId}
                onChange={e => setCampZoneId(e.target.value)}
                options={[
                  { value: '', label: '-- Pilih Zone --' },
                  ...zones.map(z => ({ value: z.id, label: z.name })),
                ]}
              />
              <Select
                label="Type"
                value={campType}
                onChange={e => setCampType(e.target.value)}
                options={[
                  { value: 'BANNER',      label: 'Banner' },
                  { value: 'IMAGE',       label: 'Image' },
                  { value: 'CUSTOM_HTML', label: 'Custom HTML' },
                  { value: 'VIDEO',       label: 'Video' },
                ]}
              />
              <Input label="Image URL (opsional)" value={campImageUrl} onChange={e => setCampImageUrl(e.target.value)} placeholder="https://..." />
              <Input label="Link URL (opsional)" value={campLinkUrl} onChange={e => setCampLinkUrl(e.target.value)} placeholder="https://..." />
              <Input label="Priority" value={campPriority} onChange={e => setCampPriority(e.target.value)} placeholder="0" type="number" />
              <div className="space-y-1">
                <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                  <Code size={11} className="inline mr-1" />
                  Custom HTML (opsional)
                </label>
                <textarea
                  value={campHtml}
                  onChange={e => setCampHtml(e.target.value)}
                  rows={4}
                  placeholder="<div>Ad HTML content</div>"
                  className="w-full resize-none rounded-xl border px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)]"
                  style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
                />
              </div>
              {campError && <p className="text-xs text-red-500">{campError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={createCampaign} isLoading={campaignsPending}>Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setShowNewCampaign(false)}>Batal</Button>
              </div>
            </div>
          )}

          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            {campaigns.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2">
                <Megaphone size={32} style={{ color: 'var(--text-tertiary)', opacity: .4 }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Belum ada kampanye iklan.</p>
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
                    <button
                      onClick={() => toggleCampaign(c.id, c.is_active)}
                      disabled={togglingId === c.id}
                      style={{ color: c.is_active ? 'var(--color-primary)' : 'var(--text-tertiary)', opacity: togglingId === c.id ? 0.4 : 1 }}
                    >
                      {c.is_active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                    </button>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{
                        background: c.is_active ? 'rgba(16,185,129,.15)' : 'var(--bg-tertiary)',
                        color: c.is_active ? '#10B981' : 'var(--text-tertiary)',
                      }}
                    >
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                    {confirmDeleteId === c.id ? (
                      <div className="flex gap-1 items-center">
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
                          style={{ color: 'var(--text-tertiary)' }}>Batal</button>
                        <button onClick={() => deleteCampaign(c.id)}
                          className="rounded px-2 py-1 text-xs font-semibold text-white"
                          style={{ background: '#EF4444' }}>Hapus</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(c.id)}
                        className="ml-1 opacity-50 hover:opacity-100 transition-opacity"
                        style={{ color: 'var(--color-error, #ef4444)' }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
