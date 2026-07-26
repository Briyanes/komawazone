'use client';

import { useState, useTransition, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link2, Search, Loader2, CheckCircle2, AlertCircle,
  BookOpen, FileText, ChevronDown, X, Plus, Image as ImageIcon,
  Download, ExternalLink, Upload, Database,
} from 'lucide-react';
import { uploadImage } from '@/lib/supabase/storage';
import { SitemapImportTool } from './SitemapImportTool';

// ── Types ─────────────────────────────────────────────────────────────────────

type MangaType   = 'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON';
type MangaStatus = 'ONGOING' | 'COMPLETED' | 'HIATUS' | 'DROPPED';

interface ScrapedManga {
  title: string;
  description: string;
  cover_url: string;
  genres: string[];
  author: string;
  artist: string;
  type: MangaType | null;
  status: MangaStatus;
}

interface ImageRow { number: number; image_url: string; }

interface MangaOption { id: string; title: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

function toSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function CardBox({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl p-6 ${className}`}
      style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ icon: Icon, label, badge }: { icon: React.ElementType; label: string; badge?: string }) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className="flex size-9 items-center justify-center rounded-xl" style={{ background: 'rgba(255,107,53,0.12)' }}>
        <Icon size={18} style={{ color: 'var(--color-primary)' }} />
      </div>
      <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{label}</h2>
      {badge && (
        <span className="ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>{children}</label>;
}

function TextInput({ value, onChange, placeholder = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all focus:ring-2"
      style={{
        background: 'var(--bg-tertiary)',
        border: '1px solid var(--border-light)',
        color: 'var(--text-primary)',
        '--tw-ring-color': 'var(--color-primary)',
      } as React.CSSProperties}
    />
  );
}

function SelectInput({ value, onChange, options }: {
  value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none rounded-xl px-4 py-2.5 pr-9 text-sm outline-none transition-all focus:ring-2"
        style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border-light)',
          color: 'var(--text-primary)',
          '--tw-ring-color': 'var(--color-primary)',
        } as React.CSSProperties}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
    </div>
  );
}

function Btn({
  onClick, disabled, loading, variant = 'primary', children, className = '',
}: {
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: React.ReactNode;
  className?: string;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary:   { background: 'var(--color-primary)', color: '#fff' },
    secondary: { background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' },
    ghost:     { background: 'transparent', color: 'var(--text-secondary)' },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all hover:opacity-85 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={styles[variant]}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ── Tab indicator ─────────────────────────────────────────────────────────────

function TabBar({ active, onChange }: { active: 'manga' | 'chapter' | 'sitemap'; onChange: (v: 'manga' | 'chapter' | 'sitemap') => void }) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl w-fit" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
      {(['manga', 'chapter', 'sitemap'] as const).map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold whitespace-nowrap transition-all"
          style={active === tab ? { background: 'var(--color-primary)', color: '#fff' } : { color: 'var(--text-secondary)' }}
        >
          {tab === 'manga' && <BookOpen size={15} />}
          {tab === 'chapter' && <FileText size={15} />}
          {tab === 'sitemap' && <Database size={15} />}
          {tab === 'manga' ? 'Import Manga' : tab === 'chapter' ? 'Import Chapter' : 'Sitemap Import'}
        </button>
      ))}
    </div>
  );
}

// ── Genre picker ──────────────────────────────────────────────────────────────

function GenrePicker({ genres, onChange }: { genres: string[]; onChange: (g: string[]) => void }) {
  const [input, setInput] = useState('');
  const add = (g: string) => {
    const t = g.trim();
    if (t && !genres.includes(t)) onChange([...genres, t]);
    setInput('');
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {genres.map(g => (
          <span key={g} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: 'var(--color-primary)', color: '#fff' }}>
            {g}
            <button type="button" onClick={() => onChange(genres.filter(x => x !== g))}><X size={10} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if ((e.key === 'Enter' || e.key === ',') && input.trim()) { e.preventDefault(); add(input); }
          }}
          placeholder="Tambah genre (Enter)"
          className="flex-1 rounded-xl px-4 py-2 text-sm outline-none"
          style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
        />
        <Btn variant="secondary" onClick={() => add(input)} disabled={!input.trim()}>
          <Plus size={14} />
        </Btn>
      </div>
    </div>
  );
}

// ── STATUS / TYPE options ─────────────────────────────────────────────────────

const TYPE_OPTS = [
  { value: '', label: '— Pilih tipe —' },
  { value: 'MANGA',   label: 'Manga' },
  { value: 'MANHWA',  label: 'Manhwa' },
  { value: 'MANHUA',  label: 'Manhua' },
  { value: 'WEBTOON', label: 'Webtoon' },
];
const STATUS_OPTS = [
  { value: 'ONGOING',   label: 'Sedang Berjalan' },
  { value: 'COMPLETED', label: 'Selesai' },
  { value: 'HIATUS',    label: 'Hiatus' },
  { value: 'DROPPED',   label: 'Dibatalkan' },
];

// ── MANGA IMPORT TAB ──────────────────────────────────────────────────────────

function MangaImportTab() {
  const router = useRouter();
  const [url, setUrl]         = useState('');
  const [scraping, setScraping]   = useState(false);
  const [scrapeErr, setScrapeErr] = useState('');
  const [scraped, setScraped]   = useState<ScrapedManga | null>(null);

  // Editable form fields
  const [title, setTitle]       = useState('');
  const [slug, setSlug]         = useState('');
  const [desc, setDesc]         = useState('');
  const [cover, setCover]       = useState('');
  const [author, setAuthor]     = useState('');
  const [artist, setArtist]     = useState('');
  const [type, setType]         = useState('');
  const [status, setStatus]     = useState<MangaStatus>('ONGOING');
  const [genres, setGenres]     = useState<string[]>([]);
  const [saving, startSave]     = useTransition();
  const [saveErr, setSaveErr]   = useState('');
  const [coverImgOk, setCoverImgOk] = useState(true);
  const [uploading, setUploading]   = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const handleCoverUpload = async (file: File) => {
    setUploading(true);
    try {
      const imageUrl = await uploadImage(file, 'covers');
      setCover(imageUrl);
      setCoverImgOk(true);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : 'Upload cover gagal');
    } finally {
      setUploading(false);
    }
  };

  const fillForm = useCallback((data: ScrapedManga) => {
    setTitle(data.title);
    setSlug(toSlug(data.title));
    setDesc(data.description);
    setCover(data.cover_url);
    setCoverImgOk(true);
    setAuthor(data.author);
    setArtist(data.artist);
    setType(data.type ?? '');
    setStatus(data.status);
    setGenres(data.genres);
  }, []);

  const handleScrape = async () => {
    if (!url.trim()) return;
    setScraping(true);
    setScrapeErr('');
    setScraped(null);
    try {
      const res = await fetch('/api/v1/admin/scrape/manga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json() as { data?: ScrapedManga; error?: string };
      if (!res.ok || json.error) { setScrapeErr(json.error ?? 'Scrape gagal'); return; }
      setScraped(json.data!);
      fillForm(json.data!);
    } catch {
      setScrapeErr('Network error');
    } finally {
      setScraping(false);
    }
  };

  const handleSave = () => {
    setSaveErr('');
    startSave(async () => {
      const res = await fetch('/api/v1/admin/manga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, alt_title: '', slug: slug || toSlug(title),
          description: desc, cover_url: cover, banner_url: '',
          author, artist, status, type: type || 'MANGA',
          genres, release_year: new Date().getFullYear(),
          source_url: url.trim() || undefined,
        }),
      });
      const json = await res.json() as { data?: { id: string }; error?: string; status?: string };
      if (!res.ok || json.status === 'error') { setSaveErr(json.error ? JSON.stringify(json.error) : 'Simpan gagal'); return; }
      router.push('/admin/manga');
    });
  };

  return (
    <div className="space-y-5">
      {/* URL Input */}
      <CardBox>
        <SectionTitle icon={Link2} label="URL Manga ManhwaLand" />
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScrape()}
            placeholder="https://04x-1s.manhwaland.land/manga/prison-revenge/"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-all focus:ring-2"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border-light)',
              color: 'var(--text-primary)',
            } as React.CSSProperties}
          />
          <Btn onClick={handleScrape} loading={scraping} disabled={!url.trim()}>
            {scraping ? 'Scraping…' : <><Search size={14} /> Scrape</>}
          </Btn>
        </div>
        {scrapeErr && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <AlertCircle size={15} /> {scrapeErr}
          </div>
        )}
        {scraped && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
            <CheckCircle2 size={15} /> Data berhasil di-scrape! Periksa dan edit di bawah sebelum menyimpan.
          </div>
        )}
      </CardBox>

      {/* Form (shown after scrape OR always for manual entry) */}
      <CardBox>
          <SectionTitle icon={BookOpen} label="Detail Manga" />
          <div className="grid gap-4 sm:grid-cols-2">
            {/* Cover preview */}
            {cover && (
              <div className="sm:col-span-2 flex items-start gap-4">
                {/* Direct browser fetch — browser TLS fingerprint bypasses CDN bot check.
                    referrerpolicy="no-referrer" avoids hotlink-referer blocks. */}
                {coverImgOk ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={cover}
                    alt="cover"
                    referrerPolicy="no-referrer"
                    className="h-28 w-20 rounded-xl object-cover shadow-md shrink-0"
                    style={{ border: '1px solid var(--border-light)' }}
                    onError={() => setCoverImgOk(false)}
                  />
                ) : (
                  <div className="flex h-28 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-center"
                    style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)' }}>
                    <ImageIcon size={18} style={{ color: 'var(--text-tertiary)' }} />
                    <span className="text-[9px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>Tidak ada preview</span>
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <FieldLabel>Cover URL</FieldLabel>
                  <TextInput value={cover} onChange={v => { setCover(v); setCoverImgOk(true); }} placeholder="https://..." />
                  {/* Upload cover from device as reliable fallback for CDN-protected images */}
                  <input
                    ref={coverFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }}
                  />
                  <Btn
                    variant="secondary"
                    onClick={() => coverFileRef.current?.click()}
                    loading={uploading}
                    className="text-xs"
                  >
                    <Upload size={12} /> Upload dari perangkat
                  </Btn>
                </div>
              </div>
            )}
            {!cover && (
              <div className="sm:col-span-2">
                <FieldLabel>Cover URL</FieldLabel>
                <TextInput value={cover} onChange={setCover} placeholder="https://..." />
              </div>
            )}

            <div>
              <FieldLabel>Judul</FieldLabel>
              <TextInput value={title} onChange={v => { setTitle(v); setSlug(toSlug(v)); }} placeholder="Judul manga" />
            </div>
            <div>
              <FieldLabel>Slug</FieldLabel>
              <TextInput value={slug} onChange={setSlug} placeholder="judul-manga" />
            </div>
            <div>
              <FieldLabel>Author</FieldLabel>
              <TextInput value={author} onChange={setAuthor} placeholder="Nama penulis" />
            </div>
            <div>
              <FieldLabel>Artist</FieldLabel>
              <TextInput value={artist} onChange={setArtist} placeholder="Nama artist" />
            </div>
            <div>
              <FieldLabel>Tipe</FieldLabel>
              <SelectInput value={type} onChange={setType} options={TYPE_OPTS} />
            </div>
            <div>
              <FieldLabel>Status</FieldLabel>
              <SelectInput value={status} onChange={v => setStatus(v as MangaStatus)} options={STATUS_OPTS} />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Deskripsi</FieldLabel>
              <textarea
                value={desc}
                onChange={e => setDesc(e.target.value)}
                rows={4}
                className="w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Genre</FieldLabel>
              <GenrePicker genres={genres} onChange={setGenres} />
            </div>
          </div>

          {saveErr && (
            <div className="mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              <AlertCircle size={15} /> {saveErr}
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Btn onClick={handleSave} loading={saving} disabled={!title.trim()}>
              <CheckCircle2 size={14} /> Simpan Manga
            </Btn>
          </div>
        </CardBox>
    </div>
  );
}

// ── CHAPTER IMPORT TAB ────────────────────────────────────────────────────────

function ChapterImportTab() {
  const router = useRouter();
  const [mangaList, setMangaList]     = useState<MangaOption[]>([]);
  const [mangaId, setMangaId]         = useState('');
  const [url, setUrl]                 = useState('');
  const [chapNum, setChapNum]         = useState('');
  const [chapTitle, setChapTitle]     = useState('');
  const [scraping, setScraping]       = useState(false);
  const [scrapeErr, setScrapeErr]     = useState('');
  const [images, setImages]           = useState<ImageRow[]>([]);
  const [saving, startSave]           = useTransition();
  const [saveErr, setSaveErr]         = useState('');

  useEffect(() => {
    fetch('/api/v1/admin/manga?limit=200')
      .then(r => r.json() as Promise<{ data?: MangaOption[] }>)
      .then(d => { if (d.data) setMangaList(d.data); })
      .catch(() => {});
  }, []);

  const handleScrape = async () => {
    if (!url.trim()) return;
    setScraping(true);
    setScrapeErr('');
    setImages([]);
    try {
      const res = await fetch('/api/v1/admin/scrape/chapter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json() as {
        data?: { images: ImageRow[]; count: number; meta?: { number?: number; title?: string } };
        error?: string;
      };
      if (!res.ok || json.error) { setScrapeErr(json.error ?? 'Scrape gagal'); return; }
      setImages(json.data!.images);
      if (json.data!.meta?.number && !chapNum) setChapNum(String(json.data!.meta.number));
      if (json.data!.meta?.title  && !chapTitle) setChapTitle(json.data!.meta.title);
    } catch {
      setScrapeErr('Network error');
    } finally {
      setScraping(false);
    }
  };

  const handleImport = () => {
    setSaveErr('');
    if (!mangaId) { setSaveErr('Pilih manga terlebih dahulu'); return; }
    if (!chapNum || isNaN(Number(chapNum))) { setSaveErr('Nomor chapter tidak valid'); return; }
    if (!images.length) { setSaveErr('Tidak ada gambar untuk diimport'); return; }
    startSave(async () => {
      const res = await fetch('/api/v1/admin/chapters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manga_id: mangaId,
          number: Number(chapNum),
          title: chapTitle || undefined,
          images,
        }),
      });
      const json = await res.json() as { data?: { id: string }; error?: string; status?: string };
      if (!res.ok || json.status === 'error') { setSaveErr(json.error ? JSON.stringify(json.error) : 'Import gagal'); return; }
      router.push('/admin/chapters');
    });
  };

  return (
    <div className="space-y-5">
      {/* Step 1: Select manga + enter URL */}
      <CardBox>
        <SectionTitle icon={Link2} label="URL Chapter ManhwaLand" />

        <div className="grid gap-4 sm:grid-cols-2 mb-4">
          <div className="sm:col-span-2">
            <FieldLabel>Pilih Manga</FieldLabel>
            <div className="relative">
              <select
                value={mangaId}
                onChange={e => setMangaId(e.target.value)}
                className="w-full appearance-none rounded-xl px-4 py-2.5 pr-9 text-sm outline-none transition-all focus:ring-2"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--text-primary)',
                  '--tw-ring-color': 'var(--color-primary)',
                } as React.CSSProperties}
              >
                <option value="">— Pilih manga —</option>
                {mangaList.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-tertiary)' }} />
            </div>
          </div>
          <div>
            <FieldLabel>Nomor Chapter</FieldLabel>
            <TextInput value={chapNum} onChange={setChapNum} placeholder="1" />
          </div>
          <div>
            <FieldLabel>Judul Chapter (opsional)</FieldLabel>
            <TextInput value={chapTitle} onChange={setChapTitle} placeholder="The Beginning" />
          </div>
        </div>

        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleScrape()}
            placeholder="https://04x-1s.manhwaland.land/prison-revenge-chapter-1/"
            className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-primary)' }}
          />
          <Btn onClick={handleScrape} loading={scraping} disabled={!url.trim()}>
            {scraping ? 'Scraping…' : <><Search size={14} /> Scrape Gambar</>}
          </Btn>
        </div>

        {scrapeErr && (
          <div className="mt-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
            <AlertCircle size={15} /> {scrapeErr}
          </div>
        )}
      </CardBox>

      {/* Step 2: Preview images */}
      {images.length > 0 && (
        <CardBox>
          <SectionTitle icon={ImageIcon} label="Preview Gambar" badge={`${images.length} halaman`} />

          {/* Thumbnail strip — first 6 */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
            {images.slice(0, 8).map(img => (
              <div key={img.number} className="shrink-0 relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.image_url}
                  alt={`Page ${img.number}`}
                  className="h-24 w-16 rounded-lg object-cover"
                  style={{ border: '1px solid var(--border-light)' }}
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
                <span className="absolute bottom-1 right-1 rounded text-[10px] font-bold px-1"
                  style={{ background: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                  {img.number}
                </span>
              </div>
            ))}
            {images.length > 8 && (
              <div className="shrink-0 flex h-24 w-16 items-center justify-center rounded-lg text-xs font-semibold"
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>
                +{images.length - 8}
              </div>
            )}
          </div>

          {/* Note about external URLs */}
          <div className="flex items-start gap-2 rounded-xl px-4 py-3 text-xs mb-5"
            style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
            <ExternalLink size={13} className="mt-0.5 shrink-0" />
            <span>Gambar akan disimpan sebagai URL eksternal (CDN sumber). Pastikan URL stabil dan tidak kedaluwarsa.</span>
          </div>

          {saveErr && (
            <div className="mb-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
              <AlertCircle size={15} /> {saveErr}
            </div>
          )}

          <div className="flex justify-end">
            <Btn onClick={handleImport} loading={saving} disabled={!mangaId || !chapNum}>
              <Download size={14} /> Import Chapter ({images.length} halaman)
            </Btn>
          </div>
        </CardBox>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ImportTool() {
  const [tab, setTab] = useState<'manga' | 'chapter' | 'sitemap'>('manga');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black" style={{ color: 'var(--text-primary)' }}>
          Import dari URL
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-tertiary)' }}>
          Scrape metadata manga atau chapter langsung dari ManhwaLand dengan satu klik.
        </p>
      </div>

      {/* How it works */}
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { step: '1', title: 'Salin URL', desc: 'Copy URL manga atau chapter dari manhwaland.land' },
          { step: '2', title: 'Scrape', desc: 'Klik Scrape — sistem otomatis ambil semua data' },
          { step: '3', title: 'Review & Edit', desc: 'Periksa data yang di-scrape, edit jika perlu' },
          { step: '4', title: 'Simpan', desc: 'Klik Simpan — manga/chapter langsung masuk database' },
        ].map(({ step, title, desc }) => (
          <div key={step} className="flex items-start gap-3 rounded-xl p-4"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-black"
              style={{ background: 'rgba(255,107,53,0.12)', color: 'var(--color-primary)' }}>
              {step}
            </div>
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{desc}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <TabBar active={tab} onChange={setTab} />
      </div>

      {tab === 'manga'   && <MangaImportTab />}
      {tab === 'chapter' && <ChapterImportTab />}
      {tab === 'sitemap' && <SitemapImportTool />}
    </div>
  );
}
