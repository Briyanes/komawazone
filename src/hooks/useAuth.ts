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
        .select('vip_expires_at, role')
        .eq('id', session.user.id)
        .single();
      const userData = data as { vip_expires_at?: string | null; role?: string } | null;
      const vipExpiresAt = userData?.vip_expires_at ?? null;
      base.vipExpiresAt = vipExpiresAt;
      base.isVip = !!vipExpiresAt && new Date(vipExpiresAt) > new Date();

      // Update user metadata with role
      if (userData?.role) {
        base.user = {
          ...session.user,
          user_metadata: {
            ...session.user.user_metadata,
            role: userData.role,
          },
        };
      }
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
