-- Members retain read access to associations, but cannot delete them unless
-- they are authorized content creators. FOR ALL's USING applies to DELETE.
drop policy if exists ccurr_all on public.class_curricula;
create policy ccurr_select_members on public.class_curricula for select to authenticated
  using (public.is_org_member(public.class_org(class_id)) or public.is_super_admin());
create policy ccurr_write_creators on public.class_curricula for all to authenticated
  using (public.can_create_content(public.class_org(class_id)) or public.is_super_admin())
  with check (public.can_create_content(public.class_org(class_id)) or public.is_super_admin());

drop policy if exists csubj_all on public.class_subjects;
create policy csubj_select_members on public.class_subjects for select to authenticated
  using (public.is_org_member(public.class_org(class_id)) or public.is_super_admin());
create policy csubj_write_creators on public.class_subjects for all to authenticated
  using (public.can_create_content(public.class_org(class_id)) or public.is_super_admin())
  with check (public.can_create_content(public.class_org(class_id)) or public.is_super_admin());

drop policy if exists cphase_all on public.competition_event_phases;
create policy cphase_select_members on public.competition_event_phases for select to authenticated
  using (public.is_org_member(public.event_org(event_id)) or public.is_super_admin());
create policy cphase_write_creators on public.competition_event_phases for all to authenticated
  using (public.can_create_content(public.event_org(event_id)) or public.is_super_admin())
  with check (public.can_create_content(public.event_org(event_id)) or public.is_super_admin());

drop policy if exists cpclass_all on public.competition_phase_classes;
create policy cpclass_select_members on public.competition_phase_classes for select to authenticated
  using (public.is_org_member(public.phase_org(phase_id)) or public.is_super_admin());
create policy cpclass_write_creators on public.competition_phase_classes for all to authenticated
  using (public.can_create_content(public.phase_org(phase_id)) or public.is_super_admin())
  with check (public.can_create_content(public.phase_org(phase_id)) or public.is_super_admin());
