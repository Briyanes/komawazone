'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function SynopsisToggle({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 220;

  return (
    <section>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>
        Synopsis
      </h2>
      <div className="relative">
        <p
          className="text-sm leading-relaxed transition-all"
          style={{
            color: 'var(--text-secondary)',
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: expanded || !isLong ? 'unset' : 3,
            overflow: expanded || !isLong ? 'visible' : 'hidden',
          }}
        >
          {text}
        </p>
        {/* fade-out on mobile when collapsed */}
        {isLong && !expanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-8 sm:hidden pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-primary))' }}
          />
        )}
      </div>
      {isLong && (
        <button
          onClick={() => setExpanded(v => !v)}
          className="mt-1.5 flex items-center gap-1 text-xs font-semibold sm:hidden"
          style={{ color: 'var(--color-primary)' }}
        >
          {expanded ? <><ChevronUp size={13} /> Show less</> : <><ChevronDown size={13} /> Read more</>}
        </button>
      )}
    </section>
  );
}
