-- FIRST: create the two confirmed users in Supabase Authentication > Users.
-- Replace both emails below with the EXACT emails of those users. Run once.
-- No invitations or emails are sent by this SQL.
begin;
do $$
declare
 ivan_email text := 'ivanlloydr15@gmail.com';
 loraine_email text := 'ivanlloydroquero18@gmail.com';
 ivan_id uuid;
 loraine_id uuid;
 book uuid;
begin
 select id into ivan_id from auth.users where lower(email)=lower(ivan_email) and email_confirmed_at is not null;
 select id into loraine_id from auth.users where lower(email)=lower(loraine_email) and email_confirmed_at is not null;
 if ivan_id is null or loraine_id is null or ivan_id=loraine_id then raise exception 'Create two distinct confirmed Auth users and replace both emails first.'; end if;
 if exists(select 1 from public.ivraine_members where user_id in (ivan_id,loraine_id)) then raise exception 'One of these users already belongs to a scrapbook. Setup cancelled.'; end if;
 insert into public.ivraine_books default values returning id into book;
 insert into public.ivraine_members(user_id,book_id,display_name) values(ivan_id,book,'Ivan'),(loraine_id,book,'Loraine');
end $$;
commit;
