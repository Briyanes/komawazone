'use client';

import { useState } from 'react';
import { Share2, Link as LinkIcon, Check } from 'lucide-react';

interface ShareButtonsProps {
  title: string;
  slug: string;
}

export function ShareButtons({ title, slug }: ShareButtonsProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  const url = typeof window !== 'undefined'
    ? `${window.location.origin}/manga/${slug}`
    : `/manga/${slug}`;

  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Reading "${title}" on Komawa Zone!`)}&url=${encodeURIComponent(url)}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[var(--bg-tertiary)] shrink-0"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-light)' }}
      >
        <Share2 size={16} />
        <span className="hidden sm:inline">Share</span>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl shadow-xl"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
          >
            <a
              href={tweetUrl}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-primary)' }}
            >
              <span className="text-[10px]">𝕏</span> Share on X
            </a>
            <button
              onClick={() => { copyLink(); setOpen(false); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm transition-colors hover:bg-[var(--bg-tertiary)]"
              style={{ color: 'var(--text-primary)' }}
            >
              {copied ? <Check size={14} style={{ color: '#10B981' }} /> : <LinkIcon size={14} />}
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
