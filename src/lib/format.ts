/**
 * Shared formatting utilities.
 */

/**
 * Format a date string into a relative "time ago" label in Indonesian.
 *
 * @example
 * timeAgo('2024-01-01') // "1thn lalu"
 * timeAgo(new Date(Date.now() - 3600_000).toISOString()) // "1j lalu"
 */
export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 60) return `${mins}m lalu`;
  if (hours < 24) return `${hours}j lalu`;
  if (days < 7) return `${days}h lalu`;
  if (days < 30) return `${Math.floor(days / 7)}mgg lalu`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}bln lalu`;

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  return remainingMonths > 0
    ? `${years}thn ${remainingMonths}bln lalu`
    : `${years}thn lalu`;
}

/**
 * Compact view count formatter (e.g. 1500 -> "2k", 1250000 -> "1.3M").
 */
export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${(views / 1_000_000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(0)}k`;
  return String(views);
}