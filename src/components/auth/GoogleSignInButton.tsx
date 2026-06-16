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
 *
 * NOTE: We render Google's official GIS button in a visually-hidden container
 * and overlay our own styled button that matches Discord/X OAuth buttons.
 */
export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const router = useRouter();
  const hiddenButtonRef = useRef<HTMLDivElement>(null);
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

        if (data.user) {
          // Decode JWT payload to get Google profile data (name, picture, email)
          const payload = JSON.parse(
            atob(response.credential.split('.')[1])
          ) as { name?: string; picture?: string; email?: string };

          // Upsert user row with avatar_url + username from Google
          // This ensures the DB has the avatar even though GIS doesn't trigger handle_new_user()
          await supabase.from('users').upsert(
            {
              id: data.user.id,
              email: data.user.email ?? payload.email ?? '',
              username: payload.name ?? data.user.email?.split('@')[0] ?? 'User',
              avatar_url: payload.picture ?? null,
            },
            { onConflict: 'id' }
          );

          // Check if user is admin → redirect to admin dashboard
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
      if (!window.google?.accounts?.id || !hiddenButtonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: clientId!,
        callback: handleCredentialResponse,
        cancel_on_tap_outside: false,
      });

      // Render Google's official button into the HIDDEN container
      window.google.accounts.id.renderButton(hiddenButtonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        width: 400,
        locale: 'id',
      });

      setScriptLoaded(true);
    }

    return () => {
      // Clean up: disable One Tap if it was shown
      window.google?.accounts?.id?.cancel();
    };
  }, [clientId, handleCredentialResponse]);

  // Trigger the hidden GIS button click
  const handleClick = useCallback(() => {
    const hiddenBtn = hiddenButtonRef.current;
    if (!hiddenBtn) return;
    const clickable = hiddenBtn.querySelector('div[role="button"]') as HTMLElement | null;
    if (clickable) {
      clickable.click();
    }
  }, []);

  // If no client ID configured, don't render (caller should show fallback)
  if (!clientId) return null;

  return (
    <div className="relative w-full">
      {/* Hidden GIS button — Google renders its button here; we click it programmatically */}
      <div
        ref={hiddenButtonRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '1px',
          height: '1px',
          overflow: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
        }}
      />

      {/* Our custom button — matches Discord/X OAuthButtons styling */}
      <button
        type="button"
        onClick={handleClick}
        disabled={!scriptLoaded}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-80 disabled:cursor-wait"
        style={{
          borderColor: 'var(--border-medium)',
          background: 'var(--bg-secondary)',
          color: 'var(--text-primary)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        {scriptLoaded ? 'Lanjutkan dengan Google' : 'Memuat…'}
      </button>
    </div>
  );
}