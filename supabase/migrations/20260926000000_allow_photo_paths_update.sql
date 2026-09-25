-- Allow updating photo_paths on existing memories and allow any member in the book to attach photos
grant update(photo_paths) on public.ivraine_entries to authenticated;

create or replace function public.ivraine_valid_photos(paths text[], book uuid, author uuid default null) returns boolean language sql immutable security invoker set search_path = '' as $$
 select array_position(paths,null) is null and cardinality(paths)<=12 and coalesce(bool_and(length(p)<=220 and p ~ '^[a-f0-9-]+/[a-f0-9-]+/[a-f0-9-]+\.(jpg|png|webp)$' and split_part(p,'/',1)=book::text),true) from unnest(paths) p;
$$;
