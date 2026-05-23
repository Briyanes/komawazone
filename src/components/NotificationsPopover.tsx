'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Bell, X, BookOpen, MessageSquare, Heart, Crown } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/cn';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  manga_id: string | null;
  chapter_id: string | null;
  read: boolean;
  created_at: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  new_chapter: <BookOpen size={14} />,
  chapter_reply: <MessageSquare size={14} />,
  chapter_like: <Heart size={14} />,
  vip_expiring: <Crown size={14} />,
  vip_expired: <Crown size={14} />,
  manga_recommendation: <BookOpen size={14} />,
};

export function NotificationsPopover() {
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/user/notifications?limit=10');
      const json = await res.json() as { status: string; data?: Notification[]; unreadCount?: number };
      if (json.status === 'success') {
        setNotifications(json.data ?? []);
        setUnreadCount(json.unreadCount ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const markAsRead = async (ids?: string[]) => {
    try {
      await fetch('/api/v1/user/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({
          ...n,
          read: ids ? ids.includes(n.id) : true,
        }))
      );
      setUnreadCount(0);
    } catch (err) {
      console.error('Failed to mark as read:', err);
    }
  };

  // Fetch on mount and when popover opens
  useEffect(() => {
    if (isAuthenticated) fetchNotifications();
  }, [isAuthenticated, fetchNotifications]);

  // Poll for new notifications every 30 seconds
  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated, fetchNotifications]);

  if (!isAuthenticated) return null;

  return (
    <div className="relative">
      {/* Bell icon button */}
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) fetchNotifications();
        }}
        className={cn(
          'flex items-center justify-center p-2 rounded-xl transition-colors',
          open ? 'bg-[var(--bg-tertiary)]' : 'hover:bg-[var(--bg-tertiary)]'
        )}
        style={{ color: 'var(--text-secondary)' }}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white"
            style={{ background: '#ef4444' }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />

          {/* Content */}
          <div
            className="absolute right-0 top-12 z-50 w-80 rounded-2xl shadow-2xl overflow-hidden"
            style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-light)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
              <h3 className="font-semibold" style={{ color: 'var(--text-primary)' }}>Notifikasi</h3>
              {notifications.length > 0 && (
                <button
                  onClick={() => markAsRead()}
                  className="text-xs font-medium hover:opacity-70"
                  style={{ color: 'var(--color-primary)' }}
                >
                  Tandai semua dibaca
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-96 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                  <div className="animate-spin rounded-full size-6 border-2 border-[var(--border-default)] border-t-[var(--color-primary)]" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center py-8" style={{ color: 'var(--text-tertiary)' }}>
                  <Bell size={32} className="opacity-30 mb-2" />
                  <p className="text-sm">Tidak ada notifikasi</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex gap-3 px-4 py-3 border-b transition-colors',
                      !n.read && 'bg-[var(--bg-tertiary)]'
                    )}
                    style={{ borderColor: 'var(--border-light)' }}
                  >
                    <div
                      className={cn(
                        'flex shrink-0 items-center justify-center size-8 rounded-full',
                        !n.read ? 'bg-[var(--color-primary)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                      )}
                    >
                      {typeIcons[n.type] ?? <Bell size={14} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {n.title}
                      </p>
                      <p className="text-xs line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {n.body}
                      </p>
                      {n.manga_id && (
                        <Link
                          href={`/manga/${n.chapter_id ? '' : n.manga_id}`}
                          onClick={() => {
                            markAsRead([n.id]);
                            setOpen(false);
                          }}
                          className="text-xs font-medium hover:underline"
                          style={{ color: 'var(--color-primary)' }}
                        >
                          Lihat →
                        </Link>
                      )}
                    </div>
                    <button
                      onClick={() => markAsRead([n.id])}
                      className="shrink-0 p-1 hover:opacity-70"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t text-center" style={{ borderColor: 'var(--border-light)' }}>
              <Link
                href="/notifications"
                onClick={() => setOpen(false)}
                className="text-xs font-medium hover:opacity-70"
                style={{ color: 'var(--text-tertiary)' }}
              >
                Lihat semua notifikasi
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
