-- Public contact messages are created through the validated server action,
-- which uses the service role. Do not expose unrestricted INSERT on the REST
-- table to anonymous or authenticated clients (arbitrary user_id/status data).
drop policy if exists sup_insert on public.support_tickets;
