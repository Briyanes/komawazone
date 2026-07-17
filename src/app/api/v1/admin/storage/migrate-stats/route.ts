import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

import { createServiceClient } from '@/lib/supabase/service';
/**
 * GET /api/v1/admin/storage/migrate-stats
 *
 * Returns statistics about R2 migration progress:
 *   - total images, already in R2, still external, failed
 *   - estimated time to complete
 */

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const serviceClient = createServiceClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await serviceClient
    .from('users').select('role').eq('id', user.id).single();
  return profile?.role === 'ADMIN' ? user : null;
}

export async function GET() {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    // Total chapter_images
    const { count: total } = await supabase
      .from('chapter_images')
      .select('*', { count: 'exact', head: true });

    // Already in R2 (proxied path)
    const { count: inR2 } = await supabase
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .like('url', '/api/r2/image/%');

    // External CDN URLs (gmbr.pro, manhwaland, etc.)
    const { count: external } = await supabase
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .like('url', 'https://%');

    const { count: externalHttp } = await supabase
      .from('chapter_images')
      .select('*', { count: 'exact', head: true })
      .like('url', 'http://%');

    const totalExternal = (external ?? 0) + (externalHttp ?? 0);

    // Manga covers (non-deleted with external URLs)
    const { count: coversTotal } = await supabase
      .from('manga')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .like('cover_url', 'https://%');

    // Estimate: ~20 images/min at concurrency 20 with 10 proxies
    const estimatedMinutes = Math.ceil(totalExternal / 20);
    const totalImages = total ?? 0;
    const r2Images = inR2 ?? 0;

    return NextResponse.json({
      chapter_images: {
        total: totalImages,
        inR2: r2Images,
        external: totalExternal,
        migrationProgress: totalImages > 0 ? ((r2Images / totalImages) * 100).toFixed(1) : '0',
      },
      manga_covers: {
        external: coversTotal ?? 0,
      },
      estimate: {
        imagesRemaining: totalExternal,
        estimatedMinutes,
      },
      script: 'node scripts/download-to-r2-massive.mjs',
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}