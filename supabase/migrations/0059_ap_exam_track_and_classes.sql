-- 0059: AB/BC track for the AP Examination, and classes AP1 / AP2.
-- Additive and reversible: one nullable column, two guarded inserts.
-- Existing attempts keep track = null and are unaffected.

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
