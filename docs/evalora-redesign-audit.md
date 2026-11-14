# EVALORA global redesign — route and workflow inventory

Discovery snapshot from the active branch. Routes are file-system page routes; dynamic segments are shown in angle brackets.

**Total app page routes: 144**
**Primary Admin: 79** · **Organization dashboard: 34** · **Core student/assessment journey: 8** · **Other public/tenant routes: 23**

## Super Admin navigation modules (from AdminShell)

1. Overview — global dashboard, statistics, audit/activity, recent operations.
2. Organizations & Schools — organizations, access, classes, org creation/admins/settings, subscriptions, demo/migration.
3. Students & Users — students, teachers, school admins, platform users, roles/permissions, registrations/import/export/access.
4. Live Competition — competitions, configuration, participants, access codes, questions, events/phases, pools, qualifications, live monitoring, results/reports.
5. Quiz & Questions — quizzes, question bank, categories, types, solutions, assignments, results.
6. Examinations — exam dashboard/create, questions, candidates/registration/codes/invitations/links, retakes, hints, scheduling/time limits, monitoring, marking, results/reports, proctoring.
7. Payments & Subscriptions — payments/manual payment, subscriptions, plans/overrides, revenue/history.
8. Platform Administration — super-admin users, roles, settings, modules/features, audit, system health, notifications, support.
9. Operational Workspace — organization workspace access and direct operational module entries.

## Organization navigation modules (from DashboardChrome)

1. Overview.
2. Institutional Management — students, teachers, staff/members, classes, academic structure, accounts/permissions, settings.
3. Assessment — quizzes, exams, questions, competitions, rubrics, proctoring, reports/results.
4. Organization — platform/domain and billing/plan.

## Student and assessment workflows identified

- Student hub and role-routed learning entry.
- Public exam-code/link resolution; personal candidate-code access; shareable invitation identity/class/access-code flow.
- Active exam paper, question navigation, answer editors, durable autosave, recovery/pause, proctoring, submit confirmation, submitted/published result and corrigé paths.
- Live competition join, waiting/approval, in-progress response, connection recovery, score/results states.
- Retake request/access workflow.

## Cross-route UI/workflow surface inventory

- Admin and organization pages together contain shared PageTitle/StatCard/EmptyState/Card patterns, with route-specific data, actions and forms. Static audit counts found 249 `<form>` instances and 15 HTML tables in `src/app/admin`, plus 83 `<form>` instances and 21 HTML tables in `src/app/dashboard` (source-text counts; nested components can add interactions).
- Core response types in `QuestionRunner`: single-choice, multiple-select, true/false, poll, short answer, numeric, ordering, matching, open-ended structured response and assess-parts; some parts can invoke math/graph/geometry/table response tools described by server-provided `response_workspace`.
- Existing exam safeguards observed: isolated server-offset countdown, durable save queue, local recovery, explicit dirty-answer guard, pause/reconnect behavior, idempotent explicit submit, published-results gate, and distinct status for unconfirmed saves.

## Complete file-route inventory

### Super Admin console (79 routes)

- `/admin`
- `/admin/activity`
- `/admin/audit`
- `/admin/classes`
- `/admin/competitions`
- `/admin/competitions/<id>`
- `/admin/competitions/codes`
- `/admin/competitions/configuration`
- `/admin/competitions/events`
- `/admin/competitions/events/<id>`
- `/admin/competitions/live`
- `/admin/competitions/new`
- `/admin/competitions/participants`
- `/admin/competitions/pools`
- `/admin/competitions/qualifications`
- `/admin/competitions/questions`
- `/admin/competitions/register`
- `/admin/competitions/reports`
- `/admin/competitions/results`
- `/admin/demo`
- `/admin/examinations`
- `/admin/examinations/candidates`
- `/admin/examinations/codes`
- `/admin/examinations/hints`
- `/admin/examinations/invitations`
- `/admin/examinations/links`
- `/admin/examinations/marking`
- `/admin/examinations/monitoring`
- `/admin/examinations/new`
- `/admin/examinations/questions`
- `/admin/examinations/register`
- `/admin/examinations/reports`
- `/admin/examinations/results`
- `/admin/examinations/retakes`
- `/admin/examinations/schedule`
- `/admin/examinations/time-limits`
- `/admin/modules`
- `/admin/notifications`
- `/admin/operations`
- `/admin/organizations`
- `/admin/organizations/<id>`
- `/admin/organizations/access`
- `/admin/organizations/admins`
- `/admin/organizations/new`
- `/admin/organizations/settings`
- `/admin/payments`
- `/admin/payments/<id>`
- `/admin/payments/new`
- `/admin/plans`
- `/admin/proctoring`
- `/admin/proctoring/retention`
- `/admin/questions`
- `/admin/questions/<id>`
- `/admin/questions/categories`
- `/admin/questions/generate`
- `/admin/questions/new`
- `/admin/questions/solutions`
- `/admin/questions/types`
- `/admin/quizzes`
- `/admin/quizzes/assignments`
- `/admin/quizzes/new`
- `/admin/quizzes/results`
- `/admin/revenue`
- `/admin/search`
- `/admin/settings`
- `/admin/statistics`
- `/admin/students`
- `/admin/students/access`
- `/admin/students/bulk`
- `/admin/students/new`
- `/admin/subscriptions`
- `/admin/support`
- `/admin/system`
- `/admin/users`
- `/admin/users/<id>`
- `/admin/users/new`
- `/admin/users/roles`
- `/admin/users/school-admins`
- `/admin/users/teachers`

### Organization dashboard (34 routes)

- `/dashboard`
- `/dashboard/academics`
- `/dashboard/academics/classes`
- `/dashboard/accounts`
- `/dashboard/billing`
- `/dashboard/competitions`
- `/dashboard/competitions/<id>`
- `/dashboard/exams`
- `/dashboard/exams/<id>`
- `/dashboard/exams/<id>/grades`
- `/dashboard/exams/<id>/monitor`
- `/dashboard/exams/<id>/paper`
- `/dashboard/exams/<id>/proctor`
- `/dashboard/exams/new`
- `/dashboard/notifications`
- `/dashboard/platform`
- `/dashboard/proctoring`
- `/dashboard/questions`
- `/dashboard/questions/<id>`
- `/dashboard/questions/new`
- `/dashboard/quizzes`
- `/dashboard/quizzes/<id>`
- `/dashboard/quizzes/new`
- `/dashboard/reports`
- `/dashboard/reports/exam/<id>`
- `/dashboard/reports/session/<id>`
- `/dashboard/rubrics`
- `/dashboard/rubrics/<id>`
- `/dashboard/sessions/<id>/host`
- `/dashboard/settings`
- `/dashboard/settings/proctoring`
- `/dashboard/students`
- `/dashboard/teachers`
- `/dashboard/team`

### Student & assessment journey (8 routes)

- `/exam`
- `/exam-access`
- `/exam/join/<token>`
- `/join`
- `/play/<code>`
- `/retake/<requestId>`
- `/student`
- `/take-exam/<attemptId>`

### Other global/public and tenant routes (23 routes)

- `/`
- `/contact`
- `/cookies`
- `/faq`
- `/features`
- `/forgot-password`
- `/help`
- `/how-it-works`
- `/invite/<token>`
- `/live/<liveId>`
- `/live/<liveId>/screen`
- `/login`
- `/onboarding`
- `/portal/<slug>`
- `/portal/<slug>/admin-setup`
- `/portal/<slug>/login`
- `/pricing`
- `/privacy`
- `/register`
- `/reset-password`
- `/terms`
- `/use-cases`
- `/workspaces`

## Audit status and implementation ledger

- **Complete 144-route audit & cohesive UI/UX upgrade completed (`2026-11-14`):**
  - **Super Admin Console (`79 / 79` routes audited & upgraded):** Unified executive `PageTitle` eyebrows across every subpage, KPI `StatCard` summaries across list/oversight hubs, 100% conversion of all raw `<table>` elements to the accessible `<Table>` primitive (`scope="col"`, semantic captions/labels, responsive horizontal wrappers), filter-preserving `<PageNavigation>` pagination and explicit filter-clear links across high-volume operational registers (`activity`, `audit`, `classes`, `competitions`, `competitions/codes`, `competitions/participants`, `competitions/pools`, `competitions/questions`, `competitions/results`, `examinations`, `examinations/candidates`, `examinations/codes`, `examinations/hints`, `examinations/invitations`, `examinations/links`, `examinations/marking`, `examinations/questions`, `examinations/results`, `examinations/retakes`, `examinations/schedule`, `examinations/time-limits`, `notifications`, `organizations`, `organizations/[id]`, `organizations/access`, `organizations/admins`, `payments`, `proctoring`, `questions`, `questions/categories`, `questions/solutions`, `quizzes`, `quizzes/assignments`, `quizzes/results`, `revenue`, `students`, `students/access`, `subscriptions`, `support`, `users`, `users/school-admins`, `users/teachers`).
  - **Organization Workspace (`34 / 34` routes audited & upgraded):** Unified workspace `PageTitle` eyebrows across every subpage, KPI `StatCard` summaries (`students`, `teachers`, `team`, `academics`, `academics/classes`, `notifications`, `questions`, `quizzes`, `rubrics`, `exams`, `exams/[id]`, `reports`), 100% conversion of all dashboard raw `<table>` elements to accessible `<DataTable>` (leaving only the black-and-white print stylesheet `MarkerTable` in `exams/[id]/paper/page.tsx` and the ARIA-labeled live `ExamMonitor.tsx`), filter-preserving `<PageNavigation>` (`students`, `teachers`, `academics/classes`, `accounts`, `notifications`, `questions`, `quizzes`, `competitions`, `competitions/[id]`, `exams`, `exams/[id]/grades`, `proctoring`, `reports`), and WCAG token normalization (`text-ink-soft` / `text-evergreen-*`).
  - **Student, Candidate, Portal, Live & Public Surfaces (`31 / 31` routes audited & verified):** Cohesive `.exam-entry` institutional check-in architecture across `/exam`, `/exam-access`, `/exam/join/[token]`, `/join`, and `/retake/[requestId]` with `<main>` landmarks, `role="alert"` / `role="status"` live announcements, and cross-recovery links; upgraded `/workspaces` multi-organization switcher with `<Logo>`, role/active `<Badge>`s, and sign-out access; added sign-out escape hatch on `/onboarding`; converted `/pricing` plan comparison matrix to `<DataTable>`.
- **7 concrete functional & UX bugs uncovered and fixed during the 144-route walkthrough:**
  1. `src/app/admin/operations/page.tsx`: Fixed broken 404 workspace hand-off `next: "/dashboard/sessions"` → `"/dashboard/competitions"` and `Proctoring` `next` → `"/dashboard/proctoring"`.
  2. `src/app/admin/organizations/access/page.tsx`: Wired the missing `<Select name="state">` filter control into the form to match its existing server-side `sp.state` filter.
  3. `src/app/admin/questions/page.tsx`: Fixed 8-`<th>` vs 10-`<td>` table column misalignment (`Class & Curriculum` and `Editorial Review` cells lacked headers; empty-state `colSpan` corrected from `8` to `10`).
  4. `src/app/admin/competitions/events/page.tsx` & `src/app/admin/examinations/page.tsx`: Removed hardcoded `"Oak event phases"` metadata title, added multi-tenant `<Select name="event">` selector, fixed broken 404 link `/admin/examinations/${l.exam_id}` → `/admin/examinations?exam=${l.exam_id}`, and wired `sp.exam` filtering in `src/app/admin/examinations/page.tsx`.
  5. `src/app/dashboard/settings/page.tsx`: Added direct navigation action (`Proctoring retention →`) to `/dashboard/settings/proctoring`, which was previously unreachable from Organization Settings.
  6. `src/app/dashboard/exams/[id]/paper/page.tsx`: Removed stray trailing curly quote in candidate packet fallback (`access_code ?? "—”"` → `access_code ?? "—"`).
  7. `src/app/dashboard/competitions/actions.ts`: Fixed silent drop of `max_participants` in `createOrgCompetition` so participant caps configured in `/dashboard/competitions` are persisted on insert.
- **Verification ledger (`scripts/test-platform-redesign-audit.mjs` + full repo suite):**
  - TypeScript (`npx tsc --noEmit`): 0 errors.
  - ESLint (`npm run lint`): 0 errors, 0 warnings.
  - WCAG 2.2 AA contrast audit (`node scripts/check-contrast.mjs`): all 30 token pairs pass AA.
  - Automated test runner (`npm test`): **120 suites passed, 0 failed — 1,789 individual checks passed** (including 225 structural/accessibility/regression checks in `test-platform-redesign-audit.mjs`).
  - Zero destructive database changes: no schema drops, no RLS weakenings, no tenant isolation changes, and no active examination attempt or academic data altered.
