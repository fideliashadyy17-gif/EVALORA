-- 0012 — Official event identity: Oak International School Mental Math Competition
-- Additive and idempotent. Updates the existing parent event in place; it never
-- creates a duplicate event and never changes relationships or published exams.

create extension if not exists pgcrypto;

create or replace function public.evalora_normalize_event_identity(v text)
returns text language sql immutable set search_path = public as $$
  select replace(
    replace(
      replace(
        replace(coalesce(v, ''),
          'Oak International School Matamat Competition',
          'Oak International School Mental Math Competition'),
        'oak-matamat-2026', 'oak-mental-math-2026'),
      'Matamat', 'Mental Math'),
    'matamat', 'mental-math');
$$;

-- Correct all human-readable / JSON / tag occurrences of the misspelling in
-- existing records. The helper only changes the exact old identity, so this is
-- safe to run again and does not rewrite unrelated text.
do $$
declare r record;
begin
  for r in
    select c.table_name, c.column_name, c.data_type
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and t.table_type = 'BASE TABLE'
      and (c.data_type in ('text', 'character varying', 'jsonb') or c.data_type = 'ARRAY')
  loop
    if r.data_type = 'ARRAY' then
      execute format(
        'update public.%I set %I = array_replace(%I, %L, %L) where %I::text ilike %L',
        r.table_name, r.column_name, r.column_name,
        'oak-matamat-2026', 'oak-mental-math-2026',
        r.column_name, '%matamat%');
    elsif r.data_type = 'jsonb' then
      execute format(
        'update public.%I set %I = public.evalora_normalize_event_identity(%I::text)::jsonb where %I::text ilike %L',
        r.table_name, r.column_name, r.column_name, r.column_name, '%matamat%');
    else
      execute format(
        'update public.%I set %I = public.evalora_normalize_event_identity(%I::text) where %I::text ilike %L',
        r.table_name, r.column_name, r.column_name, r.column_name, '%matamat%');
    end if;
  end loop;
end $$;

-- Canonical parent-event name and the three exact phase names.
update public.competition_events
set name = 'Oak International School Mental Math Competition',
    updated_at = now()
where name <> 'Oak International School Mental Math Competition'
  and (name ilike '%Oak International School%Matamat%Competition%'
       or name ilike '%Oak International School%Mental%Competition%');

update public.competition_event_phases p
set title = 'Oak International School Mental Math Competition — ' ||
  case p.phase_key
    when 'elimination' then 'Elimination Round'
    when 'semi_final' then 'Semi-Final'
    when 'grand_final' then 'Grand Final'
    else p.title
  end
where p.event_id in (
  select id from public.competition_events
  where name = 'Oak International School Mental Math Competition'
)
and p.phase_key in ('elimination', 'semi_final', 'grand_final');

-- Record the unresolved master-spec conflict without choosing a value.
-- The existing Elimination max_questions / question_count remains unchanged.
update public.competition_events
set settings = coalesce(settings, '{}'::jsonb) || jsonb_build_object(
      'question_pool_tag', 'oak-mental-math-2026',
      'seed', 'oak-mental-math-2026',
      'official_name', 'Oak International School Mental Math Competition',
      'elimination_question_count_status', 'pending_owner_confirmation',
      'elimination_question_count_candidates', jsonb_build_array(20, 25, 5),
      'elimination_question_count_note',
      'Master specification conflicts: exactly 20, exactly 25, and an earlier five-per-class requirement. Existing draft configuration remains 20; owner confirmation is required before any new examination configuration is created or published.'
    )
where name = 'Oak International School Mental Math Competition';
