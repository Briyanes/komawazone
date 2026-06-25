'use client';

import { useEffect, useState, CSSProperties } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface OlluqTypingLoaderProps {
  size?: Size;
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const SIZE_MAP: Record<Size, { font: string; gap: string }> = {
  sm: { font: '1.1rem', gap: '0.4rem' },
  md: { font: '1.75rem', gap: '0.5rem' },
  lg: { font: '2.5rem', gap: '0.6rem' },
  xl: { font: '3.5rem', gap: '0.75rem' },
};

const BRAND_TEXT = 'OLLUQ';

export default function OlluqTypingLoader({
  size = 'lg',
  text,
  fullScreen = false,
  className = '',
}: OlluqTypingLoaderProps) {
  const s = SIZE_MAP[size];
  const [visibleCount, setVisibleCount] = useState(0);

  // Typing animation: reveal one character at a time, then loop
  useEffect(() => {
    let frame = 0;
    const interval = setInterval(() => {
      frame++;
      const cycle = frame % (BRAND_TEXT.length + 8); // type + pause
      if (cycle <= BRAND_TEXT.length) {
        setVisibleCount(cycle);
      } else if (cycle === BRAND_TEXT.length + 1) {
        setVisibleCount(BRAND_TEXT.length); // hold full text
      } else if (cycle >= BRAND_TEXT.length + 5) {
        setVisibleCount(0); // reset for next loop
      }
    }, 200); // 200ms per character = 1s to type OLLUQ
    return () => clearInterval(interval);
  }, []);

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
        background: 'var(--bg-primary, #0a0a0f)',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        minHeight: '60vh',
      };

  const textStyle: CSSProperties = {
    fontSize: s.font,
    fontWeight: 800,
    letterSpacing: '-0.04em',
    lineHeight: 1,
    background: 'linear-gradient(110deg, var(--accent-primary, #6366f1) 0%, var(--accent-secondary, #8b5cf6) 40%, #c084fc 50%, var(--accent-secondary, #8b5cf6) 60%, var(--accent-primary, #6366f1) 100%)',
    backgroundSize: '200% 100%',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    animation: 'olluq-shimmer 2s linear infinite',
    userSelect: 'none',
  };

  return (
    <div style={wrapperStyle} className={className}>
      {/* Typing text */}
      <div style={{ display: 'flex', alignItems: 'baseline' }}>
        <span style={textStyle}>
          {BRAND_TEXT.slice(0, visibleCount)}
        </span>
        {/* Blinking cursor */}
        <span
          style={{
            display: visibleCount < BRAND_TEXT.length ? 'inline-block' : 'none',
            width: '0.08em',
            height: s.font,
            marginLeft: '0.06em',
            background: 'var(--accent-primary, #6366f1)',
            animation: 'olluq-blink 0.7s step-end infinite',
            borderRadius: '1px',
            verticalAlign: 'text-bottom',
          }}
        />
      </div>

      {/* Subtitle / loading text */}
      {text && (
        <span
          style={{
            fontSize: `calc(${s.font} * 0.4)`,
            color: 'var(--text-secondary, #888)',
            letterSpacing: '0.06em',
            animation: 'olluq-fade 1.5s ease-in-out infinite',
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}