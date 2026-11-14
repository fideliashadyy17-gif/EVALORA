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

- Inventory is exhaustive for `page.tsx` routes under `src/app` at this snapshot (144 routes). It is not yet a per-component interaction audit: each page’s child components, dialogs, drawers, tabs, API mutations and role-gated variants still need route-specific walkthrough/testing.
- **Completed previous pass:** visual shell for `/exam` code/link resolution and invalid-code states; consistent branded invalid/expired/unavailable invitation shell; exam question reading/media panel, responsive question grid and server-confirmed progress indicator; accessible submit dialog semantics and backdrop dismissal. Shared QuestionRunner keeps native controls per type; added layout hooks for long prompts, media, rich tables, and answer editors.
- **Previous-pass verification:** production build, TypeScript, quiet ESLint, `git diff --check`; 119 test suites passed, 0 failed, 7 browser-dependent suites skipped. Focused exam-entry checks (27), QuestionRunner draft checks (11), outage/pause integrity checks (27), and countdown isolation checks (5) passed.
- **Current in-progress implementation:** inspected Super Admin organizations, students, users, questions, examinations and organization student, teacher, class, question, exam, quiz modules at code level (not full interaction walkthroughs). Added accessible server-rendered filter-preserving pagination to Super Admin organizations/users/questions/examinations/quizzes and organization question/exam/quiz lists; expanded filters and explicit clear states for several lists. Server queries retain tenant filters for organization pages. Teacher status filtering/pagination, separate independent pagination for report sessions and examinations, and tenant-scoped server pagination for the organization student roster are also included. Checks on this fresh branch are pending. No authenticated browser-based verification yet.
- **Production public-route smoke check (2026-11-14):** canonical `https://evalora-six.vercel.app` returned rendered pages for `/`, `/exam`, `/exam-access`, `/join`, `/register`, `/login`, `/student`, and `/pricing`. `/competitions` returned the site's 404 (no matching App Router page exists in this inventory). This checks unauthenticated rendering only; it does not validate forms, mutations, signed-in Super Admin/organization roles, candidate attempt workflows, or mobile/accessibility behavior.
- **Still outstanding:** route-by-route audit and bespoke refinement of all 79 Super Admin and 34 organization pages; teacher-specific interaction review; complete walkthrough of each access, waiting, instructions, active, submit, results and retake state; browser-based desktop/tablet/mobile and accessibility verification; production smoke tests for all roles.
- No data, schema, RLS policy, active attempt or academic content was changed.
- Canonical Vercel project `evalora` (`prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`) serves the verified global alias `https://evalora-six.vercel.app`; PR #60 merge `fcae165fe14183377ac3b0e0b4ddffea41c26385` is READY/PROMOTED. Vercel deployment readiness is not a browser-level workflow test; the current branch additions are not deployed yet.
