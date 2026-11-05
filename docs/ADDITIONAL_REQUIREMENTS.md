# ADDITIONAL MANDATORY REQUIREMENTS — EVALORA

**Branch:** `arena/21f3ffe0-evalora`  
**Date:** 2026-11-05 (Africa/Lagos)  
**Status:** Implemented, statically/transactionally verified, committed as `da0d0794078d8c1fcf3d6854fb10ba2ee89beee4` and pushed to `arena/21f3ffe0-evalora`; **not deployed to production**. Authenticated browser testing, DB-backed live API integration, production-env validation and production deployment remain outstanding.

---

## 1. What the owner reported and the audit conclusion

The owner reported that a Super Admin could not access **Class Management**, and that this was a symptom of a wider platform-authorization problem. The requirement was not to add a one-off UI link: the platform owner must have **full, unrestricted, tenant-safe operational privileges across every current and future module**, while Free, Premium and Institutional customers must retain their plan, subscription and role restrictions.

**Root cause:** the application had two different authorization stories.

- `src/lib/auth.ts` already had `can()` returning `true` for `platform_role === "super_admin"`, and `getSessionContext()` already synthesized an audited owner membership for a chosen organization through the `ADMIN_ORG_COOKIE` / `evalora_admin_org`. That gave the owner a working tenant workspace, but the control center had no obvious operational entry point for it.
- The database RLS policies for `classes`, `exams`, `questions`, `quizzes`, live sessions, attempts, answers, marking and proctoring were written for ordinary organization members. `public.is_super_admin()` existed, and `public.org_role()` already returned `'owner'` for a verified Super Admin, but many operational policies did not include the explicit owner OR-path. A service-role admin client could read/write, but an authenticated JWT through RLS did not uniformly have the same operational access.
- Feature flags and plan entitlements were checked in several places with locally supplied `ownerBypass` values. There was no single server-side capability choke point that derived the bypass from the verified session.

The fix is therefore **centralized and additive**: one entitlement source, one pure capability resolver, one session-aware wrapper, explicit owner OR-paths in RLS, and an audited operational workspace that reuses the existing tenant-safety mechanisms. No second plan system, no client-side privilege, and no bypass of tenant isolation or audit logging were introduced.

---

## 2. Centralized authorization mechanism

### 2.1 Server-side session and tenant safety

`src/lib/auth.ts` remains the source of truth for the session:

- `getSessionContext()` resolves the signed-in user, `profiles`, active `organization_members`, hostname-derived `tenantSlug`, `tenantDenied`, and — for a verified `super_admin` — a synthetic owner membership for `ADMIN_ORG_COOKIE` or a valid tenant hostname.
- `activeOrg(ctx)` returns `null` when `tenantDenied` is true, so a wrong-tenant hostname can never fall back to another school's workspace.
- `can(ctx, orgId, roles)` returns `true` immediately for a verified Super Admin; ordinary users still require a matching active membership role.
- `requireSuperAdmin()` redirects non-owners away from `/admin`.
- `src/middleware.ts` refreshes the Supabase session, guards `/dashboard`, `/admin`, `/onboarding`, and forwards the tenant slug. It does not grant privileges.
- `enterOrgWorkspace()` / `exitOrgWorkspace()` in `src/app/admin/actions/orgs.ts` set/delete an httpOnly, sameSite cookie, restrict `next` to `/dashboard`, and write `organization.admin_access_started` / `organization.admin_access_ended` audit events.

### 2.2 Pure capability rules

`src/lib/capability-rules.ts` defines:

- `CAPABILITY_KEYS`: `class_management`, `student_management`, `question_bank`, `quiz_management`, `examinations`, `live_competitions`, `proctoring`, `reports_analytics`, `imports_exports`, `institutional_administration`, `configurable_limits`, `central_asset_management`, `multi_class_operations`, `future_modules`, `unrestricted_owner_access`.
- `CAPABILITY_LABELS`.
- `resolveCapabilities({ isSuperAdmin, planSlug, limits, featureFlags })`.

Resolution:

- Verified owner: **every** capability is `true`, including `future_modules` and `unrestricted_owner_access`. Commercial metering, quotas and global module toggles do not apply to the platform owner.
- Ordinary customer: `class_management` and `student_management` remain available; live/quiz/question-bank capabilities follow the `live_quizzes` flag; examinations follow `examinations` + `max_exams !== 0`; proctoring follows `proctoring` + plan `limits.proctoring`; reports follow `advanced_reports`; imports/exports follow Institutional or reports; Institutional administration, configurable limits and centralized resources follow the Institution plan / `limits` keys; `multi_class_operations` follows the Institution plan or its explicit plan key. `future_modules` and `unrestricted_owner_access` are always `false` for customers.

### 2.3 Single entitlement source

`src/lib/entitlements.ts` extends `PlanLimits` with `institutional`, `max_classes`, `max_students`, `multi_class_operations`, `central_asset_management`, `configurable_limits`.

- `FREE_LIMITS` keeps Free's commercial limits and sets Institutional-only keys explicitly `false`; `multi_class_operations` is `true` because existing customer class operations are preserved.
- `UNLIMITED_LIMITS` is the owner bypass. The owner identity is `planSlug: "owner"`, **not** the customer Institution plan.
- `getEntitlement(supabase, organizationId, opts?)` still resolves the organization's latest active/trialing `subscriptions → plans` entitlement and merges `limits_override`; it falls back to Free on expiry.
- `getEntitlementFor(supabase, ctx, organizationId)` is the centralized wrapper: it derives `ownerBypass` from `ctx.profile.platform_role === "super_admin"` rather than trusting a caller-supplied flag.
- `withinLimit(limit, current)` is retained for quota checks.

`src/lib/platform.ts` adds `isFeatureEnabledFor(ctx, key)`, which derives the owner bypass from the verified profile. `isFeatureEnabled(key, opts?)` and `getFeatureFlags()` remain available for explicit admin/API use.

`src/lib/capabilities.ts` adds:

- `getCapabilities(supabase, ctx, organizationId)`: resolves `getEntitlementFor`, `getFeatureFlags`, and `resolveCapabilities` in one server-side call.
- `requireCapability(...)`: redirect-based server-action guard returning the resolved result.

The operations page, dashboard exam creation, billing, questions, quizzes, team, subscription tab, LiveKit token route and admin examination actions now use `getEntitlementFor`, `getCapabilities`, `requireCapability` or `isFeatureEnabledFor` rather than ad-hoc owner flags. The customer-side Institutional panel in `src/app/admin/organizations/[id]/tabs/SubscriptionTab.tsx` and the operational workspace in `src/app/admin/operations/page.tsx` explicitly resolve `customerCapabilities` with `isSuperAdmin: false` so owner privileges and customer entitlements are never conflated.

### 2.4 Database RLS owner paths

`supabase/migrations/0021_super_admin_operational_rls.sql` (applied live as `super_admin_operational_rls`) adds `public.is_super_admin()` OR-paths to operational policies while preserving the original membership/role checks for ordinary users.

Affected policies include `org_insert`, `pay_insert`, `exam_select`, `exam_write`, `q_select`, `q_write`, `qc_all`, `qopt_all`, `qq_all`, `quiz_select`, `quiz_write`, `ses_select`, `ses_write`, `sp_select`, `sp_host_update`, `pa_select`, `ea_update`, `eans_update`, `pi_all`, `pr_select`, and a new explicit `pr_super_write` policy on `proctoring_rooms`.

Helper definitions confirmed from `pg_proc`:

- `is_super_admin()`: `exists (select 1 from public.profiles where id = auth.uid() and platform_role = 'super_admin' and status = 'active')`.
- `org_role(p_org)`: returns `'owner'` when `is_super_admin()`, otherwise the caller's active `organization_members.role`.
- `is_org_member(p_org)`: `org_role(p_org) is not null`.
- `can_create_content(p_org)`: `org_role(p_org) in ('owner','admin','teacher','organizer')`.
- `can_host_live_session(p_org)`: delegates to `can_create_content`.
- `can_manage_org(p_org)`: `org_role(p_org) in ('owner','admin')`.
- `is_linked_live_participant(p_session)`: checks `session_participants.user_id = auth.uid()`.

Post-migration policy inventory: **93 public policies**, **90** contain an explicit `is_super_admin()` path. The three without it are intentionally public or unrestricted-by-design and are not owner gaps:

1. `competitions.comp_public_select` — `anon`, published/scheduled/live/ended public visibility.
2. `platform_settings.ps_select` — `authenticated`, `qual = true`.
3. `support_tickets.sup_insert` — `anon, authenticated`, `with_check = true`.

A transactional authenticated-JWT simulation with the active Super Admin `3c3ed712-f409-4aa1-a645-816418e22ec4` / `starboyboy2017@gmail.com` returned `public.is_super_admin() = true` and `exams_visible = 15`.

### 2.5 Operational workspace and Class Management

`src/app/admin/AdminShell.tsx` section **I. Operational Workspace** now links to:

- `/admin/operations` — full customer workspace access and capability comparison.
- `/admin/classes` — direct Super Admin class management.
- `/admin/examinations/invitations` — exam links and codes.

`src/app/admin/operations/page.tsx` lists every organization, resolves owner capabilities and separately resolves the selected customer's plan capabilities, and exposes "Open in workspace" forms that call `enterOrgWorkspace` with a `/dashboard` target. The customer Class Management lifecycle already exists at `/dashboard/academics/classes` with `saveClassInline`, `classLifecycle`, `transferStudent`, `withdrawEnrollment`, audited organization-scoped RLS queries, duplicate checks, archive-instead-of-delete protection and same-school reference validation. The Super Admin direct console at `/admin/classes` uses `saveGlobalClass` with `requireSuperAdmin`, same-school year/level/department validation, duplicate checks and audit logging. This preserves tenant isolation while giving the owner both an audited tenant route and a direct console route.

---

## 3. Institutional / Enterprise plan

`supabase/migrations/0020_institutional_entitlements.sql` (applied live as `institutional_entitlements`) keeps the existing `plans` table as the single source of truth. Existing subscriptions and organizations were not modified.

- **Free** `e99a6fb8-62d2-402d-89bb-a219a2f10ff6`: `institutional=false`, `central_asset_management=false`, `configurable_limits=false`, `multi_class_operations=true`, `max_classes=-1`, `max_students=-1`. Original commercial limits retained.
- **Premium** `fdd39a04-d5b9-41e8-bac9-e9646dd0ce60`: same Institutional keys as Free; original commercial limits retained.
- **Institution** `06ffc960-b0c8-410e-bb26-43f1c7e3db3f`: `institutional=true`, `multi_class_operations=true`, `central_asset_management=true`, `configurable_limits=true`, unlimited exams/quizzes/questions/members/classes/students, `max_participants_per_session=1000`, `proctoring=true`, `advanced_reports=true`, `storage_mb=51200`, and six appended features: institutional class/student management, multi-class/multi-user workflows, centralized resources, configurable quotas, advanced examinations/competitions, video proctoring and advanced reporting/analytics.

The plan is surfaced in `src/app/pricing/page.tsx`, `src/app/admin/plans/page.tsx`, `src/app/dashboard/billing/page.tsx`, and the customer-side capability panel in `src/app/admin/organizations/[id]/tabs/SubscriptionTab.tsx`. The live DB still has one active complimentary Premium subscription `de000000-0000-4000-8000-000000000032` for the demo organization; no subscription was reassigned to Institution during this work.

**Important distinction:** Institution is a paid customer tier with a defined feature set. `planSlug: "owner"` is a separate authorization context for the verified platform owner. An Institutional customer never receives `unrestricted_owner_access`, `future_modules`, or exemption from global module toggles.

---

## 4. General Examination access link + code

### 4.1 Persisted database identity

`supabase/migrations/0022_exam_access_identity.sql` (applied live as `exam_access_identity`) is additive and back-compatible:

- `public.evalora_unique_exam_code()` generates a unique uppercase 10-character code from `gen_random_uuid()`.
- `exams.access_code` now has that function as its default. The existing hash trigger still stores only `sha256(normalize(code))` in `access_code_hash`.
- `exams.access_link` is a stored generated column: `'/exam/join/' || invite_token::text`, with unique index `uq_exams_access_link`. Regenerating `invite_token` transparently regenerates the path.
- `exam_candidates.identity_data` and `exam_attempts.identity_data` are `jsonb not null default '{}'` with object CHECK constraints.
- Existing `candidate_ref` values are preserved as `identity_data.candidate_ref`; no candidate or student record is merged by name.
- Every exam's `settings` is given `access_mode`, `identity_fields`, `eligible_class_ids`, `attempt_policy` defaults without overwriting valid Oak/legacy values.
- Existing tokens, codes, exams, hashes, candidates, attempts, scores and results are preserved.

Verification: `exam_count=15`, `bad_links=0`, `missing_hashes=0`, `all_exams_have_access_settings=true`, `all_exams_have_persisted_links=true`, `no_duplicate_exam_records=true`.

The shareable **full URL** is assembled from the request origin (`x-forwarded-host` / `host`, `x-forwarded-proto`) plus the persisted path in `src/app/admin/examinations/invitations/page.tsx` and `src/app/dashboard/exams/[id]/page.tsx`. The stored value is the canonical exam-scoped path; no absolute URL is stored in the DB. A canonical full-URL persistence/backfill column is therefore **not implemented** (see limitations).

### 4.2 Organizer invitation console

`src/components/ExaminationAccessCard.tsx` shows, organizer-only:

- Unique shareable link, open candidate page button, copy-link button.
- Access code and copy-code button.
- Copy-complete-invitation button using `buildInvitationText()`.
- Availability label/error, status, open/close window, link enabled/disabled, link expiry.
- Restrictions: server-verified code bound to this exam, mandatory first/last name, shared-link or registered-student-only mode, eligible-class allowlist or event/phase links, attempt policy, proctoring, and configured additional identity fields.

`src/app/admin/examinations/invitations/page.tsx` is a Super Admin console over all exams. It supports exam selection, regenerating the access code, regenerating the shareable link, enabling/disabling the link, setting link expiry, choosing `shared_link` / `registered_students_only`, choosing `single_resume` / `read_only_reentry`, configuring additional identity fields as JSON, and selecting an eligible-class allowlist. All mutations call the audited `updateExamInvitation()` in `src/app/admin/actions/event-operations.ts`, which preserves query parameters on redirect and writes `exam.invitation.<action>` audit events. `src/app/admin/examinations/page.tsx` links each exam to this console; the dashboard exam detail page embeds the same access card.

Exam creation in `src/app/admin/examinations/actions.ts` and `src/app/dashboard/exams/actions.ts` no longer inserts a client-generated `access_code`; it selects the DB-generated `access_code`, `invite_token`, `access_link` and writes the shared-link settings defaults.

### 4.3 Shared exam-access rules

`src/lib/exam-access.ts` is a pure shared module used by server pages, API routes and tests:

- `parseExamAccessSettings()` parses `access_mode`, `identity_fields`, `eligible_class_ids`, `attempt_policy`, `proctoring`.
- `normalizeIdentityFields()` whitelists keys, labels, types and required flags, rejecting reserved keys.
- `sanitizeIdentityData()` validates required text/email/number fields and returns a whitelisted object.
- `identityDataEqual()` compares normalized identity objects independent of JSONB key order.
- `examAccessAvailability()` is the single availability check for link enabled, expiry, exam status, start window and end window.
- `buildInvitationText()` produces the complete invitation copy.
- `mergeEligibleClassIds(base, configured)` restricts base class options to an explicit allowlist when configured.
- `validUuid()` and `normalizeUuidList()` validate tokens and class IDs.

### 4.4 Candidate join page and admission API

`src/app/exam/join/[token]/page.tsx` is server-rendered and `force-dynamic`. It validates the UUID token, loads only the persisted exam, enforces availability, restricts class options to the exam's own class, direct phase-class links, unassigned links for the same stage, and the configured allowlist, filters classes to the exam's organization, detects a verified student through `students.user_id` and `student_enrollments`, and passes `requiresAccount` for registered-student-only exams. Later-phase links with `exam_id = null` cannot expose another class's exam.

`src/app/exam/join/[token]/JoinClient.tsx` collects first name, last name, access code, class, configured identity fields, explicit consent, and a per-link `guestKey` stored in `localStorage`. It posts `{ invite_token, access_code, first_name, last_name, class_id, guest_key, identity, consent: true }` to `/api/exam/link-access`, stores the returned attempt token in `localStorage`, and routes to `/take-exam/[attemptId]`. It explains that no account is required for shared-link mode, shows a verified-student notice, and blocks submission when an institutional account is required.

`src/app/api/exam/link-access/route.ts`:

- Validates the Zod body including `consent: z.literal(true)`.
- Resolves exactly one exam by `invite_token`.
- Checks `examAccessAvailability`.
- Compares `sha256(normalize(access_code))` against that exam's `access_code_hash` (wrong code and cross-exam credentials are rejected).
- Sanitizes configured identity fields.
- Computes eligible classes from exam class, direct links, same-stage unassigned links and the configured allowlist; rejects a class outside the exam's organization.
- Associates a logged-in student only through `students.user_id` + active `student_enrollments`, never by name.
- Enforces `registered_students_only` with a verified student account and eligible class.
- Uses `sha256(guest_key)` to prevent duplicate/conflicting guest attempts.
- Preserves `identity_data` on candidate and attempt; refuses conflicting details.
- Creates or resumes one attempt, applies `single_resume` / `read_only_reentry`, seeds question order, returns `attempt_id`, `access_token`, candidate/class/status/deadline/proctoring.
- Does not return the stored code hash, private roster or privileged exam data.

`src/app/exam-access/page.tsx` now directs candidates who received a shareable link to that link instead of the legacy two-code page. The legacy `/api/exam/access` path remains available for the existing exam-code + personal-candidate-code workflow and still enforces the configured attempt policy. Existing `/take-exam/[attemptId]` autosave, timing, scoring, results and proctoring flows were not rewritten.

### 4.5 LiveKit proctoring entitlement

`src/app/api/livekit/token/route.ts` now derives the global proctoring feature bypass from the verified session profile. The supervisor path uses `getEntitlementFor(supabase, ctx, exam.organization_id)`. The candidate path uses `getEntitlement(admin, exam.organization_id, { ownerBypass })` where `ownerBypass` is true for a `platform_owned` organization **or** a verified Super Admin session. Ordinary customers still require a plan whose `limits.proctoring` is true. Candidate room access remains scoped to the candidate's own in-progress attempt and exam.

---

## 5. Applied migrations / DB objects

Three migrations were applied live through `supabase__create_migration`; all returned success (`version:null` from the tool is success). Local copies are in `supabase/migrations/`. **Do not reapply.**

| Local file | Applied name | Purpose |
|---|---|---|
| `0020_institutional_entitlements.sql` | `institutional_entitlements` | Institutional plan capability keys/features |
| `0021_super_admin_operational_rls.sql` | `super_admin_operational_rls` | Owner OR-paths in operational RLS |
| `0022_exam_access_identity.sql` | `exam_access_identity` | Generated code, persisted link, identity JSON, access settings |

`supabase/migrations/ROLLBACK_0020_0022.sql` is provided for emergency schema rollback. It is **not** production-data recovery: it drops generated columns and restores pre-migration policies/plan keys, but does not restore per-exam settings edited after 0022. It was not executed.

`supabase__list_migrations` now shows **25 applied migrations**, ending with:

- `20261105093813 institutional_entitlements`
- `20261105093835 super_admin_operational_rls`
- `20261105093845 exam_access_identity`

The earlier 22 migrations, including `official_event_identity` through `shared_link_identity_integrity`, remain applied. `ROLLBACK_0012_0019.sql` still exists for the earlier Oak work and was not executed. The additional-requirements source/docs/tests were committed and pushed as `da0d0794078d8c1fcf3d6854fb10ba2ee89beee4`; the auto-started Vercel preview `dpl_6X67iKBT4vKsWEHWWyMuafnPT4yc` was canceled.

---

## 6. Files changed (current request)

Core authorization/entitlement:

- `src/lib/capability-rules.ts` — new pure capability resolver.
- `src/lib/entitlements.ts` — extended `PlanLimits`, `FREE_LIMITS`, `UNLIMITED_LIMITS`, `getEntitlementFor()`.
- `src/lib/platform.ts` — `isFeatureEnabledFor()`.
- `src/lib/capabilities.ts` — `getCapabilities()`, `requireCapability()`.
- `src/lib/exam-access.ts` — shared exam access/identity helpers.

Admin / dashboard:

- `src/app/admin/operations/page.tsx` — operational workspace with owner/customer capability comparison.
- `src/app/admin/AdminShell.tsx` — section I links.
- `src/app/admin/examinations/invitations/page.tsx` — rewritten invitation console.
- `src/app/admin/examinations/invitations/CopyInvitation.tsx` — clipboard helper.
- `src/app/admin/actions/event-operations.ts` — expanded audited `updateExamInvitation()`.
- `src/app/admin/examinations/actions.ts` — DB-generated code/link selection, feature checks.
- `src/app/admin/examinations/page.tsx` — link to invitation console.
- `src/app/admin/plans/page.tsx`, `src/app/pricing/page.tsx`, `src/app/dashboard/billing/page.tsx` — Institutional rows/hints.
- `src/app/admin/organizations/[id]/tabs/SubscriptionTab.tsx` — customer-side Institutional capability panel.
- `src/app/dashboard/exams/actions.ts`, `new/page.tsx`, `[id]/page.tsx` — entitlement checks, DB-generated identity, embedded access card.
- `src/app/dashboard/{page.tsx,questions/actions.ts,quizzes/actions.ts,team/actions.ts,team/page.tsx}` — centralized entitlement checks.
- `src/app/api/livekit/token/route.ts` — session-aware proctoring feature/entitlement bypass.
- `src/components/ExaminationAccessCard.tsx` — organizer-only access card.

Candidate exam access:

- `src/app/api/exam/link-access/route.ts` — rewritten admission.
- `src/app/exam/join/[token]/page.tsx` — server eligibility/account gate.
- `src/app/exam/join/[token]/JoinClient.tsx` — identity/consent/guest-key/attempt-token contract.
- `src/app/exam-access/page.tsx` — updated shared-link guidance.

Tests / docs / migration artifacts:

- `scripts/test-additional-requirements.mjs` — static/pure current-request suite.
- `scripts/test-additional-requirements.sql` — transactional DB suite.
- `supabase/migrations/0020_institutional_entitlements.sql`
- `supabase/migrations/0021_super_admin_operational_rls.sql`
- `supabase/migrations/0022_exam_access_identity.sql`
- `supabase/migrations/ROLLBACK_0020_0022.sql`
- `docs/ADDITIONAL_REQUIREMENTS.md`
- `docs/TESTING.md` — verification update.

The obsolete combined draft `0020_super_admin_institutional_access.sql` was removed; do not recreate it.

---

## 7. Verification actually performed

### 7.1 Static / compile / build

- `npm install --no-audit --no-fund` → 544 packages installed in the sandbox.
- `./node_modules/.bin/tsc --noEmit` → **0 errors**.
- `npm run lint` → **0 errors**, 13 pre-existing non-blocking warnings (generated `oak-seed-bundle.generated.js`, unused vars/imports in competitions/questions pages, `QuestionRunner.tsx` hook deps).
- Dummy-env `npm run build` → **exit 0**, final rerun 30.7 s, **37/37** static pages generated, including `/exam/join/[token]` 12.5 kB / 136 kB First Load JS. Not a production-env or runtime test.
- `git diff --check` → clean after the final LiveKit edit and docs.
- `npx tsc --noEmit` was a wrong-tool dead end: with local `node_modules` absent it fetched unrelated `tsc@2.0.4`. Use the local binary after `npm install`.

### 7.2 Current-request suites

- `node --experimental-strip-types scripts/test-additional-requirements.mjs` → **51/51 checks passed**: owner/customer capability separation, Institutional entitlements, pure exam-access helpers, fake-Supabase plan resolution, invitation copy, static source/migration coverage. The harmless `MODULE_TYPELESS_PACKAGE_JSON` warning is from Node's type-stripping import of `.ts` modules; it is not a test failure.
- `scripts/test-additional-requirements.sql` executed through `supabase__execute_query` inside `BEGIN … ROLLBACK` → **39/39 passed**. It covered Super Admin RLS reads, owner insertion into an organization with no ordinary membership, DB-generated unique codes/links/hashes, wrong code, cross-exam credentials, invalid token, all 15 exams' links/hashes/settings, identity JSONB columns, plan tiers, ordinary-user tenant isolation, cross-org insert denial and own-org insert allowance. No test rows were committed.
- All existing suites rerun together: `test-admin-utils.mjs` **11/11**, `test-event-operations.mjs` **45/45**, `test-live-three-interfaces.mjs` **49/49**, `test-rich-content.mjs` **147/147** (up from 146 because the new `/admin/operations` route is included), `test-school-systems.mjs` **29/29**, `check-contrast.mjs` **all WCAG 2.2 AA pairs pass**.

### 7.3 Live DB read-only / transactional checks

- Active Super Admin: `3c3ed712-f409-4aa1-a645-816418e22ec4`, `starboyboy2017@gmail.com`, Platform Owner, active, `platform_role=super_admin`, `is_primary=true`.
- Authenticated-JWT RLS simulation inside `BEGIN … ROLLBACK`: `auth.uid()` matched, `public.is_super_admin()=true`, `exams_visible=15`.
- Inventory: 10 profiles, 11 memberships, 3 organizations (demo `de…0001`, platform `b5d3…`, Oak `0a40…0001`); super admin owns the platform and Oak orgs and has no ordinary membership in the demo org.
- `information_schema.columns` confirmed profiles/members/organizations/classes/exams FKs and schema basics.
- `pg_policies` inventory: 93 policies, 90 with explicit `is_super_admin()` paths; three intentional public/unrestricted policies identified above.
- `pg_proc` definitions for `is_super_admin`, `org_role`, `is_org_member`, `can_create_content`, `can_host_live_session`, `can_manage_org`, `is_linked_live_participant` inspected.
- Post-migration: `exam_count=15`, `bad_links=0`, `missing_hashes=0`, `super_policies=90`, `total_policies=93`; Free/Premium `institutional=false`, Institution `institutional=true`; `access_code` default `evalora_unique_exam_code()`, `invite_token` default `gen_random_uuid()`, generated `access_link` path present. Existing tokens/codes/exams/hashes/candidates/attempts/scores/results preserved.

### 7.4 Prior Oak verification (still relevant, not repeated here)

Earlier Oak work on this branch had SQL **36/36** inside `BEGIN … ROLLBACK`, static **45/45**, TS 0, lint 0/13, dummy-env build 0/37, existing suites 11/11 + 49/49 + 146/146 + 29/29, contrast AA, `git diff --check` 0, and a local `npm run start` smoke test: `/`, `/exam-access`, `/login`, `/faq` returned 200; invalid POSTs to `/api/exam/access`, `/api/exam/link-access`, `/api/live/join` returned 400. Those results predate the current-request source edits and are not DB-backed browser/API verification.

---

## 8. Limits of this verification

- `tsc`, lint, build and static scripts prove type/symbol/import correctness and source presence, **not** runtime authorization or DB-backed API behavior.
- The new SQL suite is transactional and DB-backed, but it does not exercise the Next.js API routes, server actions, browser storage, LiveKit, autosave, submit, scoring or results end to end.
- No `.env*`, Chromium/Chrome/Playwright, authenticated browser harness, production credentials, or production deployment were present. No authenticated browser test was performed for Super Admin, Free, Premium, Institutional, registered student, shared-link guest, qualified/unqualified candidate, desktop or mobile.
- No DB-backed live API integration test was run for `/api/exam/link-access`, `/exam/join/[token]`, `/take-exam/[attemptId]`, `/api/exam/access`, `/api/exam/save`, `/api/exam/state`, `/api/exam/submit`, read-only re-entry, refresh persistence, separate browser sessions, attempt recording, answers, timing, autosave, proctoring or results.
- Vercel env still lacks `LIVE_DISPLAY_TOKEN_SECRET` and `NEXT_PUBLIC_ROOT_DOMAIN`; secret values are redacted and were not decrypted. No production-env validation was performed.
- The existing Vercel production deployment remains `dpl_9wriaiQ6pPLkjy6NsR1DgT5oMG2n` (READY/PROMOTED from `7845fa6`). Four auto-started previews from pushes on this branch were canceled; the third (`dpl_CjsT3C5fi8kcdt8mZFe2YhuGzADm`) and the fourth (`dpl_6X67iKBT4vKsWEHWWyMuafnPT4yc`, commit `da0d079`) are both recorded here. No new production deployment, promotion or alias change has been made.

---

## 9. Completed / Implemented but not fully tested / Not implemented / Blocked

### Completed

- Root-cause audit of Super Admin Class Management access and the wider authorization split.
- Centralized pure capability rules, session-aware entitlement wrapper, feature-flag wrapper and server-side capability choke point.
- Explicit owner/customer distinction (`owner` vs `institution`).
- Institutional plan capability keys/features in the single `plans` entitlement source and customer-facing UI.
- Owner OR-paths in operational RLS while preserving ordinary tenant isolation and audit logging.
- Audited operational workspace, direct class console and admin navigation links.
- DB-generated unique exam access code, persisted generated `access_link`, identity JSONB columns and access settings defaults for all 15 exams with no data loss.
- Organizer-only access card, complete invitation copy, Super Admin invitation console, audited settings/regeneration controls.
- Server-verified shared-link candidate workflow with first/last name, consent, configured identity fields, class eligibility, verified-student mode, guest conflicts, attempt policy and deadline response.
- Session-aware LiveKit proctoring entitlement bypass.
- Static/compile/build/transactional DB verification listed in section 7.

### Implemented but not fully tested

- Runtime behavior of `/api/exam/link-access`, `/exam/join/[token]`, `JoinClient`, `ExaminationAccessCard`, invitation actions, operations page and updated LiveKit route.
- Role-separated behavior for Super Admin, Free, Premium and Institutional users in a real authenticated browser.
- Wrong-code, expired/closed exam, unauthorized identity, ineligible candidate/class, cross-exam credentials, refresh persistence, separate-session, duplicate/conflicting attempt, registration, instructions/start, autosave, timing, scoring, results and proctoring negative/regression cases.
- Full canonical absolute-URL copy/persistence across preview/production hostnames (the path is persisted; the origin is host-derived at render time).

### Not implemented

- A canonical **absolute** `share_url` column and backfill; the DB stores only the generated `/exam/join/{token}` path.
- A generalized no-class admission path for exams with no eligible class: the current API returns `409 No eligible class is configured` and the join page shows an error rather than silently admitting a candidate. This is a deliberate safety boundary for Oak, but a general non-class exam needs an explicit organizer-configured workflow.
- Production deployment, promotion, alias change, production-env validation, production-secret decryption.
- Authenticated browser/E2E automation and DB-backed live API integration harness in this sandbox.
- Role-separated deployment of the new migrations to a staging environment with production-like secrets.

### Blocked

- Authenticated browser testing and production deployment require credentials, a browser runtime, production-like env vars and explicit owner authorization after all tests pass. None are available in this workspace.
- Owner decisions recorded earlier still govern: `elimination_count=defer`, keep the existing 20 elimination questions, report the 20/25/5 candidate discrepancy, no new/published examination, and **no deployment until all tests and browser verification pass**. Those browser tests have not been performed.

---

## 10. Immediate next steps before deployment

1. **Done:** reran `./node_modules/.bin/tsc --noEmit`, `npm run lint`, dummy-env `npm run build` and `git diff --check` after the final LiveKit edit; all exited 0 (13 pre-existing non-blocking lint warnings).
2. **Done:** committed and pushed as `da0d0794078d8c1fcf3d6854fb10ba2ee89beee4`; canceled the auto-started Vercel preview `dpl_6X67iKBT4vKsWEHWWyMuafnPT4yc`; did **not** deploy to production.
3. Provision a staging/preview environment with real Supabase/Vercel env, an authenticated test harness and separate browser sessions for Super Admin, Free, Premium, Institutional, registered student, shared-link guest, qualified and unqualified candidates.
4. Run DB-backed API integration for link-access/join/exam state/submit/take-exam/legacy access/read-only re-entry, plus wrong-code, expired/closed, unauthorized-ID, ineligible, cross-exam, refresh-persistence and duplicate/conflicting-attempt negative cases.
5. Verify autosave, timing, scoring, results, proctoring and audit logs are unchanged.
6. Decide whether an absolute canonical URL column and a safe no-class general-exam workflow are required; implement and test them separately if so.
7. Only after all of the above pass and the owner explicitly authorizes deployment, promote to production.
