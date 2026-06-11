import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { origin } = new URL(request.url);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin;

  // Collect cookies to set from Supabase
  const cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[] = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(setCookies) {
          cookiesToSet.push(...setCookies);
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as 'google' | 'twitter' | 'discord',
    options: {
      redirectTo: `${siteUrl}/api/v1/auth/callback`,
    },
  });

  if (error) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(error.message)}`
    );
  }

  if (data.url) {
    // Create response with redirect to OAuth provider
    const response = NextResponse.redirect(data.url);
    // Set PKCE cookies on the response
    for (const { name, value, options } of cookiesToSet) {
      response.cookies.set(name, value, options);
    }
    return response;
  }

  return NextResponse.redirect(`${origin}/login?error=no_url`);
}