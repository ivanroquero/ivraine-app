-- Add micro-message support to heart sharing
begin;
alter table if exists ivraine_private.heart_events add column if not exists message text not null default '' check(length(message)<=160);
commit;
