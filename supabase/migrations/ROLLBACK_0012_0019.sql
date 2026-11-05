-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK for additive Oak event schema (0012–0019)
--
-- WARNING: this is a SCHEMA rollback, not a data rollback. It drops new pool,
-- usage, qualification and override rows and removes new identity columns.
-- Run only before go-live, or after a verified backup. Migration 0012 corrected
-- existing event names and text/jsonb/array values in place; those original
-- wrong-name values cannot be reconstructed by this script. Restore them from a
-- backup if a full historical rollback is required.
--
-- The applied DB history used several smaller migrations for the consolidated
-- local file 0014_phase_qualification_admission.sql. This script reverses the
-- resulting schema, not migration-history rows.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

-- 0019: shared-link identity integrity constraints.
alter table public.exam_candidates drop constraint if exists exam_candidates_shared_link_identity_check;
alter table public.exam_attempts drop constraint if exists exam_attempts_shared_link_identity_check;

-- 0015: shared-link trigger, indexes and columns.
drop trigger if exists trg_exam_code_hash on public.exams;
drop index if exists public.uq_exams_invite_token;
drop index if exists public.uq_exam_candidate_guest;
alter table public.exam_attempts
  drop column if exists invite_token,
  drop column if exists guest_key_hash,
  drop column if exists student_id,
  drop column if exists class_id,
  drop column if exists first_name,
  drop column if exists last_name;
alter table public.exam_candidates
  drop column if exists invite_token,
  drop column if exists guest_key_hash,
  drop column if exists source,
  drop column if exists student_id,
  drop column if exists class_id,
  drop column if exists first_name,
  drop column if exists last_name;
alter table public.exams
  drop column if exists invite_expires_at,
  drop column if exists shared_link_enabled,
  drop column if exists access_code_hash,
  drop column if exists invite_token;

-- 0015: restore the pre-migration organizer policies verbatim from 0001.
drop policy if exists ec_all on public.exam_candidates;
create policy ec_all on public.exam_candidates for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_org_member(e.organization_id)))
  with check (exists (select 1 from public.exams e where e.id = exam_id and public.can_create_content(e.organization_id)));
drop policy if exists ea_select on public.exam_attempts;
create policy ea_select on public.exam_attempts for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and public.is_org_member(e.organization_id)));
drop policy if exists eans_select on public.exam_answers;
create policy eans_select on public.exam_answers for select to authenticated
  using (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id where a.id = attempt_id and public.is_org_member(e.organization_id)));

-- 0016/0018: participant admission recheck column and functions.
alter table public.session_participants drop column if exists qualification_token_hash;
drop index if exists public.idx_sp_qualification_hash;
drop function if exists public.verify_participant_phase_admission(uuid);

-- 0014: qualification/admission functions and policies.
drop policy if exists qual_select on public.qualification_records;
drop policy if exists qual_write on public.qualification_records;
drop policy if exists qual_override_select on public.qualification_overrides;
drop policy if exists qual_override_write on public.qualification_overrides;
drop function if exists public.verify_phase_admission(uuid, text, uuid, text, uuid);
drop function if exists public.override_phase_qualification(uuid, text, text, uuid);
drop function if exists public.approve_phase_qualification(uuid, uuid, text);
drop function if exists public.compute_phase_qualification(uuid, uuid, uuid);
drop function if exists public.evalora_normalize_code(text);
drop function if exists public.evalora_hash_secret(text);
drop function if exists public.evalora_can_manage(uuid);

-- 0013/0017: pool usage triggers, guards, functions and policies.
drop trigger if exists trg_exam_code_hash on public.exams;
drop trigger if exists trg_exam_answer_usage on public.exam_answers;
drop trigger if exists trg_live_answer_usage on public.participant_answers;
drop trigger if exists trg_qpool_item_guard on public.question_pool_items;
drop trigger if exists trg_qpool_publish_guard on public.question_pools;
drop function if exists public.exam_access_code_hash_guard();
drop function if exists public.track_exam_question_usage();
drop function if exists public.track_live_question_usage();
drop function if exists public.question_pool_item_guard();
drop function if exists public.question_pool_publish_guard();
drop function if exists public.track_question_pool_usage(uuid);
drop function if exists public.set_question_pool_items(uuid, uuid[]);
drop function if exists public.replace_question_pool_item(uuid, uuid, uuid);
drop function if exists public.shuffle_question_pool_items(uuid);
drop function if exists public.generate_question_pool_items(uuid, boolean);
drop function if exists public.question_pool_validate(uuid);
drop function if exists public.question_pool_eligible(uuid, boolean);
drop policy if exists pool_select on public.question_pools;
drop policy if exists pool_write on public.question_pools;
drop policy if exists pool_item_select on public.question_pool_items;
drop policy if exists pool_item_write on public.question_pool_items;
drop policy if exists pool_usage_select on public.question_usage;
drop policy if exists pool_usage_write on public.question_usage;
alter table public.competition_phase_classes drop column if exists question_pool_id;

drop table if exists public.qualification_overrides;
drop table if exists public.qualification_records;
drop table if exists public.question_usage;
drop table if exists public.question_pool_items;
drop table if exists public.question_pools;

commit;
