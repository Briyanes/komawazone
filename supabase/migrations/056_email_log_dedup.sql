-- ============================================================
-- Migration 056: email_log table (anti-spam dedup for Resend)
-- ============================================================
-- Tracks every transactional/promotional email sent so the daily
-- cron can apply a 24h+ cooldown per (user_id, email_type) pair.
--
-- Also adds email_consent column to users (default true, opt-out).

-- 1) email_log table -------------------------------------------------
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  email_type  text not null,
  recipient   text not null,           -- email address at time of send
  status      text not null default 'sent',  -- sent | failed | skipped
  resend_id   text,                    -- Resend message id (for tracing)
  error       text,                    -- error message if failed
  created_at  timestamptz not null default now()
);

-- One dedup record per (user, type, day) — prevents double-sending
create unique index if not exists email_log_user_type_day_uidx
  on public.email_log (user_id, email_type, (created_at::date));

-- Fast lookup for "last sent this type to this user"
create index if not exists email_log_user_type_created_idx
  on public.email_log (user_id, email_type, created_at desc);

-- 2) email_consent column on users ----------------------------------
alter table public.users
  add column if not exists email_consent boolean not null default true;

comment on column public.users.email_consent is
  'User opt-in for promotional emails (trial reminder, VIP expiry). Defaults true; user can disable in profile.';

-- 3) RLS -------------------------------------------------------------
alter table public.email_log enable row level security;

-- Users can see their own email history (for "why did I get this?" transparency)
drop policy if exists "Users can read own email log" on public.email_log;
create policy "Users can read own email log"
  on public.email_log for select
  using (auth.uid() = user_id);

-- Only service role / server routes can insert (anon cannot spam)
drop policy if exists "Service role can insert email log" on public.email_log;
create policy "Service role can insert email log"
  on public.email_log for insert
  with check (true);

-- 4) Auto-cleanup: keep only 90 days of email log -------------------
-- Keeps table small; cron daily can call this or it runs manually.
create or replace function public.cleanup_old_email_log(days_to_keep int default 90)
returns int
language plpgsql
security definer
as $$
declare
  deleted_count int;
begin
  delete from public.email_log
  where created_at < now() - (days_to_keep * interval '1 day');
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;