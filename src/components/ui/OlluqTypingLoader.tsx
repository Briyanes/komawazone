'use client';

import { useEffect, useState, CSSProperties } from 'react';

type Size = 'sm' | 'md' | 'lg';

interface OlluqTypingLoaderProps {
  /** Size of the OLLUQ brand text. Default: 'md' (kecil) */
  size?: Size;
  /** Subtitle text below OLLUQ, e.g. "memuat...." */
  text?: string;
  /** Full-screen overlay (for page-level loading) */
  fullScreen?: boolean;
  /** Minimum display time in ms before fade-out. Default: 0 (no minimum) */
  minDisplayMs?: number;
  className?: string;
}

const SIZE_MAP: Record<Size, { font: string; sub: string; gap: string }> = {
  sm: { font: '0.9rem', sub: '0.7rem', gap: '0.3rem' },
  md: { font: '1.25rem', sub: '0.8rem', gap: '0.4rem' },
  lg: { font: '1.75rem', sub: '0.9rem', gap: '0.5rem' },
};

const BRAND_TEXT = 'OLLUQ';

export default function OlluqTypingLoader({
  size = 'md',
  text = 'memuat....',
  fullScreen = true,
  minDisplayMs = 0,
  className = '',
}: OlluqTypingLoaderProps) {
  const s = SIZE_MAP[size];
  const [visible, setVisible] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Fade-in on mount
  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  // Minimum display time — keeps overlay visible even if parent unmounts
  useEffect(() => {
    if (minDisplayMs <= 0) return;
    const timer = setTimeout(() => setVisible(false), minDisplayMs);
    return () => clearTimeout(timer);
  }, [minDisplayMs]);

  const wrapperStyle: CSSProperties = fullScreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        // Blur background — NO solid color, just blur
        background: 'rgba(10, 10, 15, 0.01)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        opacity: mounted ? (visible ? 1 : 0) : 0,
        transition: 'opacity 400ms ease-in-out',
        pointerEvents: visible ? 'auto' : 'none',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        minHeight: '60vh',
        opacity: mounted ? (visible ? 1 : 0) : 0,
        transition: 'opacity 400ms ease-in-out',
      };

  // OLLUQ brand text — solid orange, no gradient, no shimmer
  const textStyle: CSSProperties = {
    fontSize: s.font,
    fontWeight: 700,
    letterSpacing: '0.02em',
    lineHeight: 1,
    color: '#f97316', // Orange OLLUQ
    userSelect: 'none',
    animation: 'olluq-fade 2s ease-in-out infinite',
  };

  // Subtitle — small, thin (weight 300), muted color
  const subStyle: CSSProperties = {
    fontSize: s.sub,
    fontWeight: 300,
    color: 'var(--text-tertiary, #6b7280)',
    letterSpacing: '0.05em',
    animation: 'olluq-fade 2.5s ease-in-out infinite',
  };

  return (
    <div style={wrapperStyle} className={className}>
      <span style={textStyle}>{BRAND_TEXT}</span>
      {text && <span style={subStyle}>{text}</span>}
    </div>
  );
}