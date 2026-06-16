import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    // Create a response so we can set cookies on it
    const response = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const { data: authData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && authData.user) {
      // Sync avatar_url + username from OAuth metadata to DB
      // This ensures the profile avatar is always up-to-date after OAuth login
      const md = authData.user.user_metadata ?? {};
      const oauthAvatar = md.avatar_url ?? md.picture ?? null;
      const oauthName = md.name ?? md.full_name ?? md.username ?? null;

      if (oauthAvatar || oauthName) {
        await supabase.from('users').upsert(
          {
            id: authData.user.id,
            email: authData.user.email ?? '',
            ...(oauthName && { username: oauthName }),
            ...(oauthAvatar && { avatar_url: oauthAvatar }),
          },
          { onConflict: 'id' }
        );
      }

      // Check if user is admin → redirect to admin dashboard
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', authData.user.id)
        .single();

      if (profile?.role === 'ADMIN') {
        const adminResponse = NextResponse.redirect(`${origin}/admin`);
        // Copy session cookies to admin redirect response
        response.cookies.getAll().forEach((c) => {
          adminResponse.cookies.set(c.name, c.value);
        });
        return adminResponse;
      }
      return response;
    }

    // Log the actual error for debugging
    const errMsg = error?.message || 'Unknown error';
    console.error('[auth/callback] exchangeCodeForSession error:', errMsg);
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errMsg)}`);
  }

  return NextResponse.redirect(`${origin}/login?error=no_code`);
}