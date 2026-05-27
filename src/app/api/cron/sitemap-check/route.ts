import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseAllSitemaps } from '@/lib/scrapers/sitemap-parser';

/**
 * POST /api/cron/sitemap-check
 * Scheduled cron job to check sitemaps for new/updated manga
 * Runs every 6 hours to send smart notifications to admin
 *
 * CRON_SECRET must match for security
 */
export async function POST(req: NextRequest) {
  // Verify cron secret for security
  const authHeader = req.headers.get('authorization');
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createClient();

  try {
    console.log('[Sitemap Check] Starting scheduled check...');

    // Fetch sitemap URLs from manga_sources table
    const { data: sourcesData, error: sourcesError } = await supabase
      .from('manga_sources')
      .select('name, type, sitemap_urls')
      .eq('is_active', true);

    if (sourcesError) {
      throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    }

    const sitemapUrls: string[] = (sourcesData ?? []).flatMap(
      (s: { sitemap_urls: string[] }) => s.sitemap_urls ?? []
    );

    if (sitemapUrls.length === 0) {
      return NextResponse.json({ success: true, message: 'No active sources configured' });
    }

    console.log(`[Sitemap Check] Checking ${sitemapUrls.length} sitemaps from ${(sourcesData ?? []).length} sources`);

    const parseResult = await parseAllSitemaps(sitemapUrls, {
      timeout: 15000,
      includeLastmod: true,
    });

    console.log(`[Sitemap Check] Found ${parseResult.total} manga in sitemaps`);

    if (parseResult.total === 0) {
      return NextResponse.json({
        success: true,
        message: 'No manga found in sitemaps',
      });
    }

    // Get existing manga slugs from database
    const slugs = parseResult.mangas.map(m => m.slug);
    const { data: existingManga } = await supabase
      .from('manga')
      .select('slug, updated_at')
      .in('slug', slugs);

    const existingMap = new Map(
      (existingManga || []).map(m => [m.slug, new Date(m.updated_at).getTime()])
    );

    // Categorize manga
    const newManga: Array<{ title: string; url: string; slug: string; type: string }> = [];
    const updatedManga: Array<{ title: string; url: string; slug: string; lastModified: string }> = [];

    for (const manga of parseResult.mangas) {
      const existing = existingMap.get(manga.slug);

      if (!existing) {
        // New manga
        newManga.push({
          title: manga.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          url: manga.url,
          slug: manga.slug,
          type: 'MANHWA', // Default for manhwaland
        });
      } else if (manga.lastModified && manga.lastModified.getTime() > existing) {
        // Updated manga
        updatedManga.push({
          title: manga.slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          url: manga.url,
          slug: manga.slug,
          lastModified: manga.lastModified.toISOString(),
        });
      }
    }

    const newCount = newManga.length;
    const updatedCount = updatedManga.length;
    const existingCount = parseResult.total - newCount - updatedCount;

    console.log(`[Sitemap Check] Results: ${newCount} new, ${updatedCount} updated, ${existingCount} existing`);

    // Create notification digest
    const digest = {
      timestamp: new Date().toISOString(),
      totals: {
        new: newCount,
        updated: updatedCount,
        existing: existingCount,
      },
      newManga: newManga.slice(0, 20), // Limit to 20 for notification
      updatedManga: updatedManga.slice(0, 20),
      sitemapUrls,
    };

    // Only send notification if there are changes
    if (newCount > 0 || updatedCount > 0) {
      // Get admin users to notify
      const { data: adminUsers } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'ADMIN');

      if (adminUsers && adminUsers.length > 0) {
        // Create notifications for all admin users
        const notifications = adminUsers.map(admin => ({
          user_id: admin.id,
          type: 'SITEMAP_CHECK',
          title: `Sitemap Check: ${newCount} New, ${updatedCount} Updated`,
          body: JSON.stringify(digest),
          read: false,
        }));

        const { error: notificationError } = await supabase
          .from('notifications')
          .insert(notifications);

        if (notificationError) {
          console.error('[Sitemap Check] Failed to create notifications:', notificationError);
        } else {
          console.log(`[Sitemap Check] Notifications created for ${adminUsers.length} admins: ${newCount} new, ${updatedCount} updated`);
        }
      }
    } else {
      console.log('[Sitemap Check] No changes detected, skipping notification');
    }

    return NextResponse.json({
      success: true,
      data: {
        totals: digest.totals,
        message: newCount > 0 || updatedCount > 0
          ? `Found ${newCount} new and ${updatedCount} updated manga`
          : 'No changes detected',
      },
    });

  } catch (error) {
    console.error('[Sitemap Check] Error:', error);

    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Internal server error',
    }, { status: 500 });
  }
}