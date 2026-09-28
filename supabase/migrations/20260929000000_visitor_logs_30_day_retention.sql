-- 30-Day Retention Policy for Visitor Activity Logs
-- Ensures all visitor & location activity logs are preserved in history
-- and automatically purged once they exceed 30 days of age.

-- 1. Function to prune visitor logs older than 30 days
create or replace function public.prune_expired_visitor_logs(days_threshold integer default 30)
returns integer
language plpgsql
security definer
as $$
declare
  deleted_count integer;
begin
  delete from public.ivraine_visitor_logs
  where created_at < (now() - (days_threshold || ' days')::interval);
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Allow anon and authenticated to call the retention cleanup function
grant execute on function public.prune_expired_visitor_logs(integer) to anon, authenticated;

-- 2. Index created_at for fast retention pruning queries
create index if not exists idx_ivraine_visitor_logs_created_at
  on public.ivraine_visitor_logs (created_at);

-- 3. Execute immediately once to purge any existing logs older than 30 days
delete from public.ivraine_visitor_logs
where created_at < (now() - interval '30 days');
