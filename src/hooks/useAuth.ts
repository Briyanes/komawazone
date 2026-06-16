'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isVip: boolean;
  vipExpiresAt: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    isLoading: true,
    isAuthenticated: false,
    isVip: false,
    vipExpiresAt: null,
  });

  const supabase = createClient();

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Hard redirect to home — clears all cookies, session, and cached state
    window.location.href = '/';
  }, [supabase]);

  async function applySession(session: Session | null) {
    const base: AuthState = {
      user: session?.user ?? null,
      session,
      isLoading: false,
      isAuthenticated: !!session?.user,
      isVip: false,
      vipExpiresAt: null,
    };
    if (session?.user) {
      const { data } = await supabase
        .from('users')
        .select('vip_expires_at, role, username, avatar_url')
        .eq('id', session.user.id)
        .single();
      const userData = data as { vip_expires_at?: string | null; role?: string; username?: string | null; avatar_url?: string | null } | null;
      const vipExpiresAt = userData?.vip_expires_at ?? null;
      base.vipExpiresAt = vipExpiresAt;
      base.isVip = !!vipExpiresAt && new Date(vipExpiresAt) > new Date();

      // Merge DB profile data (username, avatar_url, role) into user_metadata
      // This fixes: Google OAuth users have no 'username' in metadata → "@User" in header
      base.user = {
        ...session.user,
        user_metadata: {
          ...session.user.user_metadata,
          // Prefer DB username, then Google name/full_name, then email prefix
          username: userData?.username
            ?? session.user.user_metadata?.username
            ?? session.user.user_metadata?.name
            ?? session.user.user_metadata?.full_name
            ?? session.user.email?.split('@')[0]
            ?? 'User',
          // Prefer DB avatar_url (if set), then OAuth provider avatar
          avatar_url: userData?.avatar_url ?? session.user.user_metadata?.avatar_url ?? null,
          role: userData?.role ?? session.user.user_metadata?.role,
        },
      };
    }
    setState(base);
  }

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      void applySession(session);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void applySession(session);
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    ...state,
    signOut,
  };
}
