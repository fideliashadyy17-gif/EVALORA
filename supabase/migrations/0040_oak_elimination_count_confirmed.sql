-- Oak Mental Math Competition: confirm the Elimination question count.
--
-- History: the master specification carried three conflicting Elimination
-- values — exactly 20 per class, exactly 25, and an earlier five-per-class
-- requirement. 0012 recorded the conflict instead of choosing, leaving
-- `elimination_question_count_status = pending_owner_confirmation`, and 0013's
-- `question_pool_publish_guard` refused to publish any Elimination pool while
-- that flag was unresolved.
--
-- Owner decision (2026-11-06): the existing 20 questions per class is the
-- authoritative count. 25 and 5 per class are rejected. This migration records
-- that decision and nothing else:
--
--   * no examination is created, renamed or re-counted;
--   * no pool is created, edited or published;
--   * the semi-final (24 configured / 25 phase maximum) and grand-final (30)
--     configurations are untouched.
--
-- The only effect is that `question_pool_publish_guard` no longer blocks an
-- Elimination pool for this event. Publication still has to pass
-- `question_pool_validate()` — complete, valid, single-class, curriculum-valid
-- and approved-only.
--
-- Idempotent: re-running on an already confirmed event only refreshes the
-- recorded metadata.

do $$
declare
  v_id uuid;
  v_status text;
begin
  select id, settings->>'elimination_question_count_status'
    into v_id, v_status
  from public.competition_events
  where name = 'Oak International School Mental Math Competition';

  if v_id is null then
    raise exception 'Oak competition event not found; the Elimination question count cannot be confirmed.';
  end if;

  if v_status = 'confirmed' then
    raise notice 'Elimination question count already confirmed; no change applied.';
    return;
  end if;

  update public.competition_events
  set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
        'elimination_question_count_status', 'confirmed',
        'elimination_question_count_confirmed', 20,
        'elimination_question_count_confirmed_on', '2026-11-06',
        'elimination_question_count_resolution',
        'Owner confirmed the existing 20 questions per class on 2026-11-06. The 25 and the earlier 5-per-class candidates are rejected. No new examination configuration is created and no question count changes; this decision only permits Elimination question pools to be published once they pass validation.'
      )
  where id = v_id;

  insert into public.audit_logs (actor_id, organization_id, action, entity, entity_id, metadata)
  select
    null,
    null,
    'competition.elimination_count_confirmed',
    'competition_event',
    v_id::text,
    jsonb_build_object(
      'confirmed_count', 20,
      'rejected_candidates', jsonb_build_array(25, 5),
      'decided_on', '2026-11-06',
      'previous_status', coalesce(v_status, 'unset'),
      'source', 'migration 0040'
    );
end $$;
