'use client';

import { useState } from 'react';
import { Toaster } from 'sonner';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';

interface AdminShellProps {
  profile: {
    username: string | null;
    avatar_url: string | null;
    email: string;
    role: string;
  };
  children: React.ReactNode;
}

export function AdminShell({ profile, children }: AdminShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <AdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-1 flex-col lg:pl-60 min-w-0">
        <AdminHeader
          profile={profile}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-light)',
            color: 'var(--text-primary)',
          },
        }}
        closeButton
        richColors
      />
    </div>
  );
}
