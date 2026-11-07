-- 0059: AB/BC track for the AP Examination, classes AP1 / AP2, and their link to the exam.
-- Additive and reversible: one nullable column, two guarded inserts, and one guarded
-- settings update on the AP examination created by 0058. No existing row is changed.

alter table public.exam_attempts
  add column if not exists track text
  check (track in ('AB', 'BC'));

comment on column public.exam_attempts.track is
  'AP Calculus track chosen at start (AB or BC). Null for examinations without track_selection.';

insert into public.classes (organization_id, name)
select '0a400000-0000-4000-8000-000000000001'::uuid, 'AP1 (AB or BC)'
where exists (select 1 from public.organizations where id = '0a400000-0000-4000-8000-000000000001'::uuid)
  and not exists (
    select 1 from public.classes
    where organization_id = '0a400000-0000-4000-8000-000000000001'::uuid
      and name = 'AP1 (AB or BC)'
  );

insert into public.classes (organization_id, name)
select '0a400000-0000-4000-8000-000000000001'::uuid, 'AP2 (AB or BC)'
where exists (select 1 from public.organizations where id = '0a400000-0000-4000-8000-000000000001'::uuid)
  and not exists (
    select 1 from public.classes
    where organization_id = '0a400000-0000-4000-8000-000000000001'::uuid
      and name = 'AP2 (AB or BC)'
  );

-- Eligibility: both classes may open the AP examination. Read by the access routes as
-- settings.linked_class_ids (exam.class_id holds only one class, so it cannot express two).
-- Written only while the key is absent, so re-running the migration never overwrites a later edit.
update public.exams e
set settings = e.settings || jsonb_build_object('linked_class_ids', (
      select coalesce(jsonb_agg(c.id order by c.name), '[]'::jsonb)
      from public.classes c
      where c.organization_id = '0a400000-0000-4000-8000-000000000001'::uuid
        and c.name in ('AP1 (AB or BC)', 'AP2 (AB or BC)')
    ))
where e.organization_id = '0a400000-0000-4000-8000-000000000001'::uuid
  and e.title = 'AP Examination'
  and e.settings->'linked_class_ids' is null;
