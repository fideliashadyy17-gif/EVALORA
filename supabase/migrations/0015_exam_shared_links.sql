-- 0015 — Shareable examination links + server-verified access codes.
-- Guest candidates are distinct from authenticated EVALORA user accounts;
-- first/last name are mandatory and travel with the candidate and attempt.

alter table public.exams add column if not exists invite_token uuid not null default gen_random_uuid();
alter table public.exams add column if not exists invite_expires_at timestamptz;
alter table public.exams add column if not exists shared_link_enabled boolean not null default true;
alter table public.exams add column if not exists access_code_hash text;
create unique index if not exists uq_exams_invite_token on public.exams(invite_token);

create or replace function public.exam_access_code_hash_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.access_code_hash := public.evalora_hash_secret(public.evalora_normalize_code(new.access_code));
  return new;
end $$;
drop trigger if exists trg_exam_code_hash on public.exams;
create trigger trg_exam_code_hash before insert or update of access_code on public.exams
for each row execute function public.exam_access_code_hash_guard();

update public.exams
set access_code_hash = public.evalora_hash_secret(public.evalora_normalize_code(access_code))
where access_code_hash is null;
alter table public.exams alter column access_code_hash set not null;

alter table public.exam_candidates add column if not exists first_name text;
alter table public.exam_candidates add column if not exists last_name text;
alter table public.exam_candidates add column if not exists guest_key_hash text;
alter table public.exam_candidates add column if not exists invite_token uuid;
alter table public.exam_candidates add column if not exists source text not null default 'admin';
alter table public.exam_candidates drop constraint if exists exam_candidates_source_check;
alter table public.exam_candidates add constraint exam_candidates_source_check
  check (source in ('admin','import','shared_link'));
create unique index if not exists uq_exam_candidate_guest
  on public.exam_candidates(exam_id, guest_key_hash) where guest_key_hash is not null;

alter table public.exam_attempts add column if not exists first_name text;
alter table public.exam_attempts add column if not exists last_name text;
alter table public.exam_attempts add column if not exists class_id uuid references public.classes(id) on delete set null;
alter table public.exam_attempts add column if not exists student_id uuid references public.students(id) on delete set null;
alter table public.exam_attempts add column if not exists guest_key_hash text;
alter table public.exam_attempts add column if not exists invite_token uuid;

-- Backfill legacy candidate names into the existing attempt snapshot; this
-- is additive and does not change scores, answers or result publication.
update public.exam_attempts a
set first_name = split_part(c.full_name, ' ', 1),
    last_name = nullif(btrim(substr(c.full_name, length(split_part(c.full_name, ' ', 1)) + 1)), ''),
    class_id = c.class_id,
    student_id = c.student_id
from public.exam_candidates c
where c.id = a.candidate_id and a.first_name is null;

-- Candidate/attempt/answer data is organizer-only. Guest candidates continue
-- exclusively through token-scoped server routes; anonymous RLS stays closed.
drop policy if exists ec_all on public.exam_candidates;
drop policy if exists ec_select on public.exam_candidates;
drop policy if exists ec_write on public.exam_candidates;
create policy ec_select on public.exam_candidates for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
    and (public.is_super_admin() or coalesce(public.org_role(e.organization_id) in
      ('owner','admin','teacher','organizer','corrector','supervisor'), false))));
create policy ec_write on public.exam_candidates for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
    and (public.is_super_admin() or public.can_create_content(e.organization_id))))
  with check (exists (select 1 from public.exams e where e.id = exam_id
    and (public.is_super_admin() or public.can_create_content(e.organization_id))));

drop policy if exists ea_select on public.exam_attempts;
create policy ea_select on public.exam_attempts for select to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id
    and (public.is_super_admin() or coalesce(public.org_role(e.organization_id) in
      ('owner','admin','teacher','organizer','corrector','supervisor'), false))));

drop policy if exists eans_select on public.exam_answers;
create policy eans_select on public.exam_answers for select to authenticated
  using (exists (select 1 from public.exam_attempts a join public.exams e on e.id = a.exam_id
    where a.id = attempt_id and (public.is_super_admin() or coalesce(public.org_role(e.organization_id) in
      ('owner','admin','teacher','organizer','corrector','supervisor'), false))));
