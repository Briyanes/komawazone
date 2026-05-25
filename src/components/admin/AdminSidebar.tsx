'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, BookOpen, FileText, Megaphone, BarChart2,
  Settings, X, ArrowLeft, Zap, MessageCircle, Flag, Users, Tag, Download, Crown, Globe,
} from 'lucide-react';
import { cn } from '@/lib/cn';

const navGroups = [
  {
    label: 'Content',
    items: [
      { href: '/admin',          icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/admin/manga',    icon: BookOpen,         label: 'Manga' },
      { href: '/admin/chapters', icon: FileText,         label: 'Chapters' },
      { href: '/admin/genres',   icon: Tag,              label: 'Genres' },
      { href: '/admin/import',   icon: Download,         label: 'Import URL' },
      { href: '/admin/sources',  icon: Globe,            label: 'Sumber Manga' },
    ],
  },
  {
    label: 'Community',
    items: [
      { href: '/admin/comments', icon: MessageCircle, label: 'Comments' },
      { href: '/admin/reports',  icon: Flag,          label: 'Reports' },
      { href: '/admin/users',    icon: Users,         label: 'Users' },
    ],
  },
  {
    label: 'Monetization',
    items: [
      { href: '/admin/ads',           icon: Megaphone, label: 'Ads'           },
      { href: '/admin/subscriptions', icon: Crown,     label: 'Subscriptions' },
      { href: '/admin/stats',         icon: BarChart2, label: 'Analytics'     },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/admin/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

interface AdminSidebarProps {
  open: boolean;
  onClose: () => void;
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div
        className="flex h-14 shrink-0 items-center gap-2.5 border-b px-4"
        style={{ borderColor: 'var(--border-light)' }}
      >
        <div
          className="flex size-7 items-center justify-center rounded-lg"
          style={{ background: 'var(--color-primary)' }}
        >
          <Zap size={14} className="text-white" />
        </div>
        <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
          OLLUQ
        </span>
        <span
          className="ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}
        >
          Admin
        </span>
        {onClose && (
          <button onClick={onClose} className="ml-1 lg:hidden" style={{ color: 'var(--text-tertiary)' }}>
            <X size={18} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-2.5 space-y-4">
        {navGroups.map(group => (
          <div key={group.label}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-widest"
              style={{ color: 'var(--text-tertiary)' }}>
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-150',
                      isActive
                        ? 'shadow-sm'
                        : 'hover:bg-[var(--bg-tertiary)]'
                    )}
                    style={isActive
                      ? { background: 'var(--color-primary)', color: 'white' }
                      : { color: 'var(--text-secondary)' }
                    }
                  >
                    <item.icon size={16} className="shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t p-2.5" style={{ borderColor: 'var(--border-light)' }}>
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-[var(--bg-tertiary)]"
          style={{ color: 'var(--text-tertiary)' }}
        >
          <ArrowLeft size={14} />
          Back to Site
        </Link>
      </div>
    </div>
  );
}

export function AdminSidebar({ open, onClose }: AdminSidebarProps) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'var(--overlay)' }}
          onClick={onClose}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 border-r transition-transform duration-300 ease-in-out lg:hidden',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        <SidebarContent onClose={onClose} />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden w-60 border-r lg:flex lg:flex-col"
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-light)' }}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
