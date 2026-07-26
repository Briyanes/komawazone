-- ============================================================
-- Migration 056: email_log table (anti-spam dedup for Resend)
-- ============================================================
-- Tracks every transactional/promotional email sent so the daily
-- cron can apply a 24h+ cooldown per (user_id, email_type) pair.
--
-- Also adds email_consent column to users (default true, opt-out).
--
-- NOTE (fix): Previous version used `(created_at::date)` as index
-- expression, but Postgres rejects it because `timestamptz::date`
-- is only STABLE (timezone-dependent), not IMMUTABLE.
-- Fix: use a physical `sent_date date` column auto-filled by trigger.

-- 1) email_log table -------------------------------------------------
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  email_type  text not null,
  recipient   text not null,           -- email address at time of send
  status      text not null default 'sent',  -- sent | failed | skipped
  resend_id   text,                    -- Resend message id (for tracing)
  error       text,                    -- error message if failed
  sent_date   date,                    -- UTC date (auto-filled by trigger, for dedup index)
  created_at  timestamptz not null default now()
);

-- 2) Trigger: auto-fill sent_date from created_at (UTC-fixed, IMMUTABLE-safe)
-- This lets us build a normal unique index on a column instead of an
-- expression (which would require IMMUTABLE function).
create or replace function public.set_email_log_sent_date()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Coalesce handles the rare case where sent_date is explicitly provided.
  new.sent_date := coalesce(new.sent_date, (new.created_at at time zone 'UTC')::date);
  return new;
end;
$$;

drop trigger if exists trg_email_log_sent_date on public.email_log;
create trigger trg_email_log_sent_date
  before insert on public.email_log
  for each row execute function public.set_email_log_sent_date();

-- 3) Dedup unique index — uses plain column (no expression, no IMMUTABLE issue)
create unique index if not exists email_log_user_type_day_uidx
  on public.email_log (user_id, email_type, sent_date);

-- Fast lookup for "last sent this type to this user"
create index if not exists email_log_user_type_created_idx
  on public.email_log (user_id, email_type, created_at desc);

-- 4) email_consent column on users ----------------------------------
alter table public.users
  add column if not exists email_consent boolean not null default true;

comment on column public.users.email_consent is
  'User opt-in for promotional emails (trial reminder, VIP expiry). Defaults true; user can disable in profile.';

-- 5) RLS -------------------------------------------------------------
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

-- 6) Auto-cleanup: keep only 90 days of email log -------------------
create or replace function public.cleanup_old_email_log(days_to_keep int default 90)
returns int
language plpgsql
security definer
set search_path = public
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