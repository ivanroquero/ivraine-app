-- Apply after the original database/setup.sql. Private schema is not exposed via Data API.
begin;
create schema if not exists ivraine_private;
revoke all on schema ivraine_private from public, anon, authenticated;
create table ivraine_private.push_subscriptions (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 book_id uuid not null references public.ivraine_books(id) on delete cascade,
 endpoint text not null unique check(length(endpoint)<=4096 and endpoint like 'https://%'),
 p256dh text not null check(length(p256dh)<=100),
 auth text not null check(length(auth)<=30),
 key_id text not null check(length(key_id)=64),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index push_subscriptions_recipient_idx on ivraine_private.push_subscriptions(book_id,user_id,key_id);
create index push_subscriptions_user_idx on ivraine_private.push_subscriptions(user_id);
create table ivraine_private.heart_events (
 id uuid primary key default gen_random_uuid(),
 book_id uuid not null references public.ivraine_books(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 created_at timestamptz not null default now(),
 check(sender_id<>recipient_id),
 unique(sender_id,request_id)
);
create index heart_events_sender_time_idx on ivraine_private.heart_events(sender_id,created_at desc);
create index heart_events_recipient_time_idx on ivraine_private.heart_events(recipient_id,book_id,created_at desc);
create index heart_events_book_idx on ivraine_private.heart_events(book_id);
create table ivraine_private.push_deliveries (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references ivraine_private.heart_events(id) on delete cascade,
 subscription_id uuid references ivraine_private.push_subscriptions(id) on delete set null,
 status text not null default 'pending' check(status in ('pending','sending','accepted','failed')),
 attempts integer not null default 0 check(attempts between 0 and 5),
 next_attempt_at timestamptz not null default now(),
 locked_until timestamptz,
 lease_id uuid,
 last_error text,
 created_at timestamptz not null default now(),
 unique(event_id,subscription_id)
);
create index push_deliveries_queue_idx on ivraine_private.push_deliveries(status,next_attempt_at,locked_until);
create index push_deliveries_subscription_idx on ivraine_private.push_deliveries(subscription_id);
alter table ivraine_private.push_subscriptions enable row level security;
alter table ivraine_private.heart_events enable row level security;
alter table ivraine_private.push_deliveries enable row level security;
revoke all on all tables in schema ivraine_private from public, anon, authenticated;
-- Only the Railway backend's private PostgreSQL connection reads/writes these tables.
-- No SECURITY DEFINER functions or client-visible subscription keys.
commit;
