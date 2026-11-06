-- 0019 — Database-level integrity for shared-link candidates. The API
-- validates names and class, and these constraints also reject a malformed
-- candidate written directly through any other privileged path.

alter table public.exam_candidates drop constraint if exists exam_candidates_shared_link_identity_check;
alter table public.exam_candidates add constraint exam_candidates_shared_link_identity_check
  check (
    source <> 'shared_link' or (
      first_name is not null and length(btrim(first_name)) > 0 and
      last_name is not null and length(btrim(last_name)) > 0 and
      class_id is not null and
      guest_key_hash is not null
    )
  );

alter table public.exam_attempts drop constraint if exists exam_attempts_shared_link_identity_check;
alter table public.exam_attempts add constraint exam_attempts_shared_link_identity_check
  check (
    guest_key_hash is null or (
      first_name is not null and length(btrim(first_name)) > 0 and
      last_name is not null and length(btrim(last_name)) > 0 and
      class_id is not null
    )
  );
