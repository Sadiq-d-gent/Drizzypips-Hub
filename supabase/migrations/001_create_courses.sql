create extension if not exists "pgcrypto";

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  short_description text not null,
  description text not null,
  learnings text[] not null default '{}',
  requirements text[] not null default '{}',
  duration text not null,
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD',
  thumbnail_url text,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists courses_published_created_at_idx
  on public.courses (published, created_at desc);

create index if not exists courses_slug_idx
  on public.courses (slug);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists courses_set_updated_at on public.courses;

create trigger courses_set_updated_at
before update on public.courses
for each row
execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admins
    where admins.auth_id = auth.uid()
  );
$$;

alter table public.admins enable row level security;
alter table public.courses enable row level security;

drop policy if exists "Admins can read their own profile" on public.admins;
create policy "Admins can read their own profile"
on public.admins
for select
to authenticated
using (auth_id = auth.uid());

drop policy if exists "Public can read published courses" on public.courses;
create policy "Public can read published courses"
on public.courses
for select
to anon, authenticated
using (published = true);

drop policy if exists "Admins can read all courses" on public.courses;
create policy "Admins can read all courses"
on public.courses
for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins can insert courses" on public.courses;
create policy "Admins can insert courses"
on public.courses
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "Admins can update courses" on public.courses;
create policy "Admins can update courses"
on public.courses
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins can delete courses" on public.courses;
create policy "Admins can delete courses"
on public.courses
for delete
to authenticated
using (public.is_admin());
