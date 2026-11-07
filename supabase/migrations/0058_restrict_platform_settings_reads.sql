-- Expose only the payment instructions that organization members need in
-- their billing dashboard. All other platform_settings values (including
-- Super Admin identity and internal platform/proctoring settings) remain
-- readable only by the Super Admin or server-side service-role clients.
drop policy if exists ps_select on public.platform_settings;
create policy ps_select on public.platform_settings
  for select to authenticated
  using (key = 'payment_instructions' or public.is_super_admin());
