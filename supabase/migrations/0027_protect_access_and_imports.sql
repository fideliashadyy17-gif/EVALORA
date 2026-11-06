-- Restrict competition access codes and personal import/registration data.
-- Join endpoints use a service client after validating codes and admission.
-- Individual registrations remain visible to their authenticated owner.
drop policy if exists cac_select on public.competition_access_codes;
create policy cac_select on public.competition_access_codes for select to authenticated
  using (public.is_super_admin() or exists (select 1 from public.competitions c
    where c.id = competition_id and coalesce(public.org_role(c.organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'),false)));

drop policy if exists creg_select on public.competition_registrations;
create policy creg_select on public.competition_registrations for select to authenticated
  using (public.is_super_admin() or user_id = auth.uid() or exists (select 1 from public.competitions c
    where c.id = competition_id and coalesce(public.org_role(c.organization_id) in
      ('owner','admin','teacher','organizer','supervisor','corrector'),false)));

drop policy if exists imp_select on public.import_batches;
create policy imp_select on public.import_batches for select to authenticated
  using (public.is_super_admin() or coalesce(public.org_role(organization_id) in
    ('owner','admin','teacher','organizer','supervisor','corrector'),false));
-- Existing creator/Super Admin write policies are unchanged.
