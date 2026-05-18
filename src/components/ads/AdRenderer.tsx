'use client';

import { useEffect, useRef } from 'react';

interface AdRendererProps {
  campaignId: string;
  type: 'BANNER' | 'PIXEL' | 'CUSTOM_HTML' | 'NATIVE';
  htmlContent?: string | null;
  imageUrl?: string | null;
  linkUrl?: string | null;
  placement: string;
  className?: string;
}

/** Inject HTML that may contain <script> tags safely via DOM manipulation */
function useInjectHtml(ref: React.RefObject<HTMLDivElement | null>, html: string | null | undefined) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !html) return;

    // Clear existing content
    el.innerHTML = '';

    // Create a template to parse the HTML
    const template = document.createElement('template');
    template.innerHTML = html;
    const fragment = template.content;

    // Re-create script nodes so browsers execute them
    fragment.querySelectorAll('script').forEach((oldScript) => {
      const newScript = document.createElement('script');
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value)
      );
      newScript.textContent = oldScript.textContent;
      oldScript.replaceWith(newScript);
    });

    el.appendChild(fragment);
  }, [ref, html]);
}

export function AdRenderer({
  campaignId,
  type,
  htmlContent,
  imageUrl,
  linkUrl,
  placement,
  className = '',
}: AdRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackedImpression = useRef(false);

  // Safely inject HTML + scripts for types that need it
  useInjectHtml(
    containerRef,
    (type === 'PIXEL' || type === 'CUSTOM_HTML') ? htmlContent : null
  );

  // Record impression once visible
  useEffect(() => {
    if (trackedImpression.current) return;
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !trackedImpression.current) {
          trackedImpression.current = true;
          void fetch('/api/v1/analytics/ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaign_id: campaignId, event: 'impression', placement }),
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [campaignId, placement]);

  const handleClick = () => {
    void fetch('/api/v1/analytics/ad', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign_id: campaignId, event: 'click', placement }),
    });
  };

  // PIXEL type — invisible 1×1 tracking pixel
  if (type === 'PIXEL') {
    return htmlContent ? (
      <div
        ref={containerRef}
        className="hidden"
        aria-hidden="true"
      />
    ) : null;
  }

  // CUSTOM_HTML type — raw HTML injection (for AdSense code, etc.)
  if (type === 'CUSTOM_HTML') {
    return (
      <div
        ref={containerRef}
        className={className}
      />
    );
  }

  // NATIVE type — styled card ad
  if (type === 'NATIVE') {
    const content = (
      <div
        ref={containerRef}
        className={`rounded-xl overflow-hidden flex gap-3 p-3 cursor-pointer transition-opacity hover:opacity-90 ${className}`}
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}
        onClick={handleClick}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="ad" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
        )}
        <div className="flex flex-col justify-center gap-1 min-w-0">
          <span
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: 'var(--text-tertiary)' }}
          >
            Sponsored
          </span>
          {htmlContent && (
            <p className="text-sm leading-snug line-clamp-2" style={{ color: 'var(--text-primary)' }}>
              {htmlContent}
            </p>
          )}
        </div>
      </div>
    );
    if (linkUrl) {
      return (
        <a href={linkUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={handleClick}>
          {content}
        </a>
      );
    }
    return content;
  }

  // BANNER type (default)
  const banner = (
    <div
      ref={containerRef}
      className={`overflow-hidden rounded-xl ${className}`}
      onClick={handleClick}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt="advertisement"
          className="w-full h-auto object-cover cursor-pointer"
        />
      ) : htmlContent ? (
        <div ref={containerRef} className="w-full" />
      ) : null}
    </div>
  );

  if (linkUrl) {
    return (
      <a href={linkUrl} target="_blank" rel="noopener noreferrer sponsored" onClick={handleClick}>
        {banner}
      </a>
    );
  }
  return banner;
}
