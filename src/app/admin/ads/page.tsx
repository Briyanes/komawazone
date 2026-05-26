import { createClient } from '@/lib/supabase/server';
import { AdsManager } from '@/components/admin/AdsManager';

export default async function AdminAdsPage() {
  const supabase = await createClient();
  const [providersRes, zonesRes, campaignsRes] = await Promise.all([
    supabase.from('ad_providers').select('*').order('created_at', { ascending: false }),
    supabase.from('ad_zones').select('*').order('created_at', { ascending: false }),
    supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
  ]);

  const errorMsg = providersRes.error?.message ?? zonesRes.error?.message ?? campaignsRes.error?.message;
  if (errorMsg) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl py-16" style={{ background: 'var(--bg-secondary)' }}>
        <span className="text-4xl opacity-20">⚠️</span>
        <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Gagal memuat data iklan: {errorMsg}</p>
      </div>
    );
  }

  return (
    <AdsManager
      providers={providersRes.data ?? []}
      zones={zonesRes.data ?? []}
      campaigns={campaignsRes.data ?? []}
    />
  );
}
