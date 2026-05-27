export async function uploadImage(file: File, path: string): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  body.append('folder', path);

  const res = await fetch('/api/v1/admin/storage/upload', {
    method: 'POST',
    body,
  });

  const data = await res.json() as {
    status: string;
    error?: string;
    data?: { url?: string };
  };

  if (!res.ok || data.status !== 'success' || !data.data?.url) {
    throw new Error(data.error ?? 'Upload failed');
  }

  return data.data.url;
}

export async function deleteImage(url: string): Promise<void> {
  await fetch('/api/v1/admin/storage/upload', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
}
