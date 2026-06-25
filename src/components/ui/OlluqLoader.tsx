'use client';

import { CSSProperties } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl';

interface OlluqLoaderProps {
  size?: Size;
  text?: string;
  fullScreen?: boolean;
  className?: string;
}

const SIZE_MAP: Record<Size, { box: number; font: string; border: number }> = {
  sm: { box: 28, font: '0.7rem', border: 3 },
  md: { box: 48, font: '0.85rem', border: 4 },
  lg: { box: 72, font: '1rem', border: 5 },
  xl: { box: 120, font: '1.25rem', border: 6 },
};

export default function OlluqLoader({
  size = 'md',
  text,
  fullScreen = false,
  className = '',
}: OlluqLoaderProps) {
  const s = SIZE_MAP[size];

  const wrapperStyle: CSSProperties = fullScreen
    ? {
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        background: 'var(--bg-primary, #0a0a0f)',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
      };

  const spinnerStyle: CSSProperties = {
    width: s.box,
    height: s.box,
    position: 'relative',
  };

  const ringStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: `${s.border}px solid transparent`,
    borderTopColor: 'var(--accent-primary, #6366f1)',
    borderRightColor: 'var(--accent-primary, #6366f1)',
    animation: 'olluq-spin 0.7s linear infinite',
  };

  const ringStyle2: CSSProperties = {
    position: 'absolute',
    inset: s.border * 2,
    borderRadius: '50%',
    border: `${Math.max(2, s.border - 1)}px solid transparent`,
    borderBottomColor: 'var(--accent-secondary, #8b5cf6)',
    borderLeftColor: 'var(--accent-secondary, #8b5cf6)',
    animation: 'olluq-spin-reverse 0.5s linear infinite',
  };

  const logoStyle: CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: s.font,
    fontWeight: 800,
    letterSpacing: '-0.03em',
    color: 'var(--text-primary, #fff)',
    userSelect: 'none',
    animation: 'olluq-pulse 1.5s ease-in-out infinite',
  };

  return (
    <div style={wrapperStyle} className={className}>
      <div style={spinnerStyle}>
        <div style={ringStyle} />
        <div style={ringStyle2} />
        <div style={logoStyle}>
          <span style={logoTextStyle}>O</span>
        </div>
      </div>
      {text && (
        <span
          style={{
            fontSize: s.font,
            color: 'var(--text-secondary, #999)',
            letterSpacing: '0.05em',
            animation: 'olluq-fade 1.5s ease-in-out infinite',
          }}
        >
          {text}
        </span>
      )}
    </div>
  );
}

const logoTextStyle: CSSProperties = {
  background: 'linear-gradient(135deg, var(--accent-primary, #6366f1), var(--accent-secondary, #8b5cf6))',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
};