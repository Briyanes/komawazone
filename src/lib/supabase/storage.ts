import { createClient } from './client';

export async function uploadImage(file: File, path: string): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.split('.').pop();
  const fileName = `${path}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('manga-images')
    .upload(fileName, file, { cacheControl: '3600', upsert: false });

  if (error) throw new Error(`Upload failed: ${error.message}`);
  if (!data) throw new Error('Upload failed: No data returned');

  const { data: { publicUrl } } = supabase.storage
    .from('manga-images')
    .getPublicUrl(data.path);

  return publicUrl;
}

export async function deleteImage(url: string): Promise<void> {
  const supabase = createClient();
  
  // Extract path from URL
  const urlParts = url.split('/manga-images/');
  if (urlParts.length < 2) return;
  
  const path = urlParts[1];
  
  await supabase.storage
    .from('manga-images')
    .remove([path]);
}
