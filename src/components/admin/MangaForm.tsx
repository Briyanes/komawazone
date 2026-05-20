'use client';

import { useState, useTransition, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
import {
  Save, X, Plus, BookOpen, Pen, Image as ImageIcon, Tag, AlignLeft, Upload, Trash2,
} from 'lucide-react';
import { uploadImage } from '@/lib/supabase/storage';

// Common manga/manhwa genres for quick selection
const PRESET_GENRES = [
  'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror',
  'Mystery', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Thriller',
  'Supernatural', 'Historical', 'Martial Arts', 'Isekai', 'Harem',
  'School Life', 'Shounen', 'Shoujo', 'Seinen', 'Josei', 'Yaoi', 'Yuri',
  'Adult', 'Ecchi', 'Demons', 'Magic', 'Mecha',
];

interface MangaFormData {
  title: string;
  alt_title: string;
  slug: string;
  description: string;
  cover_url: string;
  banner_url: string;
  status: 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';
  type: 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
  author: string;
  artist: string;
  release_year: string;
  genres: string[];
}

interface MangaFormProps {
  initial?: Partial<MangaFormData> & { id?: string };
  mode: 'create' | 'edit';
}

function toSlug(str: string) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// ── Genre Tag Picker ──────────────────────────────────────────────────────────
function GenrePicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (genres: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = useCallback((genre: string) => {
    const g = genre.trim();
    if (g && !selected.includes(g)) onChange([...selected, g]);
    setInput('');
  }, [selected, onChange]);

  const remove = (genre: string) => onChange(selected.filter(g => g !== genre));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      add(input);
    }
    if (e.key === 'Backspace' && !input && selected.length > 0) {
      remove(selected[selected.length - 1]);
    }
  };

  return (
    <div className="space-y-2">
      {/* Selected tags */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map(g => (
            <span
              key={g}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              {g}
              <button
                type="button"
                onClick={() => remove(g)}
                className="hover:opacity-70 transition-opacity"
                aria-label={`Remove ${g}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Text input */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type genre and press Enter..."
          className="flex-1 rounded-xl border px-3 py-2 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
          style={{
            background: 'var(--bg-primary)',
            borderColor: 'var(--border-default)',
            color: 'var(--text-primary)',
          }}
        />
        <Button
          type="button"
          variant="ghost"
          onClick={() => add(input)}
          disabled={!input.trim()}
        >
          <Plus size={14} />
          Add
        </Button>
      </div>

      {/* Preset genres */}
      <div className="flex flex-wrap gap-1.5">
        {PRESET_GENRES.filter(g => !selected.includes(g)).map(g => (
          <button
            key={g}
            type="button"
            onClick={() => add(g)}
            className="rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            style={{
              borderColor: 'var(--border-light)',
              color: 'var(--text-tertiary)',
            }}
          >
            + {g}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Section heading ────────────────────────────────────────────────────────────
function SectionHead({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
      <Icon size={15} />
      {title}
    </h3>
  );
}

// ── Main Form ─────────────────────────────────────────────────────────────────
export function MangaForm({ initial, mode }: MangaFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [isUploading, setIsUploading] = useState({ cover: false, banner: false });
  const coverInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<MangaFormData>({
    title:        initial?.title        ?? '',
    alt_title:    initial?.alt_title    ?? '',
    slug:         initial?.slug         ?? '',
    description:  initial?.description  ?? '',
    cover_url:    initial?.cover_url    ?? '',
    banner_url:   initial?.banner_url   ?? '',
    status:       initial?.status       ?? 'ONGOING',
    type:         initial?.type         ?? 'MANGA',
    author:       initial?.author       ?? '',
    artist:       initial?.artist       ?? '',
    release_year: initial?.release_year ?? String(new Date().getFullYear()),
    genres:       initial?.genres       ?? [],
  });

  const set = (field: keyof Omit<MangaFormData, 'genres'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm(prev => ({
        ...prev,
        [field]: e.target.value,
        ...(field === 'title' && mode === 'create' ? { slug: toSlug(e.target.value) } : {}),
      }));
    };

  const handleImageUpload = async (file: File, type: 'cover' | 'banner') => {
    if (!file) return;
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size should be less than 5MB');
      return;
    }

    setError('');
    setIsUploading(prev => ({ ...prev, [type]: true }));

    try {
      const path = type === 'cover' ? 'covers' : 'banners';
      const url = await uploadImage(file, path);
      setForm(prev => ({
        ...prev,
        [type === 'cover' ? 'cover_url' : 'banner_url']: url,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'cover' | 'banner') => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageUpload(file, type);
    }
  };

  const clearImage = (type: 'cover' | 'banner') => {
    setForm(prev => ({
      ...prev,
      [type === 'cover' ? 'cover_url' : 'banner_url']: '',
    }));
    if (type === 'cover' && coverInputRef.current) {
      coverInputRef.current.value = '';
    }
    if (type === 'banner' && bannerInputRef.current) {
      bannerInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const url = mode === 'create' ? '/api/v1/admin/manga' : `/api/v1/admin/manga/${initial?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const payload = {
        ...form,
        release_year: form.release_year ? Number(form.release_year) : undefined,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as { status: string; error?: string; data?: { id: string } };
      if (data.status === 'success') {
        router.push('/admin/manga');
        router.refresh();
      } else {
        setError(typeof data.error === 'string' ? data.error : 'Save failed');
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-2xl">

      {/* Basic Info */}
      <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <SectionHead icon={BookOpen} title="Basic Info" />

        <Input label="Title *" value={form.title} onChange={set('title')} placeholder="Manga title" required />
        <Input label="Alternative Title" value={form.alt_title} onChange={set('alt_title')} placeholder="Original / Korean / Japanese title" />
        <Input label="Slug (URL) *" value={form.slug} onChange={set('slug')} placeholder="manga-slug" hint="Used in URL: /manga/your-slug" required />

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Type"
            value={form.type}
            onChange={set('type')}
            options={[
              { value: 'MANGA',   label: 'Manga'   },
              { value: 'MANHWA',  label: 'Manhwa'  },
              { value: 'MANHUA',  label: 'Manhua'  },
              { value: 'WEBTOON', label: 'Webtoon' },
            ]}
          />
          <Select
            label="Status"
            value={form.status}
            onChange={set('status')}
            options={[
              { value: 'ONGOING',   label: 'Ongoing'   },
              { value: 'COMPLETED', label: 'Completed' },
              { value: 'HIATUS',    label: 'Hiatus'    },
              { value: 'DROPPED',   label: 'Dropped'   },
            ]}
          />
        </div>
      </section>

      {/* Creators */}
      <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <SectionHead icon={Pen} title="Creators" />

        <div className="grid grid-cols-2 gap-4">
          <Input label="Author" value={form.author} onChange={set('author')} placeholder="Author name" />
          <Input label="Artist" value={form.artist} onChange={set('artist')} placeholder="Artist name" />
        </div>
        <Input
          label="Release Year"
          value={form.release_year}
          onChange={set('release_year')}
          type="number"
          placeholder={String(new Date().getFullYear())}
        />
      </section>

      {/* Cover & Banner */}
      <section className="space-y-4 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <SectionHead icon={ImageIcon} title="Images" />

        {/* Cover Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Cover Image *
          </label>
          
          {form.cover_url ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={form.cover_url} 
                alt="Cover preview" 
                className="h-48 w-32 rounded-xl object-cover border" 
                style={{ borderColor: 'var(--border-light)' }} 
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => coverInputRef.current?.click()}
                  disabled={isUploading.cover}
                >
                  <Upload size={14} />
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearImage('cover')}
                  disabled={isUploading.cover}
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => coverInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors hover:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <Upload size={32} style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Click to upload cover image
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                PNG, JPG up to 5MB
              </p>
            </div>
          )}
          
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(e, 'cover')}
            className="hidden"
          />
          
          {isUploading.cover && (
            <p className="text-xs" style={{ color: 'var(--color-primary)' }}>
              Uploading cover image...
            </p>
          )}

          {/* Optional: URL input as alternative */}
          <details className="text-xs">
            <summary className="cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
              Or paste image URL
            </summary>
            <Input 
              value={form.cover_url} 
              onChange={set('cover_url')} 
              placeholder="https://example.com/cover.jpg"
              className="mt-2"
            />
          </details>
        </div>

        {/* Banner Image */}
        <div className="space-y-2">
          <label className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Banner Image (optional)
          </label>
          
          {form.banner_url ? (
            <div className="space-y-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img 
                src={form.banner_url} 
                alt="Banner preview" 
                className="h-32 w-full max-w-md rounded-xl object-cover border" 
                style={{ borderColor: 'var(--border-light)' }} 
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={isUploading.banner}
                >
                  <Upload size={14} />
                  Change
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => clearImage('banner')}
                  disabled={isUploading.banner}
                >
                  <Trash2 size={14} />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => bannerInputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 cursor-pointer transition-colors hover:border-[var(--color-primary)]"
              style={{ borderColor: 'var(--border-default)' }}
            >
              <Upload size={28} style={{ color: 'var(--text-tertiary)' }} />
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                Click to upload banner image
              </p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                PNG, JPG up to 5MB
              </p>
            </div>
          )}
          
          <input
            ref={bannerInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFileSelect(e, 'banner')}
            className="hidden"
          />
          
          {isUploading.banner && (
            <p className="text-xs" style={{ color: 'var(--color-primary)' }}>
              Uploading banner image...
            </p>
          )}

          {/* Optional: URL input as alternative */}
          <details className="text-xs">
            <summary className="cursor-pointer" style={{ color: 'var(--text-tertiary)' }}>
              Or paste image URL
            </summary>
            <Input 
              value={form.banner_url} 
              onChange={set('banner_url')} 
              placeholder="https://example.com/banner.jpg"
              className="mt-2"
            />
          </details>
        </div>
      </section>

      {/* Genres */}
      <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <SectionHead icon={Tag} title="Genres" />
        <GenrePicker selected={form.genres} onChange={genres => setForm(p => ({ ...p, genres }))} />
      </section>

      {/* Synopsis */}
      <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: 'var(--border-light)' }}>
        <SectionHead icon={AlignLeft} title="Synopsis" />
        <div className="space-y-1">
          <textarea
            value={form.description}
            onChange={set('description')}
            rows={6}
            placeholder="Write manga synopsis here..."
            className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-primary)]"
            style={{
              background: 'var(--bg-primary)',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
              lineHeight: '1.6',
            }}
          />
          <p className="text-right text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {form.description.length} chars
          </p>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border px-4 py-3 text-sm text-red-500" style={{ borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)' }}>
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button type="submit" isLoading={isPending}>
          <Save size={16} />
          {mode === 'create' ? 'Create Manga' : 'Save Changes'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push('/admin/manga')}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

