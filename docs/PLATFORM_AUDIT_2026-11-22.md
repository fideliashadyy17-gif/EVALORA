# Platform audit — data integrity and tenant isolation

Read-only audit performed against the production Supabase project
`nqxqisjtbfsratgztmch`. **No production data, schema, policy or record was
modified.** Every query below was a `SELECT` against the system catalogues or
aggregate counts.

Companion documents: `docs/LANDING_PAGE.md` (public surface),
`docs/evalora-redesign-audit.md` (route inventory).

## 1. Production data baseline (captured before any change)

| Entity | Count |
| --- | --- |
| Organisations | 3 |
| Students | 18 |
| Examinations | 51 |
| Examination attempts | 176 |
| Exam answers | 3,157 |
| Attempt score sum | 1,974 |
| Questions | 2,492 |
| Quizzes | 80 |

This fingerprint is the regression guard: after any deployment, re-run the same
query and the numbers must match unless the change was documented and intended.

## 2. Protected live assessments

Two examinations are declared protected assets: their content, linked
questions, ordering, answer keys, marks, access and attempts must not be
modified by a redesign, migration or test run.

| Examination | Status | Attempts |
| --- | --- | --- |
| MYP 4 (Grade 9) Mathematics — End of First Term Summative Assessment (Version C) | open | 4 |
| MYP 5 (Grade 10) Mathematics — End of First Term E-assessment (Version C) | open | 5 |

The next most active live papers, also treated as untouchable throughout this
work:

| Examination | Attempts |
| --- | --- |
| MYP4 (Grade 9) Formative Assessment 2 — Criteria A–D | 49 |
| MYP5 (Grade 10) Formative Assessment 2 — Criteria A–D | 18 |
| Summative Assessment — Grade 9 | 18 |
| Summative Assessment — Grade 10 | 16 |

No test in this repository creates attempts against these examinations. Any
future automated test must use synthetic examinations in an isolated
organisation.

## 3. Row-level security

Verified from `pg_tables`, `pg_policy` and `pg_class` in the production
catalogue:

| Check | Result |
| --- | --- |
| Public tables | 79 |
| Tables with RLS **disabled** | **0** |
| Policies in force | 156 |
| Policies with an unconditional `USING (true)` or `WITH CHECK (true)` | **0** |
| `UPDATE` policies missing a `WITH CHECK` clause | **0** |
| `INSERT` policies missing a `WITH CHECK` clause | **0** |
| `ALL` policies missing a `WITH CHECK` clause | **0** |
| Tables with RLS enabled and **no** policy | 2 |

The two policy-free tables are `exam_lockdown_challenges` and
`organization_admin_setup`. With RLS enabled and no policy, no
`anon`/`authenticated` role can read or write them; only the service role can.
That is the intended shape for lockdown challenge state and one-time
administrator setup, and is not an exposure.

The absence of `UPDATE`/`INSERT` policies without a `WITH CHECK` clause matters
because a row-level `USING` clause alone governs which rows you may *read or
target*, not what a written row may *contain*. Without the check, an authorised
user could reassign a row's `organization_id` and move it between tenants. That
path does not exist in this schema.

The ten `DELETE`-only policies that have no `WITH CHECK` (`ec_delete`,
`exam_delete`, `mem_delete`, `org_delete`, `qh_delete`, `qopt_delete`,
`q_delete`, `qq_delete`, `ses_delete`, `quiz_delete`) are correct as written:
PostgreSQL does not evaluate `WITH CHECK` on a `DELETE`.

## 4. Application-level tenant binding

Server components resolve tenancy through `src/lib/auth.ts`, not through
client-supplied identifiers:

- `activeOrg()` returns the caller's verified membership, or `null`.
- A tenant hostname only *selects among* the caller's memberships; if the caller
  is not a member, `tenantDenied` is set and `activeOrg()` returns `null`.
- Super Admin workspace access is an explicit, audited `adminOrgContext`, not a
  silent bypass.

A page that cannot resolve an active organisation cannot load another
organisation's rows, because every query is additionally scoped with
`.eq("organization_id", org.id)`.

## 5. What this audit did not do

- No penetration test was executed against a live authenticated session; the
  RLS review is a static catalogue review plus source inspection.
- No load test was run. No concurrency or throughput claim is made.
- Migration history was not reconciled. Two local migrations are reported to
  share a version prefix; reconciling that requires a decision about which body
  reflects production, and no migration body may be replayed blindly against a
  database holding 176 live attempts.

## 6. Function privileges (`SECURITY DEFINER` review)

Executable privileges were reviewed from `pg_proc.proacl` rather than assumed
from the source migrations.

**Result: no `anon`-executable function can read or write data.**

39 `SECURITY DEFINER` functions in `public` carry an `anon=X` grant. Every one
returns `SECURITY DEFINER` + `RETURNS trigger`, and PostgreSQL refuses to invoke
a trigger function directly ("trigger functions can only be called as
triggers"). Verified explicitly:

```sql
-- returns 0 rows
select proname from pg_proc ...
 where prosecdef and prorettype <> 'trigger'::regtype
   and (proacl is null or has anon/ PUBLIC grant);
```

The only non-trigger, non-privileged function reachable by `anon` is
`exam_attempt_deadline_at(...)`, an `IMMUTABLE` SQL function that performs pure
arithmetic on its arguments and touches no table. It must remain callable
because generated columns use it.

Genuinely sensitive helpers are correctly restricted:

| Function | Execute granted to |
| --- | --- |
| `evalora_can_manage` | `postgres`, `service_role` |
| `org_limit` | `postgres`, `service_role` |
| `evalora_hash_secret` | `postgres`, `service_role` |
| `exam_attempt_add_extension_minutes` | `postgres`, `service_role` |
| `exam_attempt_set_pause` | `postgres`, `service_role` |

`is_super_admin`, `class_org` and `event_org` are executable by `authenticated`
only — correct, because they are used inside RLS policy expressions.

## 7. Storage buckets

| Bucket | Public | Size cap | MIME restricted |
| --- | --- | --- | --- |
| `org-logos` | **yes** | none | no |
| `payment-proofs` | no | 10 MB | no |
| `question-media` | **yes** | 5 MB | yes |
| `student-imports` | no | 10 MB | no |

`payment-proofs` and `student-imports` are private, which is correct — both
carry personal or financial material. `question-media` is public with a MIME
allow-list and a size cap.

`org-logos` is public with **no size limit and no MIME restriction**. That is
the weakest bucket in the deployment: anyone who can write to it can publish an
arbitrarily large file of any content type at a durable public URL. Writing is
still gated by `storage.objects` RLS, so this is not an open upload endpoint,
but the bucket policy should be tightened to an image allow-list plus a size cap.

## 8. Migration ledger reconciliation

The production ledger holds 130 recorded migrations. The repository holds 152
migration files. Comparing by **name** (the version number is not comparable
across the two naming schemes — local files use `0001_`…`0121_`, production uses
timestamps):

### Applied in production, no local file (28)

Including a complete security-hardening set that exists nowhere in the repo:

- `harden_public_storage_and_test_helpers`, `tenant_scope_question_media_uploads`,
  `cap_private_upload_buckets`, `restrict_privileged_rpc_execution`,
  `restrict_org_admin_setup_table_acl`, `tighten_public_security_definer_helpers`,
  `restrict_public_exam_code_generator`, `restrict_legacy_public_code_generators`
- `protect_owner_membership`, `restrict_platform_settings_reads`,
  `restrict_support_ticket_insert`, `workspace_query_indexes`
- `shared_live_quiz_integrity`, `shared_assessment_integrity_and_submission_provenance`,
  `result_publication_modes_and_grading_state`, `sommetisation_assessment_grade10`,
  `summative_grade9_and_grade10_repairs`, `grade10_myp5_summative_assessment_recreation`
- `qualification_schema_part_a`, `compute_phase_qualification_function`,
  `qualification_admission_functions_policies`,
  `question_pool_validate_curriculum_counts_fix`, `ap_limits_exam_0058`,
  `ap_exam_track_and_classes_0059`, `myp2_q36_two_sports_prompt_fix`,
  `myp_mock_workspace_activation`, `0006_tenants_classes_imports`,
  `0007_academic_structure_fields`

The production state is **ahead of the repository**. The live database has been
hardened more than the code suggests, which is the safe direction, but it means
a database rebuild from these files would not reproduce production.

### Local file never recorded in production (56)

Mostly assessment content (`summative_grade*_questions_*`, `myp*_mock_*`,
`grade4_*`, `g10_examination`) and `safe_exam_lifecycle_and_lockdown`. These
appear to be content or draft migrations that were applied by another route or
superseded by the tournament-style recreation migrations.

### Duplicate version prefix

Two files share `20261119100000`:
`myp4_grade9_first_term_summative_version_d.sql` and
`version_c_audit_corrections_and_randomization.sql`. A `supabase db push` would
not be able to order these deterministically.

### Decision

**No migration was run and no migration file was deleted or renamed.** Writing
"missing" files from memory would fabricate history; replaying any of these
bodies against a database holding 176 live attempts risks overwriting
assessment content. The discrepancy is documented here and blocks nothing else.
