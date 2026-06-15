import { createClient } from '@/lib/supabase/server';
import { AdRenderer } from './AdRenderer';

type AdPlacement =
  | 'HOME_TOP'
  | 'HOME_MID'
  | 'HOME_BOTTOM'
  | 'MANGA_DETAIL_TOP'
  | 'MANGA_DETAIL_SIDEBAR'
  | 'READER_TOP'
  | 'READER_BETWEEN'
  | 'READER_BOTTOM'
  | 'SEARCH_TOP';

interface AdZoneProps {
  placement: AdPlacement;
  className?: string;
}

interface ActiveCampaign {
  id: string;
  type: string;
  html_content: string | null;
  image_url: string | null;
  link_url: string | null;
  priority: number;
  target_mobile: boolean;
  target_desktop: boolean;
  ad_zones: {
    placement: string;
    is_active: boolean;
  } | null;
}

export async function AdZone({ placement, className }: AdZoneProps) {
  const supabase = await createClient();

  // VIP users get ad-free experience
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const { data: userRow } = await supabase
      .from('users')
      .select('role, vip_expires_at')
      .eq('id', user.id)
      .single();
    const row = userRow as { role?: string | null; vip_expires_at?: string | null } | null;
    if (row?.role === 'ADMIN') return null;
    const exp = row?.vip_expires_at;
    if (exp && new Date(exp) > new Date()) return null;
  }

  const now = new Date().toISOString();

  const { data } = await supabase
    .from('ad_campaigns')
    .select(`
      id,
      type,
      html_content,
      image_url,
      link_url,
      priority,
      target_mobile,
      target_desktop,
      ad_zones!inner(placement, is_active)
    `)
    .eq('is_active', true)
    .eq('ad_zones.is_active', true)
    .eq('ad_zones.placement', placement)
    .or(`start_date.is.null,start_date.lte.${now}`)
    .or(`end_date.is.null,end_date.gte.${now}`)
    .order('priority', { ascending: false })
    .limit(1);

  const campaign = (data as unknown as ActiveCampaign[] | null)?.[0];
  if (!campaign) return null;

  return (
    <AdRenderer
      campaignId={campaign.id}
      type={campaign.type as 'BANNER' | 'PIXEL' | 'CUSTOM_HTML' | 'NATIVE'}
      htmlContent={campaign.html_content}
      imageUrl={campaign.image_url}
      linkUrl={campaign.link_url}
      placement={placement}
      className={className}
    />
  );
}
