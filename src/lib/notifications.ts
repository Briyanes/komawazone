/**
 * Notification helper functions
 */

import { createClient } from './supabase/server';

export type NotificationType =
  | 'new_chapter'        // New chapter released for bookmarked manga
  | 'chapter_reply'      // Someone replied to comment
  | 'chapter_like'       // Someone liked comment
  | 'vip_expiring'       // VIP subscription expiring soon
  | 'vip_expired'        // VIP subscription expired
  | 'manga_recommendation'; // New manga recommendation

interface SendNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  mangaId?: string;
  chapterId?: string;
}

/**
 * Send a notification to a user
 * Call this from server-side code (API routes, cron jobs, etc.)
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  const supabase = await createClient();

  await supabase.from('notifications').insert({
    user_id: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    manga_id: params.mangaId ?? null,
    chapter_id: params.chapterId ?? null,
    read: false,
  });
}

/**
 * Send notification to all users who bookmarked a manga
 */
export async function notifyBookmarkedUsers(params: {
  mangaId: string;
  mangaTitle: string;
  mangaSlug: string;
  chapterNumber: number;
  chapterId: string;
}): Promise<void> {
  const supabase = await createClient();

  // Get all users who bookmarked this manga
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select('user_id')
    .eq('manga_id', params.mangaId);

  if (!bookmarks || bookmarks.length === 0) return;

  // Send notification to each user
  const notifications = bookmarks.map((b) => ({
    userId: b.user_id,
    type: 'new_chapter' as const,
    title: `Chapter ${params.chapterNumber} rilis!`,
    body: `${params.mangaTitle} chapter ${params.chapterNumber} sudah tersedia.`,
    mangaId: params.mangaId,
    chapterId: params.chapterId,
  }));

  // Batch insert notifications
  await supabase.from('notifications').insert(
    notifications.map((n) => ({
      user_id: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      manga_id: n.mangaId,
      chapter_id: n.chapterId,
      read: false,
    }))
  );
}

/**
 * Mark specific notification as read
 */
export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read: true } as never)
    .eq('id', notificationId);
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ read: true } as never)
    .eq('user_id', userId)
    .eq('read', false);
}
