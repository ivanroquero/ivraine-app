-- Visitor IP & Location activity logs for Admin dashboard (accessible from Vercel & Railway)
create table if not exists public.ivraine_visitor_logs (
  id uuid primary key default gen_random_uuid(),
  ip text not null default '127.0.0.1',
  section text not null default 'Scrapbook',
  action text not null default 'Visit',
  details text not null default '',
  user_name text not null default 'Visitor',
  user_agent text not null default '',
  dodge_count int not null default 0,
  latitude double precision,
  longitude double precision,
  full_address text not null default '',
  city text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);

-- Ensure columns exist if table was already created previously
alter table public.ivraine_visitor_logs add column if not exists latitude double precision;
alter table public.ivraine_visitor_logs add column if not exists longitude double precision;
alter table public.ivraine_visitor_logs add column if not exists full_address text not null default '';
alter table public.ivraine_visitor_logs add column if not exists city text not null default '';
alter table public.ivraine_visitor_logs add column if not exists country text not null default '';
alter table public.ivraine_visitor_logs add column if not exists device_id text not null default '';

alter table public.ivraine_visitor_logs enable row level security;

-- Drop existing policies if re-running in SQL Editor
drop policy if exists ivraine_visitor_logs_insert on public.ivraine_visitor_logs;
drop policy if exists ivraine_visitor_logs_select on public.ivraine_visitor_logs;
drop policy if exists ivraine_visitor_logs_delete on public.ivraine_visitor_logs;

-- Allow anon visitors (Scrapbook) and authenticated users (Private Space) to insert logs
create policy ivraine_visitor_logs_insert on public.ivraine_visitor_logs
  for insert to anon, authenticated with check (true);

-- Allow reading logs for the admin dashboard
create policy ivraine_visitor_logs_select on public.ivraine_visitor_logs
  for select to anon, authenticated using (true);

-- Allow clearing logs from the admin dashboard
create policy ivraine_visitor_logs_delete on public.ivraine_visitor_logs
  for delete to anon, authenticated using (true);

grant select, insert, delete on public.ivraine_visitor_logs to anon, authenticated;
