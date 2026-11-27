# Phase 2 delivery record — Platform Control Center + Question Studio

Date: 2026-11-26. Branch: `arena/fb70276a-evalora` (from `fbdadab` of `main`).
Companion documents: `PLATFORM_CONTROL_CENTER_AUDIT_2026-11-26.md` (the discovery
that this record implements) and `EXECUTION_TRACKER.md` (the evidence ledger).

This is a delivery record, not a completion claim. Everything below is code that
exists on this branch and is exercised by the test suites named. Both migrations
are now applied to the live database and a production build of this branch is
promoted on Vercel — the exact state, including the smoke tests that ran against
the live site and the one rollback candidate, is recorded in **Deployment
state** at the end.

---

## 1. What was delivered

### 1.1 Centralized configuration architecture (audit item 5.1)

Schema in code, values in the database. One resolution order everywhere:
**organization override → global value → schema default**, with provenance
(`default | global | organization`) reported to the administrator so a value is
never mysterious.

| Piece | Location |
|---|---|
| Storage + append-only history | `supabase/migrations/20261126220000_platform_control_center_config.sql` — `platform_config_values`, `platform_config_revisions`, `platform_config_presets` (+ the Phase 3 tables in the same file) |
| Schema (10 namespaces, 69 settings) | `src/lib/config/schema.ts` |
| Validation per kind | `src/lib/config/validate.ts` |
| Resolution + provenance + diff | `src/lib/config/resolve.ts` |
| Cached reads, invalidation | `src/lib/config/service.ts` (15 s TTL, fails soft to defaults) |
| Writes, revisions, audit | `src/lib/config/store.ts`, `src/lib/config/actions.ts` |
| Console | `/admin/control-center`, `/admin/control-center/organizations`, `/admin/control-center/organizations/[id]`, `/admin/control-center/history`, `/admin/control-center/presets` |
| Organization-facing view | `/dashboard/settings/configuration` (inherited vs customized, Reset to inherit) |
| Field renderers | `src/components/config/ConfigField.tsx`, `ConfigNamespacePanel.tsx` |

Namespaces: `branding`, `localization`, `formatting`, `platform_behavior`,
`assessment`, `examination`, `question_studio`, `proctoring`, `notifications`,
`org_identity`.

Authority is unchanged from the existing chain: global writes require a verified
Super Admin; an organization write derives its tenant from the session
(`activeOrg`) and checks `organizations.edit` + the `org_settings` module —
it never reads an organization id from the form. Rollback restores the previous
value as a **new** revision with `rolled_back_from`, so history is never
rewritten. An identical write produces no revision at all.

### 1.2 Consumers wired so settings are real (audit items 5.2–5.5, 5.11)

A setting that nothing reads is the defect this phase exists to remove. Every
consumer below reads configuration at request time:

- `src/lib/brandConfig.ts` → `src/components/Logo.tsx`, `SiteChrome.tsx`, root
  layout metadata, the public legal pages, `src/components/platform/BrandProvider.tsx`.
- `src/lib/announcements.ts` → `src/components/platform/AnnouncementBanner.tsx`
  (plain text only — never `dangerouslySetInnerHTML`).
- `src/lib/maintenance.ts` → `src/middleware.ts` (fail-open, Super-Admin bypass,
  rewrite to `/maintenance`) and `src/app/maintenance/page.tsx`.
- `src/lib/formatting.ts` → configured date/time/number/currency rendering for
  new surfaces. The 277 existing `fmtDate`/`fmtDateTime`/`money()` call sites in
  `src/lib/utils.ts` were deliberately left alone in this phase; converting them
  is Phase 4 work and is recorded as open, not done.
- `src/lib/assessmentConfig.ts` → `src/lib/examFeedback.ts`
  (`passMarkFrom(settings, configuredDefault)`), `api/exam/state`, results and
  examination defaults. **This repairs the confirmed dead setting
  `platform_settings.exam_pass_threshold`** (13 call sites previously ignored it).
- `src/lib/orgIdentity.ts` → `src/lib/examPaper.ts`, `src/lib/candidatePaper.ts`,
  the candidate paper page and `api/exam/state` (paper header/footer/logo/accent).
- `src/lib/proctoringConfig.ts` → `api/exam/state`, `api/exam/integrity`, the
  device-check gate below.
- `src/lib/notificationService.ts` → the dashboard notification bells (gated on
  the `platform` module, because the module catalog has no `notifications` key).
- `src/lib/questionStudio.ts` + `src/lib/questionStudioClient.ts` → the question
  editor, the type registry page, the candidate paper (§1.3).

### 1.3 Question Studio: appearance tokens, numbering and templates (audit item 5.6)

Delivered in this phase rather than Phase 3, because the numbering setting was
found to be inert and a design surface without a consumer is exactly the defect
being removed.

- `src/lib/questionDesign.ts` — the token set (card layout, corner radius,
  spacing, padding, option layout, image position and width, font size, numbering
  style, text alignment, instruction panel, page break), its bounds, the CSS
  class/variable emitters, and `formatQuestionNumber()`.
- `src/components/QuestionDesignPanel.tsx` — per-question designer with a live
  preview and "Reset to studio default", rendered inside `QuestionForm`.
- **Numbering precedence on the candidate paper** (`src/lib/candidatePaper.ts`):
  author-typed `question_label` → author-set `question_number` → the question's
  own saved `config.design.numberingStyle` → `null`. A question authored before
  Question Studio has no snapshot and prints exactly as before, so changing a
  platform or organization default **can never restyle a published paper**.
- `src/lib/questionTemplates.ts` + `/admin/questions/templates` +
  `/dashboard/questions/templates` — the reusable template library:
  - applying a template **copies** its payload into the editor: identity is
    stripped, status forced to `draft`, only whitelisted keys survive, and the
    template's design tokens become the new question's own snapshot;
  - `organization_id IS NULL` = platform-wide; a template created from a question
    always inherits **that question's** organization and can never be promoted,
    because that would copy one tenant's content into a payload every tenant can
    read;
  - `usage_count` is incremented atomically in Postgres
    (`question_templates_record_use`, `SECURITY INVOKER`, revoked from
    `anon`/`authenticated`) and only on the create branch of a save, so editing a
    question cannot inflate it; a counter failure can never fail a save;
  - archiving hides a template from authors without deleting anything, and
    questions already created from it are untouched.
- `src/app/admin/questions/types/page.tsx` — the type registry is now Question
  Studio aware: it resolves the configured types for the selected scope, marks
  each as available / withdrawn-from-picker / not-enabled-in-scope, still lists
  withdrawn types with their real usage counts, and reports the configured
  difficulty vocabulary and design defaults.

**Rule that governs all of it:** withdrawing a question type narrows only the
*new-question* picker. A stored question keeps opening, rendering, marking and
printing; no renderer was removed.

### 1.4 Examination admission device checks (audit defect 7)

`/exam-access` and `/exam/join/[token]` had no camera/microphone/browser
verification even though the proctoring settings promised it.

- `src/lib/deviceCheck.ts` — pure probes (no `server-only`, no database, no
  `next/*`, so both the client components and the API route can import it).
  Probes never throw, never record (tracks are stopped in `finally`) and never
  enumerate devices.
- `src/app/api/exam/device-check/route.ts` — `GET` returns the requirements for
  an attempt; `POST` validates the report server-side against requirements
  re-resolved from configuration, accepts only an `in_progress` attempt, and
  writes at most one deduplicated low-severity `proctoring_incidents` row when a
  *required* check is unsatisfied. Full success writes nothing.
- `src/components/exam/DeviceCheckPanel.tsx` + `useDeviceCheckGate.ts`, wired
  into `JoinClient.tsx` (above consent, gating the submit button) and
  `ExamAccessClient.tsx` (post-admission `pendingEntry` step, because the
  organization is unknown until the access code is verified).
- `src/lib/proctoringConfig.ts` decides which checks are required; the integrity
  fast path now honours configured thresholds too
  (`supabase/migrations/20261126230000_integrity_event_rpc_returns_organization.sql`
  returns the organization so the route can resolve them, with thresholds applied
  in TypeScript so both code paths answer identically).

### 1.5 Defects repaired

| # | Defect | Repair |
|---|---|---|
| 1 | `exam_pass_threshold` inert (13 sites) | `assessmentConfig.ts` + `examFeedback.passMarkFrom(settings, configuredDefault)` |
| 2 | `support_email` half-wired | read from `branding`/`platform_behavior` configuration in the surfaces that show it |
| 3 | `organizations.settings` never read for behaviour | `orgIdentity.ts` + the org-scope configuration layer |
| 4 | `QUESTION_TYPES` compile-time constant in the branding file | `questionStudio.ts` narrows the picker from configuration; the constant remains only as the full renderer registry |
| 5 | No email provider | `notifications.email_delivery_available` is read-only (`writableScopes: []`) and the UI says so — a setting is never exposed as controllable when its integration does not exist |
| 6 | No continuous-recording pipeline | `proctoring.continuous_recording_enabled` global-only, marked `operational: false` |
| 7 | No device checks at admission | §1.4 |
| 8 | `color_cream` mismatch | web UI unified on `#f5f3ec`; `mypPdf.ts` keeps `#faf7f0` intentionally (print stock) |
| 9 | Integrity fast path ignored configured thresholds | migration `20261126230000` + `integrityPolicyWithConfiguredDefaults` |
| 10 | URL/image settings accepted protocol-relative `//host/path` | `validate.ts` `SAFE_PATH_OR_URL` refuses them |
| 11 | User-agent clipped before matching + incident note leaked disabled checks | `collectBrowserInfo` matches the raw UA and clips only what it stores; the incident note lists only *required* checks |
| 12 | `numbering_style` had no consumer | §1.3 |
| 13 | `admin/questions/new` resolved the studio config before the `if (!selected)` guard — a `TypeError` on a console with no organizations | guard now runs first |
| 14 | `question_studio.difficulty_levels` was free text while the question store only accepts four labels | §2 below |

---

## 2. Decision: the difficulty vocabulary is a closed choice

`public.questions.difficulty` carries the CHECK constraint
`questions_difficulty_check` (migration `0011_class_question_bank_events.sql`)
limiting values to `easy | medium | hard | competition`, and both save actions
(`src/app/admin/questions/actions.ts`, `src/app/dashboard/questions/actions.ts`)
validate with `z.enum` over the same four.

The setting was first shipped as free text (`string_list`), which meant an
administrator could configure a label — "Excellent", "Olympiad" — that the
picker would offer and the database would then **reject on save**, turning a
configuration change into an unexplained authoring error.

Resolution: the setting is now `multi_enum` over `DIFFICULTY_OPTIONS` (the four
storable labels), and `normalizeDifficulty()` intersects any stored value with
`SUPPORTED_DIFFICULTY_LEVELS`, dropping inventions rather than passing them
through. An organization chooses *which* of the four its authors see; it cannot
invent a fifth. Widening the vocabulary is a schema change and is recorded as
such here instead of being offered as a dashboard setting.

Consequences kept intact:
- the shipped default is `["easy", "medium", "hard"]`;
- `DEFAULT_DIFFICULTY_LEVELS` (client) now matches the schema default — they had
  drifted (`competition` was in one and not the other);
- a question already stored with a label that is no longer configured still opens
  and saves: the editor keeps the current value and marks it "(retired label)".

---

## 3. Verification

| Gate | Result |
|---|---|
| `npm test` | **186 suites passed, 0 failed, 8 browser/cron suites skipped — 10,416 individual checks** |
| `npx tsc --noEmit -p tsconfig.json` | exit 0 |
| `npm run lint` | 0 errors, 21 pre-existing warnings |
| `node scripts/check-contrast.mjs` | all configured palettes pass |

Suites written for this phase (all execute real source with only the database
faked):

- `scripts/test-platform-control-center.mjs` — **75 checks**: schema honesty
  (every declared consumer file exists, every connected module is a real module
  key), resolution and provenance, tenant isolation, validation per kind
  (including the unreadable-palette and protocol-relative-URL refusals), store
  revisions/rollback/reset semantics, preset application, and the server actions'
  authority rules.
- `scripts/test-proctoring-device-checks.mjs` — **32 checks**: probe behaviour,
  requirement resolution, gate payload, incident deduplication and the
  fail-closed rule that a missing field for a required check counts as failed.
- `scripts/test-question-studio-templates.mjs` — **45 checks**: templates are
  copies not links, identity stripping, design snapshotting, tenant isolation of
  reads and of `create-from-question`, the bounded vocabularies, the atomic usage
  counter, and every Super Admin action's guard, audit row and redirect.
- `scripts/test-integrity.mjs` — extended to **74 checks** for the
  configured-threshold fast path.

Harness work (no product behaviour changed): `scripts/__platform_config_stubs.mjs`
provides the shared loader shim (`server-only`, `next/*`, an empty config store)
imported first by 19 suites; three existing question-action harnesses gained a
stub for the new `@/lib/questionTemplates` dependency; the route census in
`test-platform-redesign-audit.mjs` moved to 185 pages.

Route census after this phase: **185 `page.tsx` routes = 95 admin + 53 dashboard
+ 37 other**, plus one new API route (`/api/exam/device-check`, `GET` + `POST`).
New pages: `/admin/control-center{,/organizations,/organizations/[id],/history,/presets}`,
`/admin/questions/templates`, `/dashboard/settings/configuration`,
`/dashboard/questions/templates`, `/maintenance`.

---

## 4. Deliberately not done (recorded, not implied)

- The 8 new `access_permissions` keys (`platform.config.view|manage|org`,
  `question.templates.manage`, `notification.templates.manage`,
  `workflows.manage`, `reports.templates.manage`, `dashboard.layout.manage`) are
  granted to **no** role yet. Until a role is granted them in the organization
  access editor, the organization-facing Control Center page resolves to
  read-only and the dashboard template page is reachable only through the
  existing `questions.create` + `question_bank` module check.
- The 277 `fmtDate`/`fmtDateTime`/`money()` call sites are not yet routed through
  `src/lib/formatting.ts` (Phase 4).
- Notification *templates* (`notification_templates`), workflows, report
  templates and dashboard layouts exist as tables and RLS in the migration but
  have no administrative surface yet — Phases 5 and 6. They are not reachable
  from any page, so nothing promises them.
- Protected content was never touched: the Oak International School Version C
  examinations (`cd000000-…-000000000002`, `ce000000-…-000000000002`) and their
  attempts, answers and moderation rows.

## 5. Deployment state

Executed in the order the plan required: migrations first, then a promoted
production build, then verification against the live site and the live database.

| Step | Status |
|---|---|
| Branch pushed | `arena/fb70276a-evalora` @ `aa00a82` (Phase 2 code in `d620525`, landing-copy correction on top) |
| Pull request opened | [#111](https://github.com/fideliashadyy17-gif/EVALORA/pull/111), base `main`, **not merged** |
| Migrations applied to Supabase `nqxqisjtbfsratgztmch` | applied as `20261127022244 platform_control_center_config` and `20261127022309 integrity_event_rpc_returns_organization`; verified (9 tables, all RLS-enabled, 18 policies, 78 permission rows, 2 seeded values, RPC counter 0→1→2 then the probe row deleted) |
| Production build of the branch | `npm run build` locally: exit 0, every new route compiled |
| Vercel production deployment (`prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`, team `team_Wm3wd7SMXAgNyJggxDHo3l32`, repo id `1445403108`) | `dpl_2EXF8TmC4uY69FS6JcMvS6YrotXH` from `aa00a82`, promoted to `evalora-edu.online`; its predecessor `dpl_8QUGpCEbMstcFjvH49veqhXFsn98` (`d620525`) was the first promoted build; rollback candidate `dpl_HAgHdakCqbmV5TfpEeeLDuDnV9xN` (`main` @ `fbdadab`) |
| Live smoke test | `/` renders on the new build; `/maintenance` renders the configured notice page; `/admin/control-center` and `/dashboard/questions/templates` redirect unauthenticated visitors to `/login?next=…`, which is the authorized path; the new API route `/api/exam/device-check` is registered in the build output |

Two consequences to keep in view:

1. **Production now serves code from this branch, not from `main`.** Vercel
   auto-deploy is disabled for project `evalora`, so every deploy is explicit —
   and this one was promoted while PR #111 is still open. Merging the PR does
   not redeploy anything; it only makes `main` match what users are already
   served. Rolling back is a Vercel action, not a database one.
2. **The database change is not reversible by rolling the build back.** The
   migrations are additive and were applied before the build, so the previous
   deployment keeps working against them (it simply never reads the new tables).
   The supported rollback path is to leave `platform_config_values` and
   `question_templates` empty — every consumer fails soft to its shipped
   default.

A correction that this deployment surfaced: `src/lib/landing.ts` hard-codes the
route counts it quotes as verified ("Product routes", "Verified in /admin
(… routes)") and both had drifted from the census that
`scripts/test-platform-redesign-audit.mjs` asserts. They are now 185 and 95, and
the comment points at the suite so the claim and the assertion stay together.
