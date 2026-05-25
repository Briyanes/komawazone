'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Trash2, ImagePlus, Save, GripVertical, ExternalLink, Loader2, X } from 'lucide-react';
import { uploadImage } from '@/lib/supabase/storage';
import MangaImage from '@/components/ui/MangaImage';

interface PageImage {
  id: string;
  number: number;
  image_url: string;
  width: number;
  height: number;
  uploading?: boolean;
}

interface Props {
  chapterId: string;
  mangaSlug: string;
  initialNumber: number;
  initialTitle: string;
  initialReleaseDate?: string | null;
  initialThumbnailUrl?: string | null;
  initialImages: PageImage[];
}

export function ChapterEditClient({ chapterId, mangaSlug, initialNumber, initialTitle, initialReleaseDate, initialThumbnailUrl, initialImages }: Props) {
  const router = useRouter();
  const [number, setNumber] = useState(String(initialNumber));
  const [title, setTitle] = useState(initialTitle);
  const [releaseDate, setReleaseDate] = useState(
    initialReleaseDate ? initialReleaseDate.slice(0, 16) : ''
  );
  const [thumbnailUrl, setThumbnailUrl] = useState(initialThumbnailUrl ?? '');
  const [uploadingThumb, setUploadingThumb] = useState(false);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<PageImage[]>(initialImages);
  const [savePending, startSave] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploadingAny, setUploadingAny] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveMeta = () => {
    setError(''); setSuccess('');
    startSave(async () => {
      const res = await fetch(`/api/v1/admin/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: Number(number),
          title: title || null,
          thumbnail_url: thumbnailUrl || null,
          release_date: releaseDate || null,
        }),
      });
      const json = await res.json() as { status: string; error?: string };
      if (json.status === 'success') {
        setSuccess('Chapter saved!');
        router.refresh();
      } else {
        setError(json.error ?? 'Failed to save');
      }
    });
  };

  const handleDeletePage = (imageId: string) => {
    startSave(async () => {
      const res = await fetch(`/api/v1/admin/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_image', image_id: imageId }),
      });
      const json = await res.json() as { status: string };
      if (json.status === 'success') {
        setImages(prev =>
          prev.filter(img => img.id !== imageId).map((img, i) => ({ ...img, number: i + 1 }))
        );
      }
    });
  };

  const handleDeleteChapter = () => {
    if (!confirm('Delete this chapter and all its images? This cannot be undone.')) return;
    startDelete(async () => {
      const res = await fetch(`/api/v1/admin/chapters/${chapterId}`, { method: 'DELETE' });
      const json = await res.json() as { status: string };
      if (json.status === 'success') {
        router.push('/admin/chapters');
        router.refresh();
      }
    });
  };

  const handleThumbFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingThumb(true);
    try {
      const url = await uploadImage(file, 'thumbnails');
      setThumbnailUrl(url);
    } catch {
      // ignore
    } finally {
      setUploadingThumb(false);
      e.target.value = '';
    }
  };

  const handleNewFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB
    const validFiles = Array.from(files).filter(f => {
      if (!f.type.startsWith('image/')) { alert(`File "${f.name}" bukan gambar, dilewati.`); return false; }
      if (f.size > MAX_SIZE) { alert(`File "${f.name}" terlalu besar (maks 10 MB), dilewati.`); return false; }
      return true;
    });
    if (validFiles.length === 0) return;
    const fileArr = validFiles;
    const startNum = images.length + 1;
    const placeholders: PageImage[] = fileArr.map((_, i) => ({
      id: `new-${Date.now()}-${i}`,
      number: startNum + i,
      image_url: '',
      width: 0,
      height: 0,
      uploading: true,
    }));
    setImages(prev => [...prev, ...placeholders]);
    setUploadingAny(true);

    const uploaded: { image_url: string; number: number }[] = [];
    await Promise.all(fileArr.map(async (file, i) => {
      try {
        const url = await uploadImage(file, 'pages');
        const num = startNum + i;
        uploaded.push({ image_url: url, number: num });
        setImages(prev =>
          prev.map(img =>
            img.id === `new-${placeholders[i]?.id?.split('-').slice(1).join('-')}` || img.number === num && img.uploading
              ? { ...img, image_url: url, uploading: false }
              : img
          )
        );
      } catch {
        // remove placeholder on error
      }
    }));

    // Sync to server
    if (uploaded.length > 0) {
      await fetch(`/api/v1/admin/chapters/${chapterId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_images', images: uploaded }),
      });
      // Refresh to get server-assigned IDs
      router.refresh();
    }
    setUploadingAny(false);
  };

  return (
    <div className="space-y-6">
      {/* Meta section */}
      <div
        className="rounded-2xl p-5 space-y-4"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Chapter Info</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Number</label>
            <Input
              type="number"
              value={number}
              onChange={e => setNumber(e.target.value)}
              min={0}
              step={0.1}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Title (optional)</label>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. The Beginning"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Release Date <span style={{ color: 'var(--text-tertiary)' }}>(optional — leave blank to publish immediately)</span>
          </label>
          <Input
            type="datetime-local"
            value={releaseDate}
            onChange={e => setReleaseDate(e.target.value)}
          />
          {releaseDate && new Date(releaseDate) > new Date() && (
            <p className="text-xs" style={{ color: 'var(--color-warning, #F59E0B)' }}>
              ⏰ Scheduled — will be visible after {new Date(releaseDate).toLocaleString()}
            </p>
          )}
        </div>

        {/* Thumbnail */}
        <div className="space-y-2">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Thumbnail{' '}
            <span style={{ color: 'var(--text-tertiary)' }}>(opsional — otomatis pakai halaman ke-2 kalau kosong)</span>
          </label>
          <div className="flex gap-2 items-center">
            <input
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
              placeholder="Paste URL atau upload gambar…"
              className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            />
            <button
              type="button"
              onClick={() => thumbFileRef.current?.click()}
              disabled={uploadingThumb}
              className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50"
              style={{ background: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.25)' }}
            >
              <ImagePlus size={13} />
              {uploadingThumb ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={thumbFileRef} type="file" accept="image/*" className="hidden" onChange={handleThumbFile} />
          </div>
          {thumbnailUrl && (
            <div className="relative inline-block">
              <MangaImage src={thumbnailUrl} alt="thumbnail" width={100} height={68} className="rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => setThumbnailUrl('')}
                className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-white"
              >
                <X size={9} />
              </button>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}
        <div className="flex items-center gap-3 pt-1">
          <Button onClick={handleSaveMeta} isLoading={savePending} className="flex items-center gap-1.5">
            <Save size={14} /> Save Info
          </Button>
          <a
            href={`/manga/${mangaSlug}/chapter/${chapterId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
            style={{ color: 'var(--text-secondary)' }}
          >
            <ExternalLink size={14} /> Preview
          </a>
          <div className="flex-1" />
          <Button
            variant="secondary"
            onClick={handleDeleteChapter}
            isLoading={deletePending}
            className="flex items-center gap-1.5 !text-red-400 hover:!bg-red-500/10"
          >
            <Trash2 size={14} /> Delete Chapter
          </Button>
        </div>
      </div>

      {/* Pages section */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: 'var(--border-light)' }}
        >
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Pages ({images.length})
          </h3>
          <div className="flex items-center gap-2">
            {uploadingAny && <Loader2 size={14} className="animate-spin text-white/40" />}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-80"
              style={{ background: 'var(--color-primary)' }}
            >
              <ImagePlus size={13} /> Add Pages
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => handleNewFiles(e.target.files)}
            />
          </div>
        </div>

        {images.length === 0 ? (
          <div
            className="flex flex-col items-center gap-3 py-14 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={28} className="opacity-20" />
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Click to add pages</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border-light)' }}>
            {images.map((img) => (
              <div
                key={img.id}
                className="flex items-center gap-3 px-4 py-2"
              >
                <GripVertical size={14} className="shrink-0 opacity-20" />
                <span
                  className="w-8 shrink-0 text-center text-xs font-mono font-semibold"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {img.number}
                </span>
                {/* Thumbnail */}
                <div
                  className="h-14 w-10 shrink-0 rounded overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--bg-tertiary)' }}
                >
                  {img.uploading ? (
                    <Loader2 size={14} className="animate-spin opacity-40" />
                  ) : img.image_url ? (
                    <MangaImage
                      src={img.image_url}
                      alt={`Page ${img.number}`}
                      width={40}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <X size={12} className="opacity-30" />
                  )}
                </div>
                <span
                  className="flex-1 truncate text-xs font-mono"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {img.image_url ? img.image_url.split('/').pop() : 'Uploading…'}
                </span>
                <button
                  onClick={() => handleDeletePage(img.id)}
                  disabled={img.uploading}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-red-500/10 disabled:opacity-30"
                  style={{ color: 'var(--text-tertiary)' }}
                  title="Delete page"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
