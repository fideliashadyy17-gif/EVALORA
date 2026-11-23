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
