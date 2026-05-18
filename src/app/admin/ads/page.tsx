import { createClient } from '@/lib/supabase/server';
import { AdsManager } from '@/components/admin/AdsManager';

export default async function AdminAdsPage() {
  const supabase = await createClient();
  const [providersRes, zonesRes, campaignsRes] = await Promise.all([
    supabase.from('ad_providers').select('*').order('created_at', { ascending: false }),
    supabase.from('ad_zones').select('*').order('created_at', { ascending: false }),
    supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false }),
  ]);

  return (
    <AdsManager
      providers={providersRes.data ?? []}
      zones={zonesRes.data ?? []}
      campaigns={campaignsRes.data ?? []}
    />
  );
}
