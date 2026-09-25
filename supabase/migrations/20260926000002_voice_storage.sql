-- Create ivraine-voice storage bucket, column, and RLS policies for voice memos
begin;

-- Ensure ivraine_entries has the voice_url column
alter table public.ivraine_entries
add column if not exists voice_url text not null default ''
check(length(voice_url)<=2000 and (voice_url='' or voice_url ~ '^https://.+\.(mp3|m4a|wav|ogg|webm|aac)(\?.*)?$'));

-- Ensure authenticated role can insert and update voice_url
grant insert(voice_url), update(voice_url) on public.ivraine_entries to authenticated;

-- Ensure kind constraint permits 'voice' kind
alter table public.ivraine_entries drop constraint if exists ivraine_entries_kind_check;
alter table public.ivraine_entries add constraint ivraine_entries_kind_check check(kind in ('memory','note','plan','date','song','voice'));

-- Ensure ivraine_user_book_id helper exists in database
create or replace function public.ivraine_user_book_id(user_uuid uuid) returns uuid language sql security definer stable set search_path = '' as $$
 select book_id from public.ivraine_members where user_id = user_uuid;
$$;
revoke all on function public.ivraine_user_book_id(uuid) from public;
grant execute on function public.ivraine_user_book_id(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ivraine-voice','ivraine-voice',true,16777216,array['audio/webm','audio/mp4','audio/x-m4a','audio/m4a','audio/mpeg','audio/wav','audio/ogg','audio/aac'])
on conflict (id) do nothing;

drop policy if exists ivraine_voice_read on storage.objects;
create policy ivraine_voice_read on storage.objects for select to authenticated using(bucket_id='ivraine-voice' and split_part(name,'/',1) = public.ivraine_user_book_id((select auth.uid()))::text);

drop policy if exists ivraine_voice_add on storage.objects;
create policy ivraine_voice_add on storage.objects for insert to authenticated with check(bucket_id='ivraine-voice' and split_part(name,'/',2)=(select auth.uid())::text and split_part(name,'/',1) = public.ivraine_user_book_id((select auth.uid()))::text);

drop policy if exists ivraine_voice_delete on storage.objects;
create policy ivraine_voice_delete on storage.objects for delete to authenticated using(bucket_id='ivraine-voice' and split_part(name,'/',1) = public.ivraine_user_book_id((select auth.uid()))::text);

commit;
