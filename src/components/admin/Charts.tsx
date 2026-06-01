'use client';

interface BarData {
  label: string;   // e.g. "Jan 1"
  value: number;
}

interface BarChartProps {
  data: BarData[];
  color?: string;
  height?: number;
  formatValue?: (v: number) => string;
}

export function BarChart({
  data,
  color = 'var(--color-primary)',
  height = 120,
  formatValue = v => v.toLocaleString(),
}: BarChartProps) {
  if (!data.length) return (
    <div className="flex items-center justify-center py-10 text-sm" style={{ color: 'var(--text-tertiary)' }}>
      Belum ada data
    </div>
  );

  const max = Math.max(...data.map(d => d.value), 1);
  const barW = Math.max(4, Math.floor(100 / data.length) - 2);

  return (
    <div className="w-full">
      <div className="relative w-full overflow-x-auto">
        <svg
          width="100%"
          viewBox={`0 0 ${data.length * (barW + 2)} ${height}`}
          preserveAspectRatio="none"
          style={{ display: 'block', minHeight: height }}
        >
          {data.map((d, i) => {
            const barHeight = Math.max(2, (d.value / max) * (height - 4));
            const x = i * (barW + 2);
            const y = height - barHeight;
            return (
              <g key={i}>
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={color}
                  opacity={d.value === 0 ? 0.15 : 0.85}
                >
                  <title>{`${d.label}: ${formatValue(d.value)}`}</title>
                </rect>
              </g>
            );
          })}
        </svg>
      </div>
      {/* X-axis labels — show only first, middle, last */}
      <div className="mt-1 flex justify-between text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
        <span>{data[0]?.label}</span>
        <span>{data[Math.floor(data.length / 2)]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

interface HorizontalBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
  rank?: number;
}

export function HorizontalBar({ label, value, max, color = 'var(--color-primary)', rank }: HorizontalBarProps) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3 py-2">
      {rank !== undefined && (
        <span className="w-4 text-xs font-bold shrink-0" style={{ color: 'var(--text-tertiary)' }}>{rank}</span>
      )}
      <span className="w-32 truncate text-xs shrink-0" style={{ color: 'var(--text-primary)' }}>{label}</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="w-16 text-right text-xs tabular-nums shrink-0" style={{ color: 'var(--text-secondary)' }}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}
