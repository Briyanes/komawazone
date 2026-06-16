import { createClient } from '@/lib/supabase/server';

/**
 * Notification helpers — creates rows in the `notifications` table.
 *
 * Currently wired into:
 *   - check-new-chapters cron → notifies users who bookmarked a manga
 *
 * Future use cases:
 *   - Reply on user's comment
 *   - Like on user's comment
 *   - VIP subscription expiry warning
 *   - Admin announcements
 */

interface CreateNotificationInput {
  userId: string;
  type: 'new_chapter' | 'comment_reply' | 'comment_like' | 'vip_expiring' | 'announcement';
  title: string;
  body?: string;
  mangaId?: string;
  chapterId?: string;
}

export async function createNotification(input: CreateNotificationInput) {
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').insert({
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? null,
    manga_id: input.mangaId ?? null,
    chapter_id: input.chapterId ?? null,
    read: false,
  });
  if (error) {
    console.error('[notifications] insert failed:', input, error.message);
  }
  return !error;
}

/**
 * Notify all users who bookmarked a manga that new chapters were added.
 * Called from the check-new-chapters cron after a successful import.
 */
export async function notifyNewChapters(
  mangaId: string,
  mangaTitle: string,
  newChapterCount: number
) {
  const supabase = await createClient();

  // Find all users who bookmarked this manga
  const { data: bookmarks, error } = await supabase
    .from('reading_list')
    .select('user_id')
    .eq('manga_id', mangaId);

  if (error || !bookmarks || bookmarks.length === 0) return 0;

  const title = `Chapter baru: ${mangaTitle}`;
  const body = `${newChapterCount} chapter baru tersedia untuk dibaca!`;

  // Batch insert — one notification per user
  const rows = bookmarks.map((b) => ({
    user_id: b.user_id,
    type: 'new_chapter',
    title,
    body,
    manga_id: mangaId,
    chapter_id: null,
    read: false,
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) {
    console.error('[notifications] batch insert failed:', insertError.message);
    return 0;
  }

  console.log(`[notifications] Notified ${bookmarks.length} users about ${newChapterCount} new chapters for "${mangaTitle}"`);
  return bookmarks.length;
}