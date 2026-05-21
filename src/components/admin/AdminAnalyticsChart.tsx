'use client';

import { useEffect, useState } from 'react';
import { FileText, Users } from 'lucide-react';

interface DayStat {
  date: string;
  chapters: number;
  users: number;
}

function Sparkline({ data, color, height = 48 }: { data: number[]; color: string; height?: number }) {
  const max = Math.max(...data, 1);
  const width = 300;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const area = `0,${height} ` + pts + ` ${width},${height}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function AdminAnalyticsChart() {
  const [data, setData] = useState<DayStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void fetch('/api/v1/admin/analytics')
      .then(r => r.json())
      .then((d: { status: string; data: DayStat[] }) => {
        if (d.status === 'success') setData(d.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const chapterData = data.map(d => d.chapters);
  const userData    = data.map(d => d.users);
  const totalChapters = chapterData.reduce((a, b) => a + b, 0);
  const totalUsers    = userData.reduce((a, b) => a + b, 0);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[0, 1].map(i => (
          <div key={i} className="rounded-xl p-4 animate-pulse" style={{ background: 'var(--bg-secondary)', height: 120 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {/* Chapters card */}
      <div className="rounded-xl p-4 overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center gap-2 mb-1">
          <FileText size={14} style={{ color: '#3B82F6' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Chapter Diunggah (30 hari)
          </span>
        </div>
        <p className="text-2xl font-bold tabular-nums mb-2" style={{ color: 'var(--text-primary)' }}>
          {totalChapters}
        </p>
        <Sparkline data={chapterData} color="#3B82F6" />
      </div>

      {/* Users card */}
      <div className="rounded-xl p-4 overflow-hidden" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-light)' }}>
        <div className="flex items-center gap-2 mb-1">
          <Users size={14} style={{ color: '#10B981' }} />
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
            Pengguna Baru (30 hari)
          </span>
        </div>
        <p className="text-2xl font-bold tabular-nums mb-2" style={{ color: 'var(--text-primary)' }}>
          {totalUsers}
        </p>
        <Sparkline data={userData} color="#10B981" />
      </div>
    </div>
  );
}
