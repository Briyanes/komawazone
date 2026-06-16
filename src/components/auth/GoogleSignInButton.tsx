'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CredentialResponse } from '@/types/google-gis';

/**
 * Direct Google Sign-In using Google Identity Services (GIS).
 *
 * Unlike supabase.auth.signInWithOAuth(), this flow runs entirely from
 * our domain — Google's consent screen shows "olluq.com", not "supabase.co".
 *
 * Flow:
 *   1. GIS library opens Google consent popup (origin: our domain)
 *   2. Google returns a credential (JWT ID token) directly to our JS
 *   3. We exchange it with Supabase via signInWithIdToken()
 */
export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

  const handleCredentialResponse = useCallback(
    async (response: CredentialResponse) => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: response.credential,
        });

        if (error) {
          onError?.(error.message);
          return;
        }

        // Check if user is admin → redirect to admin dashboard
        if (data.user) {
          const { data: profile } = await supabase
            .from('users')
            .select('role')
            .eq('id', data.user.id)
            .single();

          if (profile?.role === 'ADMIN') {
            router.push('/admin');
            router.refresh();
            return;
          }
        }

        router.push('/');
        router.refresh();
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Google login gagal');
      }
    },
    [router, onError]
  );

  useEffect(() => {
    if (!clientId) return;

    // If already loaded, just initialize
    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    // Load the GIS script
    const existingScript = document.querySelector(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existingScript) {
      existingScript.addEventListener('load', initGoogle);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGoogle;
    document.head.appendChild(script);

    function initGoogle() {
      if (!window.google?.accounts?.id || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: handleCredentialResponse,
        cancel_on_tap_outside: false,
      });

      // Render Google's official button
      window.google.accounts.id.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 340,
        locale: 'id',
      });

      setScriptLoaded(true);
    }

    return () => {
      // Clean up: disable One Tap if it was shown
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, handleCredentialResponse]);

  // If no client ID configured, don't render (caller should show fallback)
  if (!clientId) return null;

  return (
    <div className="flex w-full justify-center">
      <div ref={buttonRef} data-testid="google-signin-button" />
      {!scriptLoaded && (
        <div
          className="flex items-center justify-center rounded-full border px-4 py-2.5 text-sm font-medium"
          style={{
            width: 340,
            height: 44,
            borderColor: 'var(--border-medium)',
            background: 'var(--bg-secondary)',
            color: 'var(--text-tertiary)',
          }}
        >
          Memuat Google...
        </div>
      )}
    </div>
  );
}