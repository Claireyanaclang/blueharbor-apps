-- ============================================================
-- PropTrack + BizTrack — Supabase schema
-- Run this once in Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- One row per (person, app). A person can have a profile in
-- both proptrack and biztrack if they use both apps.
create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app text not null check (app in ('proptrack','biztrack')),
  name text not null,
  role text not null check (role in ('owner','manager','maintenance','clerk','custom')),
  custom_label text,
  pages jsonb not null default '[]'::jsonb,   -- only used when role = 'custom'
  created_at timestamptz not null default now(),
  unique (user_id, app)
);

alter table profiles enable row level security;

-- One JSON blob per app — this holds all of PropTrack's or BizTrack's
-- business data (properties, tenants, transactions, time entries, etc.)
-- exactly like the in-memory DB object the app already uses.
create table if not exists app_data (
  app text primary key check (app in ('proptrack','biztrack')),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table app_data enable row level security;

-- ------------------------------------------------------------
-- Helper functions (security definer = bypass RLS internally,
-- which avoids infinite-recursion errors when a policy needs to
-- query the very table it's protecting).
-- ------------------------------------------------------------
create or replace function public.is_owner(target_app text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and app = target_app and role = 'owner'
  );
$$;

create or replace function public.is_member(target_app text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where user_id = auth.uid() and app = target_app
  );
$$;

-- ------------------------------------------------------------
-- profiles policies
-- ------------------------------------------------------------
create policy "read own profile" on profiles
  for select using (auth.uid() = user_id);

create policy "owners read app profiles" on profiles
  for select using (is_owner(app));

create policy "owners manage app profiles" on profiles
  for all using (is_owner(app))
  with check (is_owner(app));

-- ------------------------------------------------------------
-- app_data policies — anyone with a profile row for that app
-- can read/write that app's shared data blob.
--
-- NOTE: this is workspace-level access, not page-level. A
-- Maintenance-role account technically has API access to the
-- same blob a Property Manager does; the app's UI hides pages
-- they shouldn't use, but a technically savvy user could still
-- read the raw blob via the API. If you later store something
-- highly sensitive (SSNs, bank details), ask me to split this
-- into normalized per-entity tables with real per-role RLS.
-- ------------------------------------------------------------
create policy "members read app_data" on app_data
  for select using (is_member(app));

create policy "members update app_data" on app_data
  for update using (is_member(app))
  with check (is_member(app));

create policy "members insert app_data" on app_data
  for insert with check (is_member(app));

-- Seed empty rows so the app always has something to read on first load.
insert into app_data (app, data) values ('proptrack', '{}'), ('biztrack', '{}')
  on conflict (app) do nothing;

-- ------------------------------------------------------------
-- Public "login directory" — lets the sign-in screen show
-- name/role picker cards WITHOUT exposing email or passwords.
-- This view intentionally excludes user_id and any credential data.
-- ------------------------------------------------------------
create or replace view public.login_directory as
  select id, app, name, role, custom_label from profiles;

grant select on public.login_directory to anon, authenticated;

-- ------------------------------------------------------------
-- IMPORTANT MANUAL STEP (do this in the dashboard, not SQL):
-- Go to Authentication -> Sign In / Providers -> Email
-- and lower "Minimum password length" to 4, since PINs are
-- used as the real account password under the hood.
-- ------------------------------------------------------------
