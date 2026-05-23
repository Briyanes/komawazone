import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Asserts that the current user is an admin.
 * Returns the user if admin, null otherwise.
 */
export async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'ADMIN') return null;
  return user;
}

/**
 * Returns a standardized forbidden response for admin routes.
 */
export function forbiddenResponse(message: string = 'Forbidden') {
  return NextResponse.json(
    { status: 'error', error: message } as const,
    { status: 403 }
  );
}

/**
 * Returns a standardized unauthorized response.
 */
export function unauthorizedResponse(message: string = 'Unauthorized') {
  return NextResponse.json(
    { status: 'error', error: message } as const,
    { status: 401 }
  );
}

/**
 * Returns a standardized error response.
 */
export function errorResponse(message: string, status: number = 500) {
  return NextResponse.json(
    { status: 'error', error: message } as const,
    { status }
  );
}

/**
 * Validates that the current user is authenticated.
 * Returns the user if authenticated, null otherwise.
 */
export async function assertAuthenticated(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
}
