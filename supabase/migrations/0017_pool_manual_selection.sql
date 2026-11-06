-- 0017 — Atomic manual pool selection and pool-level usage ledger.
-- Manual selection is transactional; the same approved/class/curriculum
-- guard runs for every inserted item, so an invalid selection cannot
-- partially replace a valid draft.

create or replace function public.set_question_pool_items(p_pool_id uuid, p_question_ids uuid[])
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
  v_status text;
  v_id uuid;
  v_pos int := 0;
  v_seen uuid[] := '{}'::uuid[];
begin
  select status into v_status from public.question_pools where id = p_pool_id;
  if v_status is null then raise exception 'Question pool not found.'; end if;
  if v_status <> 'draft' then raise exception 'Reopen the pool as a draft before selecting questions.'; end if;

  delete from public.question_pool_items where pool_id = p_pool_id;
  foreach v_id in array coalesce(p_question_ids, '{}'::uuid[]) loop
    if v_id = any(v_seen) then continue; end if;
    v_seen := array_append(v_seen, v_id);
    insert into public.question_pool_items(pool_id, question_id, position, added_by, source)
    values (p_pool_id, v_id, v_pos, auth.uid(), 'manual');
    v_pos := v_pos + 1;
  end loop;
  return public.question_pool_validate(p_pool_id);
end $$;

-- Publishing records pool-level usage so later phases can avoid reusing a
-- question a candidate may already have encountered. This does NOT change
-- any examination, quiz, competition or result.
create or replace function public.track_question_pool_usage(p_pool_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_count int := 0;
begin
  insert into public.question_usage(organization_id, event_id, phase_id, class_id, question_id, source)
  select p.organization_id, p.event_id, p.phase_id, p.class_id, i.question_id, 'pool'
  from public.question_pools p join public.question_pool_items i on i.pool_id = p.id
  where p.id = p_pool_id and p.event_id is not null
  on conflict do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('pool_id', p_pool_id, 'usage_rows', v_count);
end $$;
