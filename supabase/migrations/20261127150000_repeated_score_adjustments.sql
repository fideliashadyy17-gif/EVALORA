-- ═══════════════════════════════════════════════════════════════════════════
-- Repeated Score Adjustments — remove the "one adjustment per student per
-- criterion, ever" restriction from the examination score-adjustment ledger.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- DEFECT
--   `exam_score_adjustment_items` carried
--       unique (attempt_id, category_type, category_key)
--   and `apply_exam_score_adjustment()` raised `duplicate_adjustment` whenever
--   a row already existed for that attempt + category. Together these made a
--   second legitimate adjustment on the same student and the same criterion
--   impossible to persist, and the API surfaced it to staff as a dead end.
--
-- FIX
--   The ledger becomes an ordered, append-only history:
--     * a `sequence_no` numbers each adjustment on an (attempt, category) pair,
--     * uniqueness moves to (attempt, category, sequence_no) — history can never
--       be overwritten — plus (adjustment_id, attempt, category), which still
--       makes a single batch idempotent for one student,
--     * the RPC derives the next sequence number instead of refusing.
--
-- SAFETY / SCOPE
--   Additive and corrective only. No table is dropped, no row is deleted, no
--   exam paper, question, candidate, answer, attempt, original score, mark,
--   result or publication flag is modified. Existing rows are backfilled to
--   sequence_no 1, which is the only value the old constraint permitted, so
--   historical data is bit-for-bit preserved. Plan eligibility, RBAC,
--   pre-validation / publication lifecycle locks, idempotency keys, score
--   capping, optimistic concurrency, append-only immutability and staff-only
--   RLS are all unchanged.
--
-- IDEMPOTENT: safe to re-run.

-- ─── 1. Ordered ledger sequence ──────────────────────────────────────────────
-- The append-only trigger must be lifted while existing rows are numbered; it
-- is recreated identically at the end of this migration.
drop trigger if exists trg_exam_score_adjustment_items_immutable
  on public.exam_score_adjustment_items;

alter table public.exam_score_adjustment_items
  add column if not exists sequence_no integer;

-- Backfill: under the old unique constraint at most one row could exist per
-- (attempt, category), so every existing row becomes sequence 1. The window is
-- written generally so re-running after repeated adjustments stay correct.
with numbered as (
  select i.id,
         row_number() over (
           partition by i.attempt_id, i.category_type, i.category_key
           order by i.created_at, i.id
         )::integer as rn
  from public.exam_score_adjustment_items i
)
update public.exam_score_adjustment_items i
   set sequence_no = n.rn
  from numbered n
 where i.id = n.id
   and i.sequence_no is null;

alter table public.exam_score_adjustment_items
  alter column sequence_no set default 1,
  alter column sequence_no set not null;

comment on column public.exam_score_adjustment_items.sequence_no is
  'Ordinal of this adjustment within the (attempt, category) history. 1 = first adjustment; every later adjustment appends the next number rather than overwriting.';

-- ─── 2. Uniqueness now protects history, not the ability to adjust ───────────
alter table public.exam_score_adjustment_items
  drop constraint if exists uq_exam_score_adj_items_attempt_category;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_exam_score_adj_items_attempt_category_seq'
  ) then
    alter table public.exam_score_adjustment_items
      add constraint uq_exam_score_adj_items_attempt_category_seq
      unique (attempt_id, category_type, category_key, sequence_no);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_exam_score_adj_items_batch_attempt'
  ) then
    alter table public.exam_score_adjustment_items
      add constraint uq_exam_score_adj_items_batch_attempt
      unique (adjustment_id, attempt_id, category_type, category_key);
  end if;
end $$;

comment on constraint uq_exam_score_adj_items_attempt_category_seq
  on public.exam_score_adjustment_items is
  'One ledger entry per adjustment number. A repeated adjustment takes the next number; history is never overwritten.';

comment on constraint uq_exam_score_adj_items_batch_attempt
  on public.exam_score_adjustment_items is
  'A single batch cannot touch the same student and category twice.';

create index if not exists idx_exam_score_adj_items_attempt_category_seq
  on public.exam_score_adjustment_items (attempt_id, category_type, category_key, sequence_no);

-- ─── 3. RPC: derive the next sequence instead of refusing ────────────────────
create or replace function public.apply_exam_score_adjustment(
  p_exam_id          uuid,
  p_category_type    text,
  p_category_key     text,
  p_category_label   text,
  p_points_requested numeric,
  p_scope            text,
  p_reason           text,
  p_idempotency_key  text,
  p_actor_id         uuid,
  p_actor_email      text,
  p_actor_role       text,
  p_actor_console    text,
  p_items            jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exam                record;
  v_sub                 record;
  v_is_institution      boolean := false;
  v_actor_is_super      boolean := false;
  v_actor_can_grade     boolean := false;
  v_settings            jsonb;
  v_validated           boolean := false;
  v_published           boolean := false;
  v_archived            boolean := false;
  v_adjustment_id       uuid;
  v_item                jsonb;
  v_attempt             record;
  v_attempt_id          uuid;
  v_candidate_id        uuid;
  v_student_id          uuid;
  v_candidate_name      text;
  v_cat_max             numeric(8,2);
  v_orig_cat            numeric(8,2);
  v_adj_cat             numeric(8,2);
  v_exam_max            numeric(8,2);
  v_orig_exam           numeric(8,2);
  v_adj_exam            numeric(8,2);
  v_pts_applied         numeric(8,2);
  v_capped              boolean;
  v_cap_reason          text;
  v_students_affected   integer := 0;
  v_capped_count        integer := 0;
  v_total_added         numeric(10,2) := 0;
  v_seen_attempts       uuid[] := array[]::uuid[];
  v_seq                 integer;
  v_expected_adj_exam   numeric(8,2);
  v_points_req          numeric(8,2);
begin
  -- 1. Validate core scalar inputs
  if p_exam_id is null then
    raise exception 'invalid_input: exam_id is required' using errcode = '22023';
  end if;
  if p_category_type not in ('myp_criterion', 'paper_section', 'overall') then
    raise exception 'invalid_input: unsupported category_type' using errcode = '22023';
  end if;
  if p_category_key is null or char_length(trim(p_category_key)) = 0 then
    raise exception 'invalid_input: category_key is required' using errcode = '22023';
  end if;
  if p_category_label is null or char_length(trim(p_category_label)) = 0 then
    raise exception 'invalid_input: category_label is required' using errcode = '22023';
  end if;
  v_points_req := round(coalesce(p_points_requested, 0)::numeric, 2);
  if v_points_req <= 0 or v_points_req > 1000 then
    raise exception 'invalid_input: points_requested must be between 0.01 and 1000' using errcode = '22023';
  end if;
  if p_scope not in ('all_eligible', 'selected') then
    raise exception 'invalid_input: scope must be all_eligible or selected' using errcode = '22023';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 or char_length(p_reason) > 1000 then
    raise exception 'invalid_input: reason must be between 3 and 1000 characters' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(trim(p_idempotency_key)) < 8 then
    raise exception 'invalid_input: idempotency_key is required' using errcode = '22023';
  end if;
  if p_actor_id is null then
    raise exception 'unauthorized: actor_id is required' using errcode = '42501';
  end if;
  if p_actor_console not in ('workspace', 'super_admin') then
    raise exception 'invalid_input: invalid actor_console' using errcode = '22023';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no_applicable_students: at least one eligible student adjustment item is required' using errcode = '22023';
  end if;

  -- 2. Lock the target examination row (prevents concurrent validation/publication race)
  select e.id, e.organization_id, e.title, e.status, e.settings, e.grades_published_at, e.deleted_at
    into v_exam
  from public.exams e
  where e.id = p_exam_id
  for update;

  if not found then
    raise exception 'exam_not_found: examination does not exist' using errcode = 'P0002';
  end if;

  if v_exam.deleted_at is not null then
    raise exception 'exam_deleted: examination is deleted' using errcode = '42501';
  end if;

  v_settings  := coalesce(v_exam.settings, '{}'::jsonb);
  v_archived  := coalesce((v_settings->>'archived')::boolean, false);
  v_validated := coalesce((v_settings->>'results_validated')::boolean, false);
  v_published := coalesce((v_settings->>'results_published')::boolean, false) or (v_exam.grades_published_at is not null);

  if v_archived then
    raise exception 'exam_archived: score adjustments cannot be applied to archived examinations' using errcode = '42501';
  end if;
  if v_published then
    raise exception 'exam_already_published: score adjustments cannot be applied after results are published' using errcode = '42501';
  end if;
  if v_validated then
    raise exception 'exam_already_validated: score adjustments are only permitted before final result validation' using errcode = '42501';
  end if;

  -- 3. Enforce Institution Plan Exclusivity on the target organization
  -- Matches `getEntitlement()` in src/lib/entitlements.ts: active or trialing
  -- subscription whose period/trial has not expired and whose plan is `institution`
  -- (or explicitly carries limits.institutional = true).
  select
    s.status as sub_status,
    s.current_period_end,
    s.trial_ends_at,
    s.limits_override,
    pl.slug as plan_slug,
    pl.limits as plan_limits
    into v_sub
  from public.subscriptions s
  join public.plans pl on pl.id = s.plan_id
  where s.organization_id = v_exam.organization_id
    and s.status in ('active', 'trialing')
  order by s.created_at desc
  limit 1;

  if found then
    if (
      (v_sub.sub_status = 'active' and (v_sub.current_period_end is null or v_sub.current_period_end >= now()))
      or (v_sub.sub_status = 'trialing' and (v_sub.trial_ends_at is null or v_sub.trial_ends_at >= now()))
    ) then
      v_is_institution := (
        lower(coalesce(v_sub.plan_slug, '')) = 'institution'
        or coalesce((v_sub.limits_override->>'institutional')::boolean, (v_sub.plan_limits->>'institutional')::boolean, false)
      );
    end if;
  end if;

  if not v_is_institution then
    raise exception 'plan_ineligible: score adjustment is exclusively available for organizations on an active Institution plan' using errcode = '42501';
  end if;

  -- 4. Enforce Role / RBAC authorization in PostgreSQL
  select (p.platform_role = 'super_admin' and p.status = 'active')
    into v_actor_is_super
  from public.profiles p
  where p.id = p_actor_id;

  if p_actor_console = 'super_admin' then
    if not coalesce(v_actor_is_super, false) then
      raise exception 'unauthorized: active Super Admin privileges required' using errcode = '42501';
    end if;
  else
    if not coalesce(v_actor_is_super, false) then
      -- Active non-learner member of target org with `grading.edit` RBAC permission
      select (
        exists (
          select 1
          from public.organization_members m
          join public.profiles p on p.id = m.user_id
          where m.user_id = p_actor_id
            and m.organization_id = v_exam.organization_id
            and m.status = 'active'
            and p.status = 'active'
            and lower(coalesce(m.role, '')) not in ('student', 'candidate', 'parent', 'participant', 'school_founder')
        )
        and public.access_actor_has_permission(p_actor_id, v_exam.organization_id, 'grading.edit')
      ) into v_actor_can_grade;

      if not coalesce(v_actor_can_grade, false) then
        raise exception 'unauthorized: grading.edit permission in target organization required' using errcode = '42501';
      end if;
    end if;
  end if;

  -- 5. Idempotency check
  if exists (
    select 1
    from public.exam_score_adjustments
    where exam_id = p_exam_id and idempotency_key = trim(p_idempotency_key)
  ) then
    raise exception 'duplicate_submission: this score adjustment submission was already processed' using errcode = '23505';
  end if;

  -- 6. Pre-validate & lock every target attempt row before inserting header
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_attempt_id := (v_item->>'attempt_id')::uuid;
    if v_attempt_id is null then
      raise exception 'invalid_input: attempt_id is required on every item' using errcode = '22023';
    end if;
    if v_attempt_id = any(v_seen_attempts) then
      raise exception 'duplicate_attempt_in_batch: attempt % appeared more than once', v_attempt_id using errcode = '22023';
    end if;
    v_seen_attempts := array_append(v_seen_attempts, v_attempt_id);

    select a.id, a.exam_id, a.candidate_id, a.student_id, a.status, a.score, a.max_score,
           a.grading_status, a.pending_manual_count
      into v_attempt
    from public.exam_attempts a
    where a.id = v_attempt_id
    for update;

    if not found or v_attempt.exam_id <> p_exam_id then
      raise exception 'attempt_not_in_exam: attempt % does not belong to target examination', v_attempt_id using errcode = '42501';
    end if;

    if v_attempt.status not in ('submitted', 'auto_submitted', 'marked') then
      raise exception 'attempt_not_eligible: attempt % is not submitted/marked (status=%)', v_attempt_id, v_attempt.status using errcode = '22023';
    end if;

    if v_attempt.score is null then
      raise exception 'attempt_not_graded: attempt % has no graded score yet', v_attempt_id using errcode = '22023';
    end if;

    if coalesce(v_attempt.pending_manual_count, 0) > 0
       or coalesce(v_attempt.grading_status, '') in ('awaiting_manual_grading', 'pending_manual', 'grading_failed') then
      raise exception 'attempt_pending_grading: attempt % still has pending manual grading', v_attempt_id using errcode = '22023';
    end if;

    -- Repeated adjustments are a supported, first-class operation. A prior
    -- adjustment on this attempt+category is history, never a lock. The next
    -- ledger sequence number is derived from the existing rows; the exam row
    -- lock taken in step 2 serialises concurrent applications on this exam,
    -- so this read-then-insert cannot race.
    select coalesce(max(i.sequence_no), 0) + 1
      into v_seq
    from public.exam_score_adjustment_items i
    where i.attempt_id = v_attempt_id
      and i.category_type = p_category_type
      and i.category_key = trim(p_category_key);

    v_cat_max     := round((v_item->>'category_max_score')::numeric, 2);
    v_orig_cat    := round((v_item->>'original_category_score')::numeric, 2);
    v_adj_cat     := round((v_item->>'adjusted_category_score')::numeric, 2);
    v_exam_max    := round(coalesce((v_item->>'exam_max_score')::numeric, v_attempt.max_score, 0), 2);
    v_orig_exam   := round((v_item->>'original_exam_score')::numeric, 2);
    v_adj_exam    := round((v_item->>'adjusted_exam_score')::numeric, 2);
    v_pts_applied := round((v_item->>'points_applied')::numeric, 2);
    v_capped      := coalesce((v_item->>'capped')::boolean, false);

    -- Optimistic concurrency check against live attempt score
    if abs(round(coalesce(v_attempt.score, 0)::numeric, 2) - v_orig_exam) > 0.01 then
      raise exception 'score_changed_since_preview: attempt % score changed before confirmation; please re-preview', v_attempt_id using errcode = '40001';
    end if;

    -- Hard mathematical bounds & cap verification
    if v_pts_applied <= 0 or v_pts_applied > v_points_req then
      raise exception 'invalid_points: applied points out of bounds for attempt %', v_attempt_id using errcode = '22023';
    end if;
    if v_adj_cat > v_cat_max or v_adj_cat < v_orig_cat then
      raise exception 'score_cap_violation: adjusted category score exceeds category max for attempt %', v_attempt_id using errcode = '22023';
    end if;
    if v_exam_max > 0 and v_attempt.max_score is not null and v_exam_max > round(v_attempt.max_score::numeric, 2) + 0.01 then
      raise exception 'score_cap_violation: exam_max_score exceeds attempt max_score for attempt %', v_attempt_id using errcode = '22023';
    end if;
    v_expected_adj_exam := least(v_exam_max, round(v_orig_exam + v_pts_applied, 2));
    if v_adj_exam > v_exam_max or abs(v_adj_exam - v_expected_adj_exam) > 0.01 then
      raise exception 'score_cap_violation: adjusted exam score exceeds cap or mismatches delta for attempt %', v_attempt_id using errcode = '22023';
    end if;

    v_students_affected := v_students_affected + 1;
    if v_capped then
      v_capped_count := v_capped_count + 1;
    end if;
    v_total_added := round(v_total_added + v_pts_applied, 2);
  end loop;

  if v_students_affected <= 0 or v_total_added <= 0 then
    raise exception 'no_applicable_students: zero points would be applied' using errcode = '22023';
  end if;

  -- 7. Insert immutable batch header
  insert into public.exam_score_adjustments (
    organization_id, exam_id, category_type, category_key, category_label,
    points_requested, scope, reason, idempotency_key,
    actor_id, actor_email, actor_role, actor_console,
    students_affected_count, capped_students_count, total_points_added, metadata
  ) values (
    v_exam.organization_id, p_exam_id, p_category_type, trim(p_category_key), trim(p_category_label),
    v_points_req, p_scope, trim(p_reason), trim(p_idempotency_key),
    p_actor_id, nullif(trim(coalesce(p_actor_email, '')), ''), trim(coalesce(p_actor_role, 'staff')), p_actor_console,
    v_students_affected, v_capped_count, v_total_added,
    jsonb_build_object(
      'exam_title', v_exam.title,
      'results_validated_before', false,
      'results_published_before', false
    )
  )
  returning id into v_adjustment_id;

  -- 8. Insert immutable per-student items & update exam_attempts.score ONLY
  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_attempt_id     := (v_item->>'attempt_id')::uuid;
    v_candidate_id   := nullif(v_item->>'candidate_id', '')::uuid;
    v_student_id     := nullif(v_item->>'student_id', '')::uuid;
    v_candidate_name := coalesce(nullif(trim(v_item->>'candidate_name'), ''), 'Candidate');
    v_cat_max        := round((v_item->>'category_max_score')::numeric, 2);
    v_orig_cat       := round((v_item->>'original_category_score')::numeric, 2);
    v_adj_cat        := round((v_item->>'adjusted_category_score')::numeric, 2);
    v_exam_max       := round((v_item->>'exam_max_score')::numeric, 2);
    v_orig_exam      := round((v_item->>'original_exam_score')::numeric, 2);
    v_adj_exam       := round((v_item->>'adjusted_exam_score')::numeric, 2);
    v_pts_applied    := round((v_item->>'points_applied')::numeric, 2);
    v_capped         := coalesce((v_item->>'capped')::boolean, false);
    v_cap_reason     := nullif(trim(coalesce(v_item->>'cap_reason', '')), '');

    -- Sequence numbers are assigned at insert time. Attempts are unique
    -- within a batch (enforced by duplicate_attempt_in_batch above), so
    -- recomputing max+1 here yields the same value validated in step 6.
    select coalesce(max(i.sequence_no), 0) + 1
      into v_seq
    from public.exam_score_adjustment_items i
    where i.attempt_id = v_attempt_id
      and i.category_type = p_category_type
      and i.category_key = trim(p_category_key);

    insert into public.exam_score_adjustment_items (
      adjustment_id, organization_id, exam_id, attempt_id, candidate_id, student_id,
      candidate_name, category_type, category_key, sequence_no,
      category_max_score, original_category_score, adjusted_category_score,
      exam_max_score, original_exam_score, adjusted_exam_score,
      points_requested, points_applied, capped, cap_reason
    ) values (
      v_adjustment_id, v_exam.organization_id, p_exam_id, v_attempt_id, v_candidate_id, v_student_id,
      v_candidate_name, p_category_type, trim(p_category_key), v_seq,
      v_cat_max, v_orig_cat, v_adj_cat,
      v_exam_max, v_orig_exam, v_adj_exam,
      v_points_req, v_pts_applied, v_capped, v_cap_reason
    );

    -- Update ONLY exam_attempts.score. Never alter exam_answers, validation, or publication flags.
    update public.exam_attempts
       set score = v_adj_exam
     where id = v_attempt_id
       and exam_id = p_exam_id;
  end loop;

  -- 9. Write platform audit log entry atomically inside the same transaction
  insert into public.audit_logs (
    actor_id, organization_id, action, entity, entity_id, metadata
  ) values (
    p_actor_id,
    v_exam.organization_id,
    'exam.score_adjustment_applied',
    'exams',
    p_exam_id::text,
    jsonb_build_object(
      'adjustment_id', v_adjustment_id,
      'exam_title', v_exam.title,
      'category_type', p_category_type,
      'category_key', trim(p_category_key),
      'category_label', trim(p_category_label),
      'points_requested', v_points_req,
      'scope', p_scope,
      'reason', trim(p_reason),
      'actor_role', trim(coalesce(p_actor_role, 'staff')),
      'actor_console', p_actor_console,
      'students_affected', v_students_affected,
      'capped_students', v_capped_count,
      'total_points_added', v_total_added
    )
  );

  return jsonb_build_object(
    'adjustment_id', v_adjustment_id,
    'exam_id', p_exam_id,
    'organization_id', v_exam.organization_id,
    'students_affected', v_students_affected,
    'capped_students', v_capped_count,
    'total_points_added', v_total_added
  );
end;
$$;

revoke all on function public.apply_exam_score_adjustment(
  uuid, text, text, text, numeric, text, text, text, uuid, text, text, text, jsonb
) from public, anon, authenticated;

grant execute on function public.apply_exam_score_adjustment(
  uuid, text, text, text, numeric, text, text, text, uuid, text, text, text, jsonb
) to service_role;

-- ─── 4. Restore the append-only guard, unchanged ─────────────────────────────
drop trigger if exists trg_exam_score_adjustment_items_immutable
  on public.exam_score_adjustment_items;
create trigger trg_exam_score_adjustment_items_immutable
  before update or delete on public.exam_score_adjustment_items
  for each row execute function public.score_adjustment_item_immutable();
