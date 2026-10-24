-- Hadbit cloud backup: one row per account holding a JSON snapshot of the app's data.
-- Run once in Supabase → SQL Editor.

create table if not exists public.hadbit_backups (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.hadbit_backups enable row level security;

-- Each signed-in user can only see and change their own backup.
create policy "read own backup" on public.hadbit_backups
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "create own backup" on public.hadbit_backups
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "update own backup" on public.hadbit_backups
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "delete own backup" on public.hadbit_backups
  for delete to authenticated using ((select auth.uid()) = user_id);
