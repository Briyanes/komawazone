'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Plus, Save, ImagePlus, X, ChevronDown } from 'lucide-react';
import { uploadImage } from '@/lib/supabase/storage';

interface ImageRow {
  number: number;
  image_url: string;
  uploading?: boolean;
  preview?: string;
}

interface MangaOption {
  id: string;
  title: string;
}

export function ChapterForm({ mangaId }: { mangaId?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [selectedMangaId, setSelectedMangaId] = useState(mangaId ?? '');
  const [mangaList, setMangaList] = useState<MangaOption[]>([]);
  const [number, setNumber] = useState('');
  const [title, setTitle] = useState('');
  const [releaseDate, setReleaseDate] = useState('');
  const [images, setImages] = useState<ImageRow[]>([]);
  const [isUploadingAny, setIsUploadingAny] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbFileRef = useRef<HTMLInputElement>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [uploadingThumb, setUploadingThumb] = useState(false);

  // Fetch manga list for dropdown (skip if mangaId already provided)
  useEffect(() => {
    if (mangaId) return;
    fetch('/api/v1/admin/manga?limit=100')
      .then(r => r.json())
      .then((d: { data?: MangaOption[] }) => {
        if (d.data) setMangaList(d.data);
      })
      .catch(() => {});
  }, [mangaId]);

  const addImageRow = () =>
    setImages(prev => [...prev, { number: prev.length + 1, image_url: '' }]);

  const removeImage = (i: number) =>
    setImages(prev =>
      prev.filter((_, idx) => idx !== i).map((img, idx) => ({ ...img, number: idx + 1 }))
    );

  const updateImageUrl = (i: number, url: string) =>
    setImages(prev => prev.map((img, idx) => idx === i ? { ...img, image_url: url } : img));

  const handleFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const fileArr = Array.from(files);
    // Add placeholder rows first
    const startIndex = images.length;
    const placeholders: ImageRow[] = fileArr.map((_, i) => ({
      number: startIndex + i + 1,
      image_url: '',
      uploading: true,
    }));
    setImages(prev => [...prev, ...placeholders]);
    setIsUploadingAny(true);

    // Upload each file
    await Promise.all(
      fileArr.map(async (file, i) => {
        try {
          const url = await uploadImage(file, 'pages');
          setImages(prev =>
            prev.map(img =>
              img.number === startIndex + i + 1
                ? { ...img, image_url: url, uploading: false, preview: url }
                : img
            )
          );
        } catch {
          setImages(prev =>
            prev.map(img =>
              img.number === startIndex + i + 1
                ? { ...img, uploading: false }
                : img
            )
          );
        }
      })
    );
    setIsUploadingAny(false);
  };

  const handleBulkPaste = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const urls = e.target.value.split('\n').map(u => u.trim()).filter(Boolean);
    setImages(urls.map((url, i) => ({ number: i + 1, image_url: url })));
  };

  const handleThumbFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!selectedMangaId) { setError('Pilih manga terlebih dahulu'); return; }
    if (!number) { setError('Chapter number wajib diisi'); return; }
    const validImages = images.filter(img => img.image_url.trim());
    if (validImages.length === 0) { setError('Tambahkan minimal satu halaman'); return; }

    startTransition(async () => {
      const res = await fetch('/api/v1/admin/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manga_id: selectedMangaId,
          number: parseFloat(number),
          title: title || null,
          thumbnail_url: thumbnailUrl || null,
          release_date: releaseDate || null,
          images: validImages.map(img => ({ number: img.number, image_url: img.image_url })),
        }),
      });
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'success') {
        router.push('/admin/chapters');
        router.refresh();
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Gagal menyimpan');
      }
    });
  };

  const selectedManga = mangaList.find(m => m.id === selectedMangaId);

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      {/* Manga selector */}
      {!mangaId && (
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Manga <span className="text-red-500">*</span>
          </label>
          <div className="relative">
            <select
              value={selectedMangaId}
              onChange={e => setSelectedMangaId(e.target.value)}
              required
              className="w-full appearance-none rounded-xl border px-3 py-2.5 pr-8 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
              style={{
                background: 'var(--bg-primary)',
                borderColor: 'var(--border-default)',
                color: selectedMangaId ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}
            >
              <option value="" disabled>— Pilih manga —</option>
              {mangaList.map(m => (
                <option key={m.id} value={m.id}>{m.title}</option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
              style={{ color: 'var(--text-tertiary)' }}
            />
          </div>
          {selectedManga && (
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              ID: {selectedMangaId}
            </p>
          )}
        </div>
      )}

      {/* Chapter number + title */}
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Nomor Chapter"
          type="number"
          step="0.1"
          min="0"
          value={number}
          onChange={e => setNumber(e.target.value)}
          placeholder="1"
          required
        />
        <Input
          label="Judul Chapter (opsional)"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="mis. Awal Mula"
        />
      </div>

      {/* Release / Schedule date */}
      <div className="space-y-1.5">
        <label className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Tanggal Rilis{' '}
          <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>
            (biarkan kosong untuk langsung terbit)
          </span>
        </label>
        <input
          type="datetime-local"
          value={releaseDate}
          onChange={e => setReleaseDate(e.target.value)}
          className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: releaseDate ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        />
        {releaseDate && new Date(releaseDate) > new Date() && (
          <p className="flex items-center gap-1.5 text-xs" style={{ color: '#F59E0B' }}>
            <span>⏰</span>
            Terjadwal — chapter belum dapat dibaca sebelum tanggal ini
          </p>
        )}
      </div>

      {/* Thumbnail */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Thumbnail{' '}
          <span className="font-normal" style={{ color: 'var(--text-tertiary)' }}>(opsional — otomatis pakai halaman ke-2 kalau kosong)</span>
        </label>
        <div className="flex gap-2 items-center">
          <input
            value={thumbnailUrl}
            onChange={e => setThumbnailUrl(e.target.value)}
            placeholder="Paste URL atau upload gambar…"
            className="flex-1 rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{ background: 'var(--bg-primary)', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
          />
          <button
            type="button"
            onClick={() => thumbFileRef.current?.click()}
            disabled={uploadingThumb}
            className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-medium transition-colors disabled:opacity-50"
            style={{ background: 'rgba(255,107,53,0.1)', color: 'var(--color-primary)', border: '1px solid rgba(255,107,53,0.25)' }}
          >
            <ImagePlus size={13} />
            {uploadingThumb ? 'Uploading…' : 'Upload'}
          </button>
          <input ref={thumbFileRef} type="file" accept="image/*" className="hidden" onChange={handleThumbFileSelect} />
        </div>
        {thumbnailUrl && (
          <div className="relative inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbnailUrl} alt="thumbnail preview" className="rounded-lg object-cover" style={{ width: 100, height: 68 }} />
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

      {/* Upload pages */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Halaman / Pages
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
              style={{
                background: 'rgba(255,107,53,0.1)',
                color: 'var(--color-primary)',
                border: '1px solid rgba(255,107,53,0.25)',
              }}
            >
              <ImagePlus size={12} />
              Upload Gambar
            </button>
            <button
              type="button"
              onClick={addImageRow}
              className="flex items-center gap-1 text-xs"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <Plus size={12} /> URL manual
            </button>
          </div>
        </div>

        {/* Hidden multi-file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => handleFileSelect(e.target.files)}
        />

        {/* Upload drop zone when empty */}
        {images.length === 0 && (
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--color-primary)'; }}
            onDragLeave={e => { e.currentTarget.style.borderColor = ''; }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.style.borderColor = '';
              void handleFileSelect(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="w-full cursor-pointer rounded-2xl border-2 border-dashed py-10 text-center transition-colors hover:border-[var(--color-primary)]"
            style={{ borderColor: 'var(--border-medium)' }}
          >
            <ImagePlus size={28} className="mx-auto mb-2" style={{ color: 'var(--text-tertiary)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Klik atau drag & drop gambar di sini
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Bisa pilih banyak sekaligus • JPG, PNG, WEBP
            </p>
          </div>
        )}

        {/* Drop zone overlay when there are existing images */}
        {images.length > 0 && (
          <div
            onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-[var(--color-primary)]'); }}
            onDragLeave={e => { e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]'); }}
            onDrop={e => {
              e.preventDefault();
              e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]');
              void handleFileSelect(e.dataTransfer.files);
            }}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-2.5 text-xs font-medium transition-colors hover:border-[var(--color-primary)]"
            style={{ borderColor: 'var(--border-medium)', color: 'var(--text-tertiary)' }}
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus size={13} /> Tambah lebih banyak halaman (drag & drop atau klik)
          </div>
        )}

        {/* Page rows */}
        {images.length > 0 && (
          <div
            className="max-h-80 overflow-y-auto space-y-2 rounded-xl border p-3 pr-2"
            style={{ borderColor: 'var(--border-light)', background: 'var(--bg-secondary)' }}
          >
            {images.map((img, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-6 shrink-0 text-center text-xs font-mono"
                  style={{ color: 'var(--text-tertiary)' }}
                >
                  {img.number}
                </span>

                {/* Thumbnail preview */}
                {(img.image_url || img.uploading) && (
                  <div
                    className="relative shrink-0 overflow-hidden rounded"
                    style={{ width: 28, height: 40, background: 'var(--bg-tertiary)' }}
                  >
                    {img.uploading ? (
                      <div className="flex size-full items-center justify-center">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: 'var(--color-primary)' }} />
                      </div>
                    ) : img.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img.image_url} alt="" className="size-full object-cover" />
                    ) : null}
                  </div>
                )}

                <input
                  value={img.image_url}
                  onChange={e => updateImageUrl(i, e.target.value)}
                  placeholder={img.uploading ? 'Uploading...' : 'https://...'}
                  disabled={img.uploading}
                  className="flex-1 rounded-lg border px-2.5 py-1.5 text-xs outline-none focus:border-[var(--color-primary)] disabled:opacity-50"
                  style={{
                    background: 'var(--bg-primary)',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-primary)',
                  }}
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="shrink-0 rounded p-1 transition-colors hover:bg-red-50"
                  style={{ color: '#EF4444' }}
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {images.length > 0 && (
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {images.filter(i => i.image_url && !i.uploading).length} halaman siap
            {isUploadingAny && ' • Mengupload...'}
          </p>
        )}
      </div>

      {/* Bulk URL paste (collapsible) */}
      <details className="group">
        <summary
          className="cursor-pointer select-none text-xs font-medium"
          style={{ color: 'var(--text-tertiary)' }}
        >
          ▸ Bulk paste URL (opsional)
        </summary>
        <textarea
          rows={4}
          onChange={handleBulkPaste}
          placeholder={'https://cdn.example.com/ch1/01.jpg\nhttps://cdn.example.com/ch1/02.jpg'}
          className="mt-2 w-full resize-none rounded-xl border px-3 py-2 text-xs font-mono outline-none focus:border-[var(--color-primary)]"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
      </details>

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm text-red-500" style={{ background: 'rgba(239,68,68,0.08)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" isLoading={isPending || isUploadingAny}>
          <Save size={16} /> Simpan Chapter
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/chapters')}>
          Batal
        </Button>
      </div>
    </form>
  );
}
