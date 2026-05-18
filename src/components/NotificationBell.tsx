'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell, X, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  manga_id: string | null;
  chapter_id: string | null;
  read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { isAuthenticated } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const unread = notifications.filter(n => !n.read).length;

  const fetchNotifications = async () => {
    try {
      const res = await fetch('/api/v1/user/notifications?limit=20');
      if (!res.ok) return;
      const json = await res.json() as { data?: Notification[] };
      setNotifications(json.data ?? []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markAllRead = async () => {
    await fetch('/api/v1/user/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const markRead = async (id: string) => {
    await fetch('/api/v1/user/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [id] }),
    });
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen(p => !p)}
        className="relative flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-[var(--bg-tertiary)]"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span
            className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: 'var(--color-primary)', lineHeight: 1 }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl shadow-2xl"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            <div className="flex items-center gap-1">
              {unread > 0 && (
                <button onClick={markAllRead} className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ color: 'var(--color-primary)' }}>
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
              <button onClick={() => setOpen(false)} className="flex size-7 items-center justify-center rounded-lg hover:bg-[var(--bg-tertiary)]"
                style={{ color: 'var(--text-tertiary)' }}>
                <X size={14} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <Bell size={24} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>No notifications yet</p>
              </div>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { markRead(n.id); setOpen(false); }}
                  className="w-full px-4 py-3 text-left transition-colors hover:bg-[var(--bg-tertiary)]"
                  style={{ borderBottom: '1px solid var(--border-light)', background: n.read ? 'transparent' : 'rgba(255,107,53,0.04)' }}
                >
                  <div className="flex items-start gap-2.5">
                    {!n.read && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: 'var(--color-primary)' }} />
                    )}
                    <div className={`min-w-0 ${n.read ? '' : ''}`}>
                      <p className="text-xs font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>}
                      <p className="mt-1 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                        {new Date(n.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
