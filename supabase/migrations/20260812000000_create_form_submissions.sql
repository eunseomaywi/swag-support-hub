create extension if not exists pgcrypto;

create table public.peer_mentor_bookings (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  year_group text not null check (length(btrim(year_group)) > 0),
  email text not null check (length(btrim(email)) > 0),
  preferred_date date not null,
  preferred_time text not null check (length(btrim(preferred_time)) > 0),
  topic text not null check (length(btrim(topic)) > 0),
  additional_info text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'cancelled')),
  created_at timestamptz not null default now()
);

create table public.concerns (
  id uuid primary key default gen_random_uuid(),
  is_anonymous boolean not null default false,
  name text,
  year_group text not null check (length(btrim(year_group)) > 0),
  email text,
  category text not null check (length(btrim(category)) > 0),
  feeling text not null check (length(btrim(feeling)) > 0),
  details text not null check (length(btrim(details)) > 0),
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'cancelled')),
  created_at timestamptz not null default now(),
  constraint concerns_identity_check check (
    (is_anonymous and name is null)
    or (not is_anonymous and name is not null and length(btrim(name)) > 0)
  )
);

alter table public.peer_mentor_bookings enable row level security;
alter table public.concerns enable row level security;

revoke all on table public.peer_mentor_bookings from anon, authenticated;
revoke all on table public.concerns from anon, authenticated;
grant insert on table public.peer_mentor_bookings to anon, authenticated;
grant insert on table public.concerns to anon, authenticated;

create policy "Public can submit peer mentor bookings"
on public.peer_mentor_bookings
for insert
to anon, authenticated
with check (status = 'pending');

create policy "Public can submit concerns"
on public.concerns
for insert
to anon, authenticated
with check (status = 'pending');

comment on table public.concerns is
  'Sensitive student support requests. Do not add a public SELECT policy.';
