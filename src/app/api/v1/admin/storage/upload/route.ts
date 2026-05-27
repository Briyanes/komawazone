import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { deleteObjectFromR2, extractR2ObjectKey, uploadBufferToR2 } from '@/lib/storage/r2';

export const runtime = 'nodejs';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const ALLOWED_FOLDERS = new Set(['covers', 'banners', 'pages', 'thumbnails', 'imports']);

async function assertAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'ADMIN') return null;
  return user;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const adminUser = await assertAdmin(supabase);
  if (!adminUser) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  try {
    const adminSupabase = createAdminClient();
    const formData = await request.formData();
    const folder = String(formData.get('folder') ?? 'uploads');
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ status: 'error', error: 'File is required' }, { status: 400 });
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json({ status: 'error', error: 'Folder not allowed' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ status: 'error', error: 'Only image uploads are allowed' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ status: 'error', error: 'File too large (max 20MB)' }, { status: 413 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const { key, url } = await uploadBufferToR2({
      buffer: Buffer.from(arrayBuffer),
      contentType: file.type || 'application/octet-stream',
      fileName: file.name,
      folder,
    });

    const { error: metadataError } = await adminSupabase
      .from('file_assets')
      .insert({
        provider: 'cloudflare_r2',
        bucket: process.env.R2_BUCKET!,
        object_key: key,
        public_url: url,
        folder,
        file_name: file.name,
        content_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        uploaded_by: adminUser.id,
        metadata: {
          original_last_modified: file.lastModified,
        },
      });

    if (metadataError) {
      await deleteObjectFromR2(key);
      throw new Error(`Failed to store file metadata: ${metadataError.message}`);
    }

    return NextResponse.json({ status: 'success', data: { key, url } });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}

const DeleteSchema = z.object({
  key: z.string().min(1).optional(),
  url: z.string().url().optional(),
}).refine((input) => Boolean(input.key || input.url), {
  message: 'Either key or url is required',
});

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  if (!await assertAdmin(supabase)) {
    return NextResponse.json({ status: 'error', error: 'Forbidden' }, { status: 403 });
  }

  try {
    const adminSupabase = createAdminClient();
    const body = await request.json() as unknown;
    const parsed = DeleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ status: 'error', error: parsed.error.flatten() }, { status: 400 });
    }

    const resolvedKey = parsed.data.key ?? extractR2ObjectKey(parsed.data.url!);
    if (!resolvedKey) {
      return NextResponse.json({ status: 'error', error: 'Could not resolve file key' }, { status: 400 });
    }

    await deleteObjectFromR2(resolvedKey);

    await adminSupabase
      .from('file_assets')
      .update({ deleted_at: new Date().toISOString() })
      .eq('object_key', resolvedKey)
      .is('deleted_at', null);

    return NextResponse.json({ status: 'success' });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    );
  }
}
