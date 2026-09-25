-- Create ivraine-voice storage bucket and RLS policies for voice memos
begin;

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
