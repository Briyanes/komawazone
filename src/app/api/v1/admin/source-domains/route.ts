/**
 * GET  /api/v1/admin/source-domains         — List all domains (optionally ?source_id=)
 * POST /api/v1/admin/source-domains         — Add domain to a source
 * PATCH /api/v1/admin/source-domains         — Update domain (priority/status/re-enable)
 * DELETE /api/v1/admin/source-domains?id=... — Delete domain
 *
 * Separate from /sources to avoid breaking existing SourcesManager.tsx
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { assertAdmin } from '@/lib/auth/admin';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

async function requireAdmin() {
  const user = await assertAdmin();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return null;
}

// GET — List domains
export async function GET(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const sourceId = req.nextUrl.searchParams.get('source_id');
    let query = supabase.from('source_domains').select('*').order('priority');
    if (sourceId) query = query.eq('source_id', sourceId);

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ status: 'success', data: data || [] });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to fetch domains', detail: err.message }, { status: 500 });
  }
}

// POST — Add domain or health-check
export async function POST(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await req.json();

    // Health-check a domain
    if (body.action === 'check') {
      const { domain_id } = body;
      const { data: domain } = await supabase
        .from('source_domains')
        .select('domain')
        .eq('id', domain_id)
        .single();
      if (!domain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });

      const start = Date.now();
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(`https://${domain.domain}/`, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
        });
        clearTimeout(timer);

        const isHealthy = res.ok || res.status === 301 || res.status === 302;
        await supabase.from('source_domains').update({
          status: isHealthy ? 'healthy' : 'down',
          last_check: new Date().toISOString(),
          last_ok: isHealthy ? new Date().toISOString() : null,
        }).eq('id', domain_id);

        return NextResponse.json({
          status: 'success',
          domain: domain.domain,
          health: isHealthy ? 'healthy' : 'down',
          http_status: res.status,
          latency_ms: Date.now() - start,
        });
      } catch (err: any) {
        await supabase.from('source_domains').update({
          status: 'down',
          last_check: new Date().toISOString(),
          last_fail: new Date().toISOString(),
        }).eq('id', domain_id);
        return NextResponse.json({
          status: 'success',
          domain: domain.domain,
          health: 'down',
          error: err.message,
          latency_ms: Date.now() - start,
        });
      }
    }

    // Add domain
    const { source_id, domain, priority, requires_cf_bypass } = body;
    if (!source_id || !domain) {
      return NextResponse.json({ error: 'source_id and domain required' }, { status: 400 });
    }

    // Extract domain from URL if full URL given
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    const { data, error: insertError } = await supabase
      .from('source_domains')
      .insert({
        source_id,
        domain: cleanDomain,
        priority: priority || 10,
        requires_cf_bypass: !!requires_cf_bypass,
        status: 'unknown',
      })
      .select('*')
      .single();

    if (insertError) throw insertError;
    return NextResponse.json({ status: 'success', data });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed', detail: err.message }, { status: 500 });
  }
}

// PATCH — Update domain
export async function PATCH(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const body = await req.json();
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const updates: any = {};
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.status !== undefined) updates.status = body.status;
    if (body.requires_cf_bypass !== undefined) updates.requires_cf_bypass = body.requires_cf_bypass;
    if (body.re_enable) {
      updates.auto_disabled_at = null;
      updates.fail_count = 0;
      updates.status = 'unknown';
    }

    const { data, error } = await supabase
      .from('source_domains')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ status: 'success', data });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed', detail: err.message }, { status: 500 });
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    const id = req.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const { error } = await supabase.from('source_domains').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ status: 'success', deleted: true });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed', detail: err.message }, { status: 500 });
  }
}