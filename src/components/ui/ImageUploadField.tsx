'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, Link as LinkIcon, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface ImageUploadFieldProps {
  label: string;
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  hint?: string;
}

type Mode = 'url' | 'upload';

export function ImageUploadField({
  label,
  value,
  onChange,
  bucket = 'manga-images',
  folder = 'covers',
  hint,
}: ImageUploadFieldProps) {
  const [mode, setMode] = useState<Mode>('url');
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setUploadError('File harus berupa gambar (jpg, png, webp, dll)');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Ukuran file maksimal 5 MB');
      return;
    }

    setUploadError('');
    setUploading(true);
    setProgress(10);

    try {
      const supabase = createClient();
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      setProgress(40);
      const { error } = await supabase.storage
        .from(bucket)
        .upload(path, file, { upsert: false, contentType: file.type });

      if (error) {
        setUploadError(error.message);
        return;
      }

      setProgress(80);
      const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path);
      onChange(publicUrl);
      setProgress(100);
    } catch {
      setUploadError('Upload gagal. Coba lagi.');
    } finally {
      setUploading(false);
      setTimeout(() => setProgress(0), 600);
    }
  }, [bucket, folder, onChange]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);

  return (
    <div className="space-y-2">
      {/* Label + mode toggle */}
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {label}
        </label>
        <div
          className="flex rounded-lg p-0.5 text-xs"
          style={{ background: 'var(--bg-tertiary)' }}
        >
          <button
            type="button"
            onClick={() => setMode('url')}
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
            style={mode === 'url'
              ? { background: 'var(--bg-primary)', color: 'var(--text-primary)' }
              : { color: 'var(--text-tertiary)' }
            }
          >
            <LinkIcon size={11} /> URL
          </button>
          <button
            type="button"
            onClick={() => setMode('upload')}
            className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors"
            style={mode === 'upload'
              ? { background: 'var(--bg-primary)', color: 'var(--text-primary)' }
              : { color: 'var(--text-tertiary)' }
            }
          >
            <Upload size={11} /> Upload
          </button>
        </div>
      </div>

      {/* URL mode */}
      {mode === 'url' && (
        <input
          type="url"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="https://example.com/image.jpg"
          className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
      )}

      {/* Upload mode */}
      {mode === 'upload' && (
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={() => !uploading && fileRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            disabled={uploading}
            className="flex w-full flex-col items-center gap-2 rounded-xl border-2 border-dashed py-6 transition-colors"
            style={{
              borderColor: isDragging ? 'var(--color-primary)' : 'var(--border-medium)',
              background: isDragging ? 'rgba(255,107,53,0.05)' : 'var(--bg-primary)',
              cursor: uploading ? 'not-allowed' : 'pointer',
            }}
          >
            {uploading ? (
              <>
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  Uploading...
                </span>
                {/* Progress bar */}
                <div className="w-32 h-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%`, background: 'var(--color-primary)' }}
                  />
                </div>
              </>
            ) : (
              <>
                <Upload size={22} style={{ color: 'var(--text-tertiary)' }} />
                <div className="text-center">
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    Klik atau drag & drop
                  </p>
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    JPG, PNG, WEBP · Maks 5 MB
                  </p>
                </div>
              </>
            )}
          </button>

          {uploadError && (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>
              {uploadError}
            </p>
          )}
        </div>
      )}

      {/* Preview */}
      {value && (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Preview"
            className="h-28 w-20 rounded-lg object-cover border"
            style={{ borderColor: 'var(--border-light)' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Preview</p>
            <p className="truncate text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {value}
            </p>
            <button
              type="button"
              onClick={() => onChange('')}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--color-error)' }}
            >
              <X size={11} /> Hapus
            </button>
          </div>
        </div>
      )}

      {!value && !uploading && (
        <div
          className="flex h-28 w-20 items-center justify-center rounded-lg border"
          style={{ borderColor: 'var(--border-light)', background: 'var(--bg-tertiary)' }}
        >
          <ImageIcon size={20} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
        </div>
      )}

      {hint && (
        <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{hint}</p>
      )}
    </div>
  );
}
