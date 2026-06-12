import { createClient } from '@/lib/supabase/server';
import { SubscriptionsClient } from '@/components/admin/SubscriptionsClient';

export default async function AdminSubscriptionsPage() {
  const supabase = await createClient();

  const { data: subscriptions } = await supabase
    .from('subscriptions')
    .select('*, users(email, username)')
    .order('created_at', { ascending: false })
    .limit(100);

  return <SubscriptionsClient initialSubscriptions={subscriptions ?? []} />;
}