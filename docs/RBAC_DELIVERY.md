# RBAC / institutional supervision delivery status

Date: 2026-11-25. Branch: `arena/b0b6ec4b-evalora`.

**Status: tested implementation checkpoint, NOT a completed production RBAC takeover. Do not merge/deploy or apply these migrations as a claim that all 13 phases are complete.** The permission center displays the same staged-rollout warning. The unresolved release gates below are substantive, not just missing screenshots.

## 1. Checkpoint and remote state actually verified

- Local HEAD before this work: `741572b90fddbf226b52f4ace41341f5062f0779`. `git ls-remote origin refs/heads/main` returned the same commit. Work remained on the session branch.
- The resumed workspace already contained untracked drafts of the RBAC migration/library/pages; it was not the clean/no-RBAC-files checkpoint described in the request. These drafts were reviewed and substantially repaired rather than treated as completed work.
- No existing PR for this branch was returned by `gh pr list --head arena/b0b6ec4b-evalora --state all` before delivery.
- Supabase project listing identified EVALORA as `nqxqisjtbfsratgztmch`. Read-only schema and migration-history queries were performed through the connected Supabase integration.
- The live database **already has** migration `20261125043239 / rbac_permissions`, legacy `rbac_roles(key,name,type,scope,status,...)`, and `rbac_role_permissions(role_key,permission_key,enabled,...)`. These definitions are incompatible with the original draft's table definitions. Live roles include `director_demo` but not the new Founder role.
- New objects use an isolated `access_*` namespace rather than overwriting those live tables. Consolidation with the pre-existing remote RBAC remains a release gate, not something silently considered solved by using a new prefix.
- Oak was identified by a read-only organization query: `0a400000-0000-4000-8000-000000000001`, slug `ois`, active. It has two active memberships (owner and admin). A name search for Founder/Director found zero matches; that is **not** proof of the Founder's identity. No account was invented, selected or assigned.
- Vercel project metadata reported production deployment `dpl_2NPTrdw2JdaXCt2qeK8LqViJpAV2` as READY/PROMOTED at the base commit. No new deployment was requested.

## 2. Existing architecture retained

Next.js 15 / React 19, Supabase SSR authentication, session-derived profiles, organization memberships, tenant-host selection, `requireSuperAdmin`, synchronous legacy `can` role groups, plan/subscription entitlements, module catalog, capability gates, per-route/action checks and PostgreSQL RLS remain in place. No authentication replacement, user demotion, membership reassignment or platform-administrator mutation was performed.

## 3. Implemented architecture and permission resolution

`src/lib/rbac.ts` is server-only. Privileged helpers derive the actor from `requireSuperAdmin`; browser-supplied actor IDs are not trusted. The effective check delegates to PostgreSQL rather than maintaining a second application-side authorization algorithm.

`access_has_permission` evaluates:

1. Only the authenticated subject or an active platform Super Admin may inspect that subject.
2. Unknown or globally disabled permission -> deny.
3. Active target platform Super Admin -> allow.
4. Otherwise require an active profile, active tenant, active membership and organization-scoped permission.
5. Founder is a read-only/privacy ceiling even with extra roles or allow overrides.
6. Explicit user override DENY -> deny.
7. Explicit DENY in an active, unexpired, in-scope role -> deny (an allow override does not defeat it).
8. Explicit allow override or an active in-scope role grant -> allow; otherwise deny.

**Important:** existing operational modules have not all been migrated to call this resolver. This is not yet the single authorization authority across the entire application.

## 4. Permission catalog and roles

The first unapplied migration seeds 70 stable resource/action permissions across the 18 requested categories. Resource-specific actions include view, create, edit, delete, manage, assign, import, export, publish, validate, grade, monitor and configure where represented by the catalog. The catalog also includes specific actions such as revoke and suspend. Not every theoretical category/action combination is generated.

Eleven role definitions: Super Admin, Organization Owner, Organization Admin, Teacher, Organizer, Supervisor, Corrector, **School Founder / Institutional Supervisor**, Candidate, Student and Parent. Assigning a role definition never promotes `profiles.platform_role`. Generic platform-Super-Admin assignment is rejected. Existing primary/last-administrator protections are retained; full concurrent last-administrator regression testing was not added here.

## 5. Functional administration surfaces

- `/admin/rbac`: role inventory, counts, system/custom distinction, search/type filter and recent transactional change history.
- `/admin/rbac/permissions`: grouped role matrix, stable identifiers, descriptions, scopes and global enabled/disabled control.
- `/admin/rbac/roles`: custom-role creation, editing, permission selection, activation/deactivation, duplication and confirmed custom-role deletion. Protected system identities cannot be deleted/renamed. Founder permissions can be edited only within the read-only/privacy ceiling.
- `/admin/rbac/assignments`: explicitly selected organization, verified membership selection, scoped assignment/revocation and assignment history. Founder provisioning uses an exact existing account email plus explicit confirmation; no auth account is created and no existing membership is overwritten.
- `/admin/rbac/effective`: effective access inspection and per-user/per-organization INHERIT/ALLOW/DENY overrides.
- Existing `/admin/users/roles` links to the new center.

These are implemented database-backed interfaces, but were not browser-tested or exercised against the production database, because the new migrations were not applied. Custom-role grants currently do not replace legacy operational role guards.

## 6. Tenant isolation and Founder workspace

`/supervision` uses the active verified tenant, requires `dashboard.view`, and calls a sanitized security-definer overview RPC. The RPC independently rechecks membership, tenant, role permissions and module entitlements on every request. Supplied organization UUIDs are not trusted as authorization.

The workspace provides permitted institutional summaries: examination titles/status/schedules, question/quiz counts, class names, aggregate student count, paper catalogue metadata, competition-event metadata, aggregate attempt/grading progress, published-examination count, active proctoring-room count and read-only subscription/module availability. It does not return candidate identities, tokens/codes, question content/answer keys, answers, individual marks, recordings, screenshots or mutable exam settings. It is not a complete set of read-only equivalents for all legacy detail pages or a full ranking/reporting suite.

The `school_founder` membership routes login and dashboard visits to `/supervision`. That membership alone grants no overview: an active scoped permission assignment is still required. Revoking or expiring an assignment denies the overview. A retained supervision-only membership continues to block private table reads/writes after revocation/expiry; revocation does not accidentally restore permissive legacy member access.

Founder assignment requires a dedicated supervision-only account/membership, rejects existing operational staff memberships and rejects a platform administrator. Subsequent operational membership escalation is blocked while a Founder assignment remains active. A Founder account cannot be promoted directly to platform administrator. No Founder can enter the Super Admin console through the new role.

## 7. Backend and database enforcement implemented

- Server-session checks on every new privileged action, catalog helper and mutation helper.
- Atomic custom-role metadata/permission updates through a validated SQL RPC.
- Database resolver validates role activity, expiry, scope, membership, global disable and explicit denies.
- Assignment triggers reject inactive/out-of-scope roles and generic platform-administrator assignments.
- Founder-specific assignment/provisioning and read-only ceiling guards.
- Restrictive Founder INSERT/UPDATE/DELETE policies intersect existing policies on **currently RLS-enabled public tables**, leaving ordinary users' existing policies in place.
- Restrictive Founder SELECT policies deny private operational tables; the overview reads only sanitized aggregates/metadata.
- Direct role-permission grants cannot make the Founder operational.

**Not established:** comprehensive coverage of existing service-role APIs, privileged RPCs, storage policies, views or future tables. Service-role operations bypass RLS; existing operation-specific checks have not all been converted to configurable RBAC or tested with Founder sessions. The new policies must be reviewed against the complete live schema before application.

## 8. Audit logging

Database triggers transactionally write actor, operation, entity, organization where available, timestamp, previous state and new state to `access_audit_events` for role, permission, role-permission, assignment and override changes. Authenticated users have no insert/update/delete grant on these events, and only Super Admin can select them. The console displays recent events. New administration actions also use the existing `audit_logs` infrastructure where implemented.

No passwords, tokens or exam data are logged by these triggers. Complete failed-attempt/security-access logging and complete module-change before/after snapshots remain unimplemented release work. Existing plan/module mutation auditing is retained.

## 9. Plan & Module synchronization diagnosis

Read-only live inspection found Oak's active Institution subscription valid until `2031-11-06`. Stored values:

| Module | Plan | Organization override | Effective stored state |
|---|---|---|---|
| Assessment (`competitions`) | true | absent | true, inherited |
| Assessment Code (`competition_code`) | true | true | true |
| Ranking Results (`competition_results`) | true | true | true |

The base commit already contains the canonical catalog/navigation synchronization work. Independent local suites passed **301 module-sync checks** and **202 plan-module checks**. Assessment Code is a feature **inside** the competitions page, not a standalone navigation item; rankings require the parent competitions module. The existing resolver merges boolean plan values before explicit boolean organization overrides; missing overrides inherit the plan.

This branch strengthens save-time cache invalidation for the dashboard layout/descendants and the new supervision page. It does not claim a newly reproduced production rendering failure or authenticated Oak rendering verification. Stored ON values and passing mock/integration tests are not a browser login verification.

## 10. Migrations created, but NOT applied

1. `supabase/migrations/20261125120000_rbac_system.sql`: isolated permission/role/assignment/override/audit tables, indexes, RLS, ACLs, resolver, role management RPCs, seeds and guards.
2. `supabase/migrations/20261125121000_founder_supervision.sql`: Founder privacy policies, sanitized overview, module lookup, explicit Founder provisioning and escalation protections. It conditionally expands an older closed membership-role CHECK while preserving its existing expression. It does not replace an existing permissive role regex.

The original draft filenames were changed to timestamps after the actual remote `20261125043239` migration. Neither migration was applied remotely. Both were executed in isolated PGlite tests. No production reset/drop/truncate or academic-data UPDATE/DELETE/INSERT was issued. The second migration adds restrictive policies to existing tables; it is not merely a new-table change and needs live-policy review.

## 11. Data preservation

Remote operations in this work were SELECT/schema/migration-history/deployment-metadata reads only. No Grade 9/MYP4, Grade 10/MYP5, Version C, papers, candidates, admissions, sessions, attempts, answers, marks, grading records, results or publication states were modified or used as mutable fixtures. New tests use synthetic UUIDs, accounts and exam records in a local PGlite instance. They assert that applying the Founder migration preserves the synthetic examination row exactly and that denied writes leave its title unchanged.

This is a statement about this agent's operations and isolated tests, not a production-wide hash/snapshot comparison or a guarantee that no other actor changed the database.

## 12. Verification actually run

Final combined validation command returned exit code **0** for all four commands:

| Command | Result |
|---|---|
| `npm test` | 172 suites passed, 0 failed, 8 browser suites skipped; runner reported 9,375 checks |
| `npx tsc --noEmit` | Passed |
| `npm run lint` | Passed, 0 errors; 18 existing unused-variable warnings outside the new RBAC files |
| `npm run build` | Passed; optimized production build and route generation completed |

`node scripts/test-rbac.mjs` also independently passed **46 SQL checks**, including tenant manipulation, profile/membership status, global disable, override DENY, role DENY vs override ALLOW, custom-role transactions and unknown IDs, Founder write/private-read rejection, cross-tenant RPC rejection, audit integrity, provisioning, revocation, re-assignment, expiry, retained privacy restrictions and escalation rejection. The runner's check-count regex does not count the `RBAC checks passed` line; do not treat 9,375 as a precise total including these 46 checks.

After the combined run, migration-only edits clarified the Founder description and allowed revocation of an inactive role; the 46-check SQL suite was rerun successfully. Only whitespace cleanup in application code followed the combined run.

Earlier validation failures (JSX/import/type/lint issues, a brittle route-inventory assertion and a missing PageTitle eyebrow) were corrected. The final outputs above supersede those earlier failed runs.

Browser/E2E suites were **not run**. Playwright is not installed as a top-level dependency, no Chromium executable was found, and the required three fixture servers on 3101–3103 were not provisioned. No authenticated Founder or Oak browser session was used. Existing browser CI workflow instructions remain in `scripts/run-tests.mjs` and `.github/workflows/exam-browser.yml`.

## 13. Files changed

- New: `src/lib/rbac.ts`; `src/app/admin/rbac/actions.ts`; permission-center pages (`page`, `roles`, `permissions`, `assignments`, `effective`); `src/app/supervision/page.tsx`; both migrations; `scripts/test-rbac.mjs`; this report.
- Modified: `src/app/admin/users/roles/page.tsx`; `src/app/admin/plans/modules/actions.ts`; `src/app/dashboard/layout.tsx`; `src/lib/brand.ts`; `src/lib/roleRouting.ts`; `src/middleware.ts`; `scripts/test-platform-redesign-audit.mjs` (inventory updated for the actual added routes).

## 14. Release gates and remaining work

1. Reconcile the live legacy RBAC schema/roles with the isolated `access_*` design. Do not silently maintain two production permission authorities.
2. Integrate effective RBAC with every applicable legacy route/action/API/service and resource-specific RLS policy, including custom-role grants/revocations and disabled-permission enforcement. The current centralized resolver is **not yet used throughout the entire application**.
3. Review/test the restrictive policies against the complete real schema, privileged RPCs, storage and all service-role mutation paths. Add explicit Founder direct API/server-action browser tests, not just SQL tests.
4. Complete the requested richer read-only result/ranking/report/detail experience, security-sensitive/failed-access audit events, and concurrent last-Super-Admin tests.
5. Review both migrations and apply them transactionally to a controlled test environment; inspect migration history/schema again immediately before any production application. No production application is authorized by this report alone.
6. Identify the Founder's exact account/email with the institution. Do not choose the existing owner/admin account automatically. Using the reviewed UI after rollout: select Oak -> Founder role -> exact registered account email -> explicit supervision-only-membership confirmation -> assign. Existing operational memberships are deliberately rejected, not demoted.
7. Authenticate the isolated Founder-equivalent test account and verify default login destination, menus, populated overview, read-only examination/results/reporting behavior, direct URLs/APIs/server actions, database/storage access, no Super Admin, and no other tenant.
8. Re-verify Oak's real authenticated dashboard for the three module surfaces, then complete PR review, merge and deployment only when release gates pass.

Git commit/PR identifiers are supplied in the delivery message. Any PR for this checkpoint must stay draft/unmerged. No new migration application, merge, deployment or production functionality verification is claimed.

## Continuation checkpoint — 2026-11-25 (release still blocked)

- Installed isolated Chromium and ran all eight previously skipped browser suites against local mock-origin production servers. All passed; cron tested both configured and missing secrets. Fixed missing English/French/Spanish exam dialog/lockdown keys and stale Next-button selectors. These are synthetic browser fixtures, **not authenticated Oak verification**. Browser build preceded the subsequent endpoint guards; those guards have separate real-route mocked tests and final build validation.
- Added forward reconciliation `20261125122000`: retains original legacy rows plus archived role definitions, maps owner/admin to canonical roles, preserves inactive/custom roles and explicit DENY, rejects unknown permission keys transactionally, freezes legacy RBAC writes. No remote application. Actual live constraints/complete-policy integration still require review.
- Added `20261125123000`: existing active legacy memberships feed the same resolver without mass assignments; global OFF/role DENY/user DENY still win. Founder cannot regain mutating privileges via legacy roles, and revoked Founder assignments are not silently reconstructed from membership. Tested the complete four-migration sequence in isolated PGlite.
- Added `canOperate`: intersects authoritative permission with resolved module entitlement and fails closed on errors. Applied to live control (GET/POST), host state, participant extra-time, and result publish/unpublish. Existing tenant/ownership checks retained as additional ceilings. Host ownership no longer escapes permission OFF. Publication/unpublication have distinct permission keys. **Not platform-wide**: static inventory still has 114 legacy `can` calls; it now lists 313 exported operational entrypoints and 80 tenant/role/ownership condition branches for review. Retaining a guard in this inventory does not certify it.
- Current validations: full default regression 174 suites passed, 0 failed, 8 browser suites separately executed successfully; 9,510 individual default-run checks. Isolated main SQL suite now 51 checks; reconciliation 17; operational helper 6; live control 24; publication action 10. The default runner overlaps these test totals; do not add them together. `tsc --noEmit` passed, final build passed, lint 0 errors/18 warnings, diff whitespace check passed.
- SQL count provenance: historical 42 → 44 added revoked/expired raw-read checks; 44 → 46 added academic-row preservation and Founder profile-promotion rejection; 46 → 51 adds post-reconciliation Founder privacy/revoke/reassignment checks. Reconciliation's 17 are a separate suite.
- No production data, Oak membership/subscription, academic paper/question selections, candidates, attempts, grading, results or publication state modified. All executable mutation tests use synthetic isolated data. No remote migration, Founder assignment, production verification, merge or deployment performed.
- Outstanding release blockers: remaining operational and database enforcement coverage; full live-schema migration safety review; useful Founder detail/report experience; unambiguously identified Founder account; authenticated Oak navigation/API/cache/module and revoke verification. Need the exact Founder email or user UUID and approved authenticated test access; do not guess or reassign an existing owner/admin. Keep PR #95 draft and do not merge/deploy.
