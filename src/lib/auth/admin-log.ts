import { createServiceClient } from '@/lib/supabase/service';
import type { User } from '@supabase/supabase-js';

/**
 * Admin Activity Log — async, non-blocking logger.
 *
 * Writes to `admin_activity_logs` via service-role client.
 * Fire-and-forget: never throws or blocks the API response.
 */

export type AdminAction =
  | 'CREATE' | 'UPDATE' | 'DELETE'
  | 'SCRAP'  | 'IMPORT' | 'EXPORT'
  | 'BULK_UPDATE' | 'BULK_DELETE'
  | 'REGENERATE'  | 'RETRY' | 'OTHER';

export interface LogEntry {
  admin:    User;
  action:   AdminAction;
  entity:   string;          // e.g. 'manga', 'chapter', 'user', 'voucher', 'settings'
  entityId?: string | null;
  method?:  string;          // default 'POST'
  path:     string;
  status?:  number;
  details?: Record<string, unknown>;
  ip?:      string | null;
  userAgent?: string | null;
}

/**
 * Log an admin action asynchronously.
 * Fire-and-forget — never blocks the API response.
 */
export function logAdminAction(entry: LogEntry): void {
  void logAdminActionAsync(entry).catch((err) => {
    console.error('[admin-log] Failed to log admin action:', err);
  });
}

async function logAdminActionAsync(entry: LogEntry): Promise<void> {
  const supabase = createServiceClient();

  /* eslint-disable @typescript-eslint/no-explicit-any */
  // The `admin_activity_logs` table is created by migration 052,
  // but Supabase TS types haven't been regenerated yet. The
  // service-role client supports any table at runtime, so we
  // bypass the strict generated types with a minimal interface.
  const db = supabase as unknown as {
    from(table: string): {
      insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
    };
  };

  const { error } = await db.from('admin_activity_logs').insert({
    admin_id:    entry.admin.id,
    admin_email: entry.admin.email ?? null,
    action:      entry.action,
    entity_type: entry.entity,
    entity_id:   entry.entityId ?? null,
    method:      entry.method ?? 'POST',
    path:        entry.path.slice(0, 500),
    status_code: entry.status  ?? null,
    details:     entry.details ?? null,
    ip_address:  entry.ip?.slice(0, 45) ?? null,
    user_agent:  entry.userAgent?.slice(0, 300) ?? null,
  });
  /* eslint-enable @typescript-eslint/no-explicit-any */

  if (error) {
    console.error('[admin-log] insert error:', error.message);
  }
}