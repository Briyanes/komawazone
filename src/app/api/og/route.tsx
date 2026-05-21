import { ImageResponse } from 'next/og';
import { NextRequest } from 'next/server';
/* eslint-disable @next/next/no-img-element */

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get('title') ?? 'Komawa Zone';
  const cover = searchParams.get('cover') ?? '';
  const status = searchParams.get('status') ?? '';
  const rating = searchParams.get('rating') ?? '';

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          background: '#0D0D0D',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background cover blurred */}
        {cover && (
          <img
            src={cover}
            alt=""
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 0.18,
              filter: 'blur(8px)',
            }}
          />
        )}
        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(13,13,13,0.7) 100%)',
          }}
        />

        {/* Cover thumbnail */}
        {cover && (
          <div
            style={{
              position: 'absolute',
              right: 80,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 200,
              height: 280,
              borderRadius: 16,
              overflow: 'hidden',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              border: '2px solid rgba(255,255,255,0.08)',
              display: 'flex',
            }}
          >
            <img src={cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        )}

        {/* Left content */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '60px 80px',
            maxWidth: cover ? '780px' : '1100px',
            gap: 16,
          }}
        >
          {/* Site badge */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(255,107,53,0.15)',
              border: '1px solid rgba(255,107,53,0.35)',
              borderRadius: 999,
              padding: '6px 16px',
              width: 'fit-content',
            }}
          >
            <span style={{ color: '#FF6B35', fontSize: 14, fontWeight: 700 }}>📚 Komawa Zone</span>
          </div>

          {/* Title */}
          <div
            style={{
              color: '#FFFFFF',
              fontSize: title.length > 40 ? 48 : 60,
              fontWeight: 800,
              lineHeight: 1.1,
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              letterSpacing: '-1px',
            }}
          >
            {title}
          </div>

          {/* Meta */}
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            {status && (
              <div
                style={{
                  background: status === 'ONGOING' ? 'rgba(16,185,129,0.2)' : 'rgba(59,130,246,0.2)',
                  border: `1px solid ${status === 'ONGOING' ? 'rgba(16,185,129,0.5)' : 'rgba(59,130,246,0.5)'}`,
                  color: status === 'ONGOING' ? '#10B981' : '#3B82F6',
                  borderRadius: 999,
                  padding: '5px 14px',
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                {status}
              </div>
            )}
            {rating && parseFloat(rating) > 0 && (
              <div style={{ color: '#F59E0B', fontSize: 18, fontWeight: 700 }}>
                ★ {parseFloat(rating).toFixed(1)}
              </div>
            )}
          </div>

          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>
            Read free manga & manhwa on Komawa Zone
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
