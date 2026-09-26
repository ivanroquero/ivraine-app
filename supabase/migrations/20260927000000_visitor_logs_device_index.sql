-- Speeds up per-device pin lookups/deletes now that every insert always
-- populates device_id (previously it was only embedded inside `details`).
create index if not exists idx_ivraine_visitor_logs_device_id
  on public.ivraine_visitor_logs (device_id);