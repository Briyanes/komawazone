import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

// Called by Vercel Cron every hour — revalidates the homepage cache
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization')?.replace('Bearer ', '');
  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  revalidatePath('/');
  revalidatePath('/search');

  return NextResponse.json({ revalidated: true, timestamp: new Date().toISOString() });
}
