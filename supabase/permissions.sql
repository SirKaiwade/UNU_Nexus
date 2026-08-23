-- Nexus permissions (simplified): user library roles + per-folder viewers.
-- Run in: Supabase Dashboard → SQL Editor → paste → Run
-- (Safe to re-run; additive / idempotent.)

-- ---------------------------------------------------------------------------
-- Profiles: admin, soft-disable, library role
-- library_role: none | view | edit
--   none  = No access (library hidden)
--   view  = Read only (see allowed folders; no upload/delete)
--   edit  = Can edit (upload / organize in folders they can see)
-- Admins always have full access regardless of library_role.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

alter table public.profiles
  add column if not exists disabled_at timestamptz;

alter table public.profiles
  add column if not exists disabled_reason text;

alter table public.profiles
  add column if not exists library_role text;

update public.profiles
set library_role = 'none'
where library_role is null;

alter table public.profiles
  alter column library_role set default 'none';

-- Bootstrap admin (you).
update public.profiles
set is_admin = true, library_role = 'edit'
where lower(email) = 'ayhnassef@unu.edu';

-- ---------------------------------------------------------------------------
-- Banned emails
-- ---------------------------------------------------------------------------
create table if not exists public.banned_emails (
  email text primary key,
  reason text,
  banned_by text,
  banned_at timestamptz not null default now()
);

alter table public.banned_emails enable row level security;
-- Policies: supabase/security.sql

-- ---------------------------------------------------------------------------
-- Folder viewers (who can see a restricted folder)
-- Empty set for a path = everyone with library access can see it.
-- Any rows for a path = only those users (+ admins) can see that folder
-- and its subfolders (most-specific path wins).
-- ---------------------------------------------------------------------------
create table if not exists public.library_folder_viewers (
  folder_path text not null,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (folder_path, profile_id)
);

create index if not exists library_folder_viewers_path_idx
  on public.library_folder_viewers (folder_path);

alter table public.library_folder_viewers enable row level security;
-- Policies: supabase/security.sql

-- Presence of a row = folder is restricted (even with zero viewers → admins only).
create table if not exists public.library_folder_locks (
  folder_path text primary key,
  created_at timestamptz not null default now()
);

alter table public.library_folder_locks enable row level security;
-- Policies: supabase/security.sql

comment on table public.library_folder_viewers is
  'Allow-list of profiles for a locked folder. Empty allow-list + lock = admins only.';

-- Then run supabase/security.sql (RLS policies, auth triggers, grants).
