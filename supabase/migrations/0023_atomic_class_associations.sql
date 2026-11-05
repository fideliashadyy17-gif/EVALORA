-- 0023: replace subject/curriculum links together, without deleting existing
-- links when validation or a later write fails. Invoked only by the server's
-- Super Admin action using the service-role client. This adds a function and
-- does not alter existing rows or RLS policies.
create or replace function public.replace_class_associations(
  p_class_id uuid,
  p_organization_id uuid,
  p_subject_ids uuid[],
  p_programmes jsonb
) returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  programme_count integer;
  valid_count integer;
begin
  if p_class_id is null or p_organization_id is null or p_subject_ids is null
     or p_programmes is null or jsonb_typeof(p_programmes) <> 'array' then
    raise exception 'Invalid association request';
  end if;

  -- Serializes competing association updates for the same class.
  perform 1 from public.classes where id = p_class_id and organization_id = p_organization_id for update;
  if not found then raise exception 'Class not found in organization'; end if;

  if cardinality(p_subject_ids) <> (select count(distinct id) from unnest(p_subject_ids) as ids(id)) then
    raise exception 'Invalid or duplicate subject';
  end if;
  select count(*) into valid_count from public.subjects
    where organization_id = p_organization_id and id = any(p_subject_ids);
  if valid_count <> cardinality(p_subject_ids) then raise exception 'Subject not in organization'; end if;

  select count(*), count(distinct id) into programme_count, valid_count
    from jsonb_to_recordset(p_programmes) as x(id uuid, course_label text, needs_review boolean);
  if programme_count <> valid_count then raise exception 'Invalid or duplicate programme'; end if;
  if exists (select 1 from jsonb_to_recordset(p_programmes) as x(id uuid, course_label text, needs_review boolean)
             where length(coalesce(course_label, '')) > 120 or needs_review is null) then
    raise exception 'Invalid programme metadata';
  end if;
  select count(*) into valid_count from public.curriculum_programmes cp
    join jsonb_to_recordset(p_programmes) as x(id uuid, course_label text, needs_review boolean) on cp.id = x.id
    where cp.organization_id = p_organization_id;
  if valid_count <> programme_count then raise exception 'Programme not in organization'; end if;

  insert into public.class_subjects(class_id, subject_id)
    select p_class_id, id from unnest(p_subject_ids) as ids(id)
    on conflict (class_id, subject_id) do nothing;
  delete from public.class_subjects
    where class_id = p_class_id and not (subject_id = any(p_subject_ids));

  insert into public.class_curricula(class_id, programme_id, course_label, needs_review)
    select p_class_id, id, nullif(btrim(course_label), ''), needs_review
    from jsonb_to_recordset(p_programmes) as x(id uuid, course_label text, needs_review boolean)
    on conflict (class_id, programme_id) do update
      set course_label = excluded.course_label, needs_review = excluded.needs_review;
  delete from public.class_curricula cc where cc.class_id = p_class_id
    and not exists (select 1 from jsonb_to_recordset(p_programmes) as x(id uuid, course_label text, needs_review boolean)
                    where x.id = cc.programme_id);
end;
$$;

revoke all on function public.replace_class_associations(uuid, uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.replace_class_associations(uuid, uuid, uuid[], jsonb) to service_role;
