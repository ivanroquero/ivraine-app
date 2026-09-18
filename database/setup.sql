-- Run once in a dedicated Supabase project's SQL Editor. Transactional: all or nothing.
begin;
create function public.ivraine_valid_photos(paths text[], book uuid, author uuid) returns boolean language sql immutable security invoker set search_path = '' as $$
 select array_position(paths,null) is null and cardinality(paths)<=12 and coalesce(bool_and(length(p)<=220 and p ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$' and split_part(p,'/',1)=book::text and split_part(p,'/',2)=author::text),true) from unnest(paths) p;
$$;
create table public.ivraine_books (
 id uuid primary key default gen_random_uuid(),
 title text not null default 'Our little space' check(length(title) between 1 and 160),
 partner_one text not null default 'Ivan Roquero',
 partner_two text not null default 'Loraine Cacho',
 anniversary date not null default '2026-09-02',
 created_at timestamptz not null default now()
);
create table public.ivraine_members (
 user_id uuid primary key references auth.users(id) on delete cascade,
 book_id uuid not null references public.ivraine_books(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 80)
);
create index ivraine_members_book_idx on public.ivraine_members(book_id);
create table public.ivraine_entries (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.ivraine_books(id) on delete cascade,
 author_id uuid not null references auth.users(id),
 kind text not null check(kind in ('memory','note','plan','date','song','voice')),
 title text not null check(length(trim(title)) between 1 and 160),
 body text not null default '' check(length(body)<=12000),
 event_date date not null,
 location text not null default '' check(length(location)<=160),
 photo_paths text[] not null default '{}' check(public.ivraine_valid_photos(photo_paths,book_id,author_id)),
 chapter text not null default 'Our story' check(length(chapter)<=80),
 recurrence text not null default 'none' check(recurrence in ('none','monthly','yearly')),
 song_url text not null default '' check(length(song_url)<=2000 and (song_url='' or song_url ~ '^https://(open\.spotify\.com|music\.apple\.com|www\.youtube\.com|youtube\.com|youtu\.be|music\.youtube\.com|soundcloud\.com)/')),
 artist text not null default '' check(length(artist)<=160),
 favorite boolean not null default false,
 completed boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index ivraine_entries_book_date_idx on public.ivraine_entries(book_id,event_date desc,id);
create index ivraine_entries_author_idx on public.ivraine_entries(author_id);
create function public.ivraine_touch_entry() returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end; $$;
revoke all on function public.ivraine_touch_entry() from public;
create trigger ivraine_touch before update on public.ivraine_entries for each row execute function public.ivraine_touch_entry();
alter table public.ivraine_books enable row level security;
alter table public.ivraine_members enable row level security;
alter table public.ivraine_entries enable row level security;
revoke all on public.ivraine_books,public.ivraine_members,public.ivraine_entries from anon,authenticated;
grant select on public.ivraine_books,public.ivraine_members,public.ivraine_entries to authenticated;
grant insert(id,book_id,author_id,kind,title,body,event_date,location,photo_paths,chapter,recurrence,song_url,artist,favorite,completed) on public.ivraine_entries to authenticated;
grant update(title,body,event_date,location,chapter,recurrence,song_url,artist,favorite,completed) on public.ivraine_entries to authenticated;
grant delete on public.ivraine_entries to authenticated;
create policy ivraine_self_membership on public.ivraine_members for select to authenticated using(user_id=(select auth.uid()));
create policy ivraine_read_book on public.ivraine_books for select to authenticated using(id in (select book_id from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_read_entry on public.ivraine_entries for select to authenticated using(book_id in (select book_id from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_add_entry on public.ivraine_entries for insert to authenticated with check(author_id=(select auth.uid()) and book_id in (select book_id from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_edit_entry on public.ivraine_entries for update to authenticated using(book_id in (select book_id from public.ivraine_members where user_id=(select auth.uid()))) with check(book_id in (select book_id from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_delete_entry on public.ivraine_entries for delete to authenticated using(book_id in (select book_id from public.ivraine_members where user_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('ivraine-photos','ivraine-photos',false,8388608,array['image/jpeg','image/png','image/webp']);
create policy ivraine_photo_read on storage.objects for select to authenticated using(bucket_id='ivraine-photos' and split_part(name,'/',1) in (select book_id::text from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_photo_add on storage.objects for insert to authenticated with check(bucket_id='ivraine-photos' and split_part(name,'/',2)=(select auth.uid())::text and split_part(name,'/',1) in (select book_id::text from public.ivraine_members where user_id=(select auth.uid())));
create policy ivraine_photo_delete on storage.objects for delete to authenticated using(bucket_id='ivraine-photos' and split_part(name,'/',1) in (select book_id::text from public.ivraine_members where user_id=(select auth.uid())));
commit;
