'use client';

import { useState, useEffect, useTransition } from 'react';
import Image from 'next/image';
import { User, Edit3, Save, X, LogOut, BookOpen, Bookmark, Heart } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { signOut } from '@/lib/auth/actions';
import { useRouter } from 'next/navigation';

interface UserProfile {
  id: string;
  email: string;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  role: string;
  created_at: string;
}

interface Stats {
  bookmarks: number;
  reading: number;
  likes: number;
}

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<Stats>({ bookmarks: 0, reading: 0, likes: 0 });
  const [isEditing, setIsEditing] = useState(false);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saveError, setSaveError] = useState('');
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const [profileRes, bmRes, progressRes] = await Promise.all([
        fetch('/api/v1/user/profile'),
        fetch('/api/v1/user/bookmarks'),
        fetch('/api/v1/user/progress'),
      ]);
      const profileData = await profileRes.json() as { status: string; data: UserProfile };
      const bmData = await bmRes.json() as { status: string; data: unknown[] };
      const progressData = await progressRes.json() as { status: string; data: unknown[] };

      if (profileData.status === 'success') {
        setProfile(profileData.data);
        setUsername(profileData.data.username ?? '');
        setBio(profileData.data.bio ?? '');
      }
      setStats({
        bookmarks: bmData.data?.length ?? 0,
        reading: progressData.data?.length ?? 0,
        likes: 0,
      });
    })();
  }, [user]);

  const handleSave = () => {
    setSaveError('');
    startTransition(async () => {
      const res = await fetch('/api/v1/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username || undefined, bio: bio || undefined }),
      });
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'success') {
        setProfile(prev => prev ? { ...prev, username, bio } : prev);
        setIsEditing(false);
      } else {
        setSaveError(typeof data.error === 'string' ? data.error : 'Save failed');
      }
    });
  };

  if (isLoading || !profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-4">
        <div className="h-24 w-24 rounded-full skeleton mx-auto" />
        <div className="h-6 w-40 rounded skeleton mx-auto" />
        <div className="h-4 w-64 rounded skeleton mx-auto" />
      </div>
    );
  }

  const displayName = profile.username || profile.email.split('@')[0];
  const joinedYear = new Date(profile.created_at).getFullYear();

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 space-y-6">
      {/* Header card */}
      <div
        className="rounded-2xl p-6 text-center space-y-3"
        style={{ background: 'var(--bg-secondary)' }}
      >
        {/* Avatar */}
        <div className="flex justify-center">
          {profile.avatar_url ? (
            <div className="relative size-24 rounded-full overflow-hidden ring-4 ring-[var(--color-primary)] ring-offset-2">
              <Image src={profile.avatar_url} alt={displayName} fill className="object-cover" />
            </div>
          ) : (
            <Avatar
              fallback={displayName}
              className="size-24 text-2xl ring-4 ring-[var(--color-primary)] ring-offset-2"
            />
          )}
        </div>

        {/* Name & meta */}
        {isEditing ? (
          <div className="space-y-3 text-left">
            <Input
              label="Username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter username"
            />
            <div className="space-y-1">
              <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                Bio
              </label>
              <textarea
                value={bio}
                onChange={e => setBio(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Tell readers about yourself..."
                className="w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
                style={{
                  background: 'var(--bg-primary)',
                  borderColor: 'var(--border-default)',
                  color: 'var(--text-primary)',
                }}
              />
              <p className="text-right text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {bio.length}/300
              </p>
            </div>
            {saveError && (
              <p className="text-xs text-red-500">{saveError}</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleSave} isLoading={isPending} size="sm" className="flex-1">
                <Save size={14} /> Save
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>
                <X size={14} /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {displayName}
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {profile.email} · Member since {joinedYear}
              </p>
            </div>
            {profile.bio && (
              <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
                {profile.bio}
              </p>
            )}
            <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
              <Edit3 size={14} /> Edit Profile
            </Button>
          </>
        )}
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-secondary)' }}
      >
        {[
          { icon: <Bookmark size={18} />, label: 'Bookmarks', value: stats.bookmarks },
          { icon: <BookOpen size={18} />, label: 'Reading', value: stats.reading },
          { icon: <Heart size={18} />, label: 'Likes', value: stats.likes },
        ].map((stat, i) => (
          <div
            key={stat.label}
            className="flex flex-col items-center gap-1 py-4"
            style={{ borderRight: i < 2 ? '1px solid var(--border-light)' : 'none' }}
          >
            <span style={{ color: 'var(--color-primary)' }}>{stat.icon}</span>
            <span className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {stat.value}
            </span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {stat.label}
            </span>
          </div>
        ))}
      </div>

      {/* Account info */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-secondary)' }}
      >
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border-light)' }}>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Account
          </h2>
        </div>
        <div className="divide-y" style={{ '--tw-divide-opacity': 1 } as React.CSSProperties}>
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <User size={16} style={{ color: 'var(--color-primary)' }} />
              <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Role</span>
            </div>
            <span
              className="text-xs font-medium px-2 py-0.5 rounded-full"
              style={{
                background: profile.role === 'ADMIN' ? 'var(--color-primary)' : 'var(--bg-tertiary)',
                color: profile.role === 'ADMIN' ? 'white' : 'var(--text-secondary)',
              }}
            >
              {profile.role}
            </span>
          </div>
        </div>
      </div>

      {/* Sign out */}
      <form action={signOut}>
        <Button variant="ghost" type="submit" className="w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20">
          <LogOut size={16} /> Sign Out
        </Button>
      </form>
    </div>
  );
}
