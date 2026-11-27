# EVALORA — Platform Control Center
## Phase 1: Complete Technical & Functional Discovery

**Audit date:** 2026-11-26
**Branch:** `arena/fb70276a-evalora` (from `main` @ `fbdadab7`)
**Production app:** `evalora` on Vercel (`prj_1PJb6jCOZPKQSxTTWkE6Gx9l6Ax7`, team `team_Wm3wd7SMXAgNyJggxDHo3l32`), production branch `main`, canonical domain `evalora-edu.online`
**Production database:** Supabase project `EVALORA`, ref `nqxqisjtbfsratgztmch`, region `eu-west-3`, Postgres 17, status `ACTIVE_HEALTHY`
**Baseline test run (before any change):** `183 suites passed, 0 failed, 8 skipped (browser-only) — 10,147 individual checks passed`

---

## 1. What was inspected

| Layer | Scope inspected | Size |
|---|---|---|
| Frontend routes | `src/app/**` — admin console, org dashboard, candidate/exam surfaces, public site, API routes | 530 `.ts`/`.tsx` files |
| Backend services | `src/lib/**` (155 service modules), `src/app/api/**`, `src/app/admin/actions*`, `src/app/dashboard/**/actions.ts` | — |
| Database | Live production schema via Supabase connector | **96 tables** in `public` |
| Migrations | `supabase/migrations/**` | **174 migration files** |
| Tests | `scripts/test-*.mjs` + `scripts/run-tests.mjs` | **191 suites** (183 runnable, 8 browser) |
| Deployment | Vercel project settings, env vars, cron, domains, deployment history | — |

Production tenants (3): `EVALORA Platform` (`evalora-platform`, platform owner), `EVALORA DEMO ACADEMY` (`demo`), **`Oak International School` (`ois`, id `0a400000-0000-4000-8000-000000000001`)**.

Protected assessment content confirmed present and **not touched by this work**:
`MYP 4 (Grade 9) … End of First Term Summative Assessment (Version C)` (`cd000000-…-000000000002`) and
`MYP 5 (Grade 10) … End of First Term E-assessment (Version C)` (`ce000000-…-000000000002`), plus 1,396 questions.

---

## 2. Capability inventory

Classification key:
**[1]** already dashboard-configurable · **[2]** partially configurable · **[3]** hardcoded but suitable for dashboard configuration · **[4]** needs a new administrative interface · **[5]** genuinely requires code-level development

### 2.1 Entitlements, modules, roles — the strongest existing area

| Capability | Current location | Class | Notes |
|---|---|---|---|
| Module catalog (41 modules) | `src/lib/modules.ts` `MODULE_CATALOG` | **[1]** | Keys, groups, recommended plan, honest `availability`, exact `workspacePath`, `surface` (nav/page/admin/none) |
| Plan module entitlements | `plans.modules` jsonb | **[1]** | `/admin/plans/modules` |
| Per-org module overrides | `subscriptions.modules_override` jsonb | **[1]** | `/admin/subscriptions#assign` |
| Module → capability enforcement | `src/lib/capabilities.ts` `getCapabilities()` | **[1]** | Server-side AND into every page/action; sidebar derived from same catalog (`navModules.ts`) — no drift possible |
| Plan limits (19 numeric/boolean limits) | `plans.limits` jsonb, `src/lib/entitlements.ts` | **[1]** | `/admin/plans` |
| Premium exam experience (5 granular switches) | `src/lib/examExperience.ts` | **[1]** | Umbrella + granular inheritance |
| RBAC permission matrix | `access_permissions` (72 perms / 18 categories), `access_roles`, `access_role_permissions`, `access_user_roles`, `rbac_*` | **[1]** | `/admin/rbac`, `/admin/users/roles`; resolution in Postgres `access_has_permission` |
| Operational authorization boundary | `src/lib/operationalAccess.ts` `canOperate()/canOperateMany()` | **[1]** | Intersects RBAC × module entitlement, fails closed |
| Platform feature flags (6) | `platform_settings.features`, `src/lib/platform.ts` | **[1]** | `/admin/modules`; enforced at live-session, exam-creation and proctoring-token choke points |

### 2.2 Assessment design & content

| Capability | Current location | Class | Notes |
|---|---|---|---|
| Question types (11) | `QUESTION_TYPES` in `src/lib/brand.ts`; `src/components/QuestionForm.tsx` (1,129 lines) | **[3]** | The list of supported types is a **compile-time constant**. Adding/removing a type from what authors may pick requires a code change even though the renderers already exist |
| Rich-text question authoring | `src/components/editor/RichContentEditor.tsx` (41 KB, TipTap) + `prompt_doc`/`explanation_doc` jsonb | **[1]** | Bold/italic/underline, colour, highlight, alignment, font family, tables, images, links |
| Mathematical input | `MathField.tsx`, `mathKeyboard.ts`, `plainMathKeyboard.ts`, MathLive + KaTeX, `src/lib/mathExpr.ts` | **[1]** | Fractions, powers, roots, matrices, integrals, derivatives, summations, limits |
| Diagrams / geometry / graphs / stats / Venn / probability / stem-leaf | `src/lib/{assessDiagram,geometrySpec,graphSpec,statsSpec,vennSpec,probabilityTreeSpec,stemLeafSpec}.ts` + matching components | **[2]** | Renderers operational; authoring driven by structured jsonb, not by a unified visual designer |
| Multi-part questions | `src/lib/assessParts.ts` (26 KB), `config.parts` | **[1]** | 291 questions use it |
| Response tools / formula sheets | `src/lib/responseTools.ts` (32 KB), `formula_library` table | **[1]** | 276 questions |
| Question metadata (curriculum, topic, subtopic, source, review status, tags, class, subject) | `questions` columns + `config` jsonb (40+ distinct keys) | **[2]** | Rich but **free-form**: no validated schema, no bulk edit, no configurable vocabulary |
| Question categories | `question_categories` | **[1]** | `/admin/questions/categories` |
| Question pools & random selection | `question_pools`, `question_pool_items` | **[1]** | `/admin/competitions/pools` |
| Question → assessment-criterion mapping | `src/lib/questionAssessment.ts`, migration `20261124210000` | **[1]** | 847 questions carry `myp_criterion` |
| **Reusable question templates** | — | **[4]** | **Does not exist.** No table, no UI |
| **Question design/layout tokens** (card layout, borders, radius, spacing, option layout, numbering style, per-breakpoint) | — | **[4]** | **Does not exist.** Presentation is fixed by component CSS |
| Paper Builder | `/dashboard/paper-builder`, `exam_paper_templates`, `quizzes.settings` (28 distinct keys: sections, marks, calculator, randomization, header) | **[2]** | Template row is thin (7 fields); page size/margins/header-footer/numbering style are **hardcoded in `src/lib/candidatePaperPdf.ts` (133 KB)** → **[3]/[5]** |
| Examination lifecycle | `exams.status` + `src/app/dashboard/exams/actions.ts` | **[2]** | Transitions implemented and guarded, but the **rules are not configurable** → **[4]** |

### 2.3 Assessment frameworks, marking, results

| Capability | Current location | Class | Notes |
|---|---|---|---|
| Grading engine (6 curricula: MYP, AP, Beninese, Cambridge, British, custom) | `src/lib/gradingSystems.ts` + `grading_systems` table | **[1]** | Organisation-owned configs; honest provenance comments; never fabricates official cut points |
| MYP framework config | `myp_framework_config`, `myp_criteria`, `myp_level_boundaries`, `myp_grade_boundaries` + `/dashboard/myp-results/settings` | **[1]** | Criteria A–D, strands, descriptors, achievement levels |
| Rubrics & moderation | `grading_rubrics`, `grading_rubric_criteria`, `grading_moderation`, `answer_rubric_scores` | **[1]** | `/dashboard/rubrics` |
| Score adjustments | `exam_score_adjustments`, `exam_score_adjustment_items`, `grade_change_log` | **[1]** | `/dashboard/score-adjustments` |
| AI marking proposals | `ai_marking_proposals` + guardrails migration `0039` | **[1]** | Proposal-only; human decision required |
| Results publication workflow | `exams.grades_published_at/by`, `result_publication_mode`, `src/lib/resultLifecycle.ts` | **[2]** | Explicit validate → publish enforced; **publication rules not configurable** → **[4]** |
| Candidate result links | `/exam-result/[token]`, `src/lib/examLink.ts` | **[1]** | Token-scoped, reveals only that candidate's published result |
| **`exam_pass_threshold`** | `platform_settings` row | **BROKEN** | See §3.1 — stored, editable, **never read by any module** |
| Pass percent actually used | `DEFAULT_PASS_PERCENT = 50` in `src/lib/examFeedback.ts:21` | **[3]** | Hardcoded |

### 2.4 Proctoring

| Capability | Current location | Class | Notes |
|---|---|---|---|
| Retention policies & runs | `proctoring_retention_policies`, `proctoring_retention_runs` + `/dashboard/settings/proctoring` | **[1]** | 1–3650 days, legal hold, dry-run before apply |
| Incidents, reviews, recordings, rooms | `proctoring_incidents`, `proctoring_incident_reviews`, `proctoring_recordings`, `proctoring_rooms`, `proctoring_room_events` | **[1]** | `/admin/proctoring`, `/dashboard/proctoring` |
| Lockdown / assessment protection | `src/lib/assessmentLockdown.ts`, `exam_lockdown_challenges`, `src/app/api/lockdown` | **[2]** | Notices and captured-event list hardcoded (**[3]**); challenge TTL hardcoded (**[3]**) |
| Live media | LiveKit (`livekit-server-sdk`), `src/app/api/livekit/token` | **[1]** | Module catalog honestly marks this `external_dependency` on LiveKit credentials |
| **Camera/mic/browser-check requirements, incident categories, alert thresholds** | — | **[4]** | Per-examination proctoring requirements are **not administrable**; only retention is |

### 2.5 Platform & organization configuration — the main gap

| Capability | Current location | Class | Notes |
|---|---|---|---|
| Platform name, tagline, description, support email, logo set, brand colours | `src/lib/brand.ts` — **compile-time constant**, 33 references across 32 files | **[3]** | Changing the platform name requires a code change and redeploy |
| Theme tokens | `src/app/globals.css` `@theme` block (Tailwind v4 CSS variables) | **[2]** | Centralised as CSS variables — **therefore runtime-overridable**, which is what §4 exploits |
| Typography | `@fontsource-variable/fraunces` + `public-sans`, `--font-display`/`--font-sans` | **[3]** | Font *choice* is not configurable |
| Interface languages (en/fr/es) | `src/lib/i18n/config.ts` `LOCALES`, `DEFAULT_LOCALE` | **[3]** | Which languages are offered, and the platform default, are hardcoded; per-user preference **is** stored (`profiles.interface_locale`) |
| Date / number / time formats | `src/lib/utils.ts` `fmtDate`/`fmtDateTime` (`"en-GB"` literal), `money()` (`"en-US"` literal) | **[3]** | Hardcoded locale tags |
| Default timezone | — | **[4]** | No platform or org timezone setting exists |
| Default academic year | `academic_years` table (per org) | **[2]** | No platform default |
| Global announcements | — | **[4]** | None |
| Maintenance mode | — | **[4]** | None |
| Default landing pages | `src/app/page.tsx`, `src/lib/landing.ts` | **[3]** | Content hardcoded |
| Organization branding (logo) | `organizations.logo_url` + `LogoUpload`, `/dashboard/settings` | **[1]** | Works, storage-backed, size/type validated |
| Organization identity (name, type, description, country, city, address, contacts) | `organizations` columns, `/dashboard/settings` | **[1]** | |
| Organization portal URL / subdomain / custom domain | `organizations.{slug,custom_domain,platform_domain_status,portal_enabled,previous_slugs}` + `src/lib/tenant.ts` | **[1]** | Honest about what the deployment can actually serve |
| `organizations.settings` jsonb | 3 rows, values `{}`, `{"demo":true,…}`, `{"platform_owned":true}` | **unused** | A per-tenant settings bag exists but **nothing reads configurable behaviour from it** |
| Academic structure (levels, classes, sections, subjects, curricula, departments, teacher subjects) | `education_levels`, `classes`, `class_subjects`, `class_curricula`, `subjects`, `curriculum_programmes`, `departments`, `teacher_subjects`, `student_enrollments` | **[1]** | `/dashboard/academics`, `/admin/classes` |
| Trial window, payment config, billing instructions | `platform_settings.{trial_days,payment_config,payment_instructions}` | **[1]** | Wired: read by `src/lib/admin.ts` and `/dashboard/billing` |
| Exam link policy, hints policy | `platform_settings.{exam_link_policy,exam_hints_policy}` | **[1]** | Wired: `src/lib/examLink*.ts`, `src/lib/examHints*.ts` |
| **Configuration inheritance / versioning / rollback** | — | **[4]** | `platform_settings` is a **flat key→jsonb table**: no scope layering, no schema validation, no revision history, no rollback, no provenance display. Only `exam_pass_threshold` ad-hoc-embeds an `organization_overrides` object — and that key is never read |

### 2.6 Operations, notifications, reporting, dashboards

| Capability | Current location | Class | Notes |
|---|---|---|---|
| In-app notifications | `notifications` table, `NotificationBell.tsx`, `/dashboard/notifications`, `src/lib/notifications.ts` | **[2]** | Delivery works; **message text is hardcoded at each call site** |
| **Email / message templates with variables** | — | **[4]** | **Does not exist.** No template table, no editor, no preview, no test-send, no delivery log. Verified by exhaustive search for `notification_template`/`emailTemplate`/`email_template` → 0 hits |
| **Workflow / automation builder** | — | **[4]** | **Does not exist.** No trigger→condition→action engine, no run history. Verified: no `workflow_definitions` table, no engine module |
| Cron automation | `/api/cron/close-expired-attempts` (Vercel cron `0 3 * * *`) | **[5]** | Schedule lives in `vercel.json`/Vercel — infrastructure, correctly not a dashboard setting |
| Reports & exports | `/admin/examinations/reports`, `/dashboard/reports`, `src/lib/{mypExcel,mypPdf,xlsx,csv}.ts`, `@e965/xlsx`, `pdf-lib` | **[2]** | Report *outputs* are implemented; report *definitions* (fields, filters, grouping, saved templates) are hardcoded per report → **[4]** |
| Dashboard cards / widgets / layout | `/dashboard/page.tsx`, `DashboardChrome.tsx` | **[3]** | Navigation is entitlement-driven (good) but layout/composition is fixed → **[4]** |
| Audit logging | `audit_logs` + `src/lib/admin.ts audit()` | **[1]** | `/admin/audit`, `/admin/activity` |
| System health | `/admin/system`, `/api/health`, LiveKit verification card | **[1]** | |
| Imports / batches | `import_batches`, `src/lib/{studentImport,xlsx,extractServer}.ts`, `StudentImportWizard.tsx` | **[1]** | |

---

## 3. Defects found by verifying behaviour (not by reading table names)

### 3.1 `exam_pass_threshold` is a disconnected configuration — CONFIRMED BROKEN

```
platform_settings → key 'exam_pass_threshold' → {"default_percent":50,"organization_overrides":{}}
```

Exhaustive search of `src/` for `exam_pass_threshold`: **0 references.**
The value the application actually uses is `DEFAULT_PASS_PERCENT = 50` at `src/lib/examFeedback.ts:21`, consumed by `resultSummary()`.

→ An administrator can edit this setting, see it save, and **nothing changes**. This is exactly the failure mode the directive forbids. **Repaired in this phase** (§5.3): the assessment namespace now resolves the pass threshold from centralized config with organization override, and `examFeedback` consumes the resolved value.

### 3.2 `support_email` is duplicated and only half-wired

`platform_settings.support_email` is read **only by the admin page that displays it** (`src/app/admin/settings/page.tsx`). Every customer-facing surface (`/contact`, `/privacy`, `/terms`, `/cookies`, landing, `SiteChrome`) reads the hardcoded `BRAND.supportEmail`. Two sources of truth, one of them inert. **Repaired**: the branding namespace is authoritative and `BRAND` becomes the documented fallback.

### 3.3 `organizations.settings` is an unused bag

Present on all 3 tenants, never read for behaviour. Rather than invent a third storage location, the new architecture keeps `organizations.settings` for its existing structural flags and puts configurable behaviour in the versioned config store, with a documented mapping.

### 3.4 Question-type list is a compile-time constant in the *branding* file

`QUESTION_TYPES` lives in `src/lib/brand.ts` — a branding module — and gates what authors may create. It is now surfaced as a configuration-controlled availability list without removing any existing type (no regression to the 1,396 stored questions).

---

## 4. Centralized configuration architecture (designed)

**Principle:** the *schema* is code (typed, validated, reviewable, testable); the *values* are database rows (versioned, scoped, audited, rollback-able). The dashboard can never write an arbitrary key, an arbitrary type, or arbitrary code — it can only write a value that a declared schema accepts.

```
                      ┌───────────────────────────────────────────┐
                      │  src/lib/config/schema.ts                 │
                      │  CONFIG_SCHEMA — the single registry      │
                      │  namespace · key · type · validation      │
                      │  default · scopes · module · connectedTo  │
                      │  sensitivity · group · help               │
                      └───────────────────┬───────────────────────┘
                                          │ validates every write
                                          ▼
  platform_config_values  ◄───── resolveConfig(scope) ─────► effective value + provenance
  (scope_level, scope_id,                │                    'default' | 'global' | 'organization'
   namespace, key, value,                │
   revision, updated_by/at)              ▼
                              ┌─────────────────────┐
  platform_config_revisions ──┤ history · diff ·    │   audit_logs (existing)
  (previous, new, revision,   │ rollback            │
   change_note, changed_by)   └─────────────────────┘

  platform_config_presets ──► Super-Admin-authored org presets, applicable on demand
```

**Resolution order:** `organization override` → `global value` → `schema default`. Every resolved key reports *why* it has that value, so the UI can show `Inherited from platform default` vs `Customized for Oak International School`, and offer a safe **Reset to inherit** (deletes the override row; never touches the global).

**Propagation:** writes go through server actions that (a) validate against the schema, (b) upsert the value with `revision + 1`, (c) append a revision row, (d) write `audit_logs`, (e) invalidate the resolver cache, (f) `revalidatePath` for every connected surface. Modules read through `resolveConfig()` — one service, no conflicting hardcoded copies.

**Storage policy:** additive only. No `DROP`, no `TRUNCATE`, no `UPDATE` of existing assessment rows, no default that changes current behaviour. Every new table is RLS-enabled; global scope is Super-Admin-write, organization scope is org-manager-write within the caller's own tenant.

---

## 5. Implementation plan

| # | Existing capability | Current location | Missing administrative control | Dashboard location | Backend / DB change | Connected modules | Security | Acceptance test |
|---|---|---|---|---|---|---|---|---|
| 5.1 | Flat `platform_settings` key/value | `platform_settings`, `src/lib/platform.ts`, `src/lib/admin.ts` | Scope layering, schema validation, versioning, rollback, provenance | `/admin/control-center` hub | `platform_config_values`, `platform_config_revisions`, `platform_config_presets`; `src/lib/config/*` | every module below | Super Admin for global; `organizations.edit` + `org_settings` module for org scope; RLS on all three tables | `scripts/test-platform-config-architecture.mjs` |
| 5.2 | Brand/theme/locale hardcoded | `src/lib/brand.ts`, `globals.css @theme`, `src/lib/i18n/config.ts`, `src/lib/utils.ts` | Platform name, description, logo, favicon, colours, typography, default theme, default + supported languages, date/time/number formats, default timezone | Control Center → Platform Configuration | `branding`, `localization`, `formatting` namespaces | Root layout, metadata, `SiteChrome`, `LanguageSwitcher`, `fmtDate/fmtDateTime/money`, public legal pages | Global = Super Admin only; org branding scoped to own tenant | `test-platform-config-architecture.mjs`, `test-control-center-branding.mjs` |
| 5.3 | `DEFAULT_PASS_PERCENT = 50` hardcoded; `exam_pass_threshold` inert | `src/lib/examFeedback.ts:21` | Default pass threshold with org override | Control Center → Assessment defaults | `assessment` namespace; migrate the existing stored value in as the seeded default | `examFeedback.resultSummary`, results management, reports | `exams.manage` / `org_settings` | `test-assessment-config-wiring.mjs` |
| 5.4 | Platform behaviour constants | scattered `src/lib/*.ts` | Maintenance mode, global announcements, default landing page, registration policy | Control Center → Platform behaviour | `platform_behavior` namespace; maintenance gate + announcement banner in root layout | All pages, auth, public site | Maintenance bypass for verified Super Admin so the platform can never be locked out | `test-platform-behavior-config.mjs` |
| 5.5 | Per-tenant config absent | `organizations.settings` (unused) | Org overrides with inheritance display + Reset to inherit | Control Center → Organizations → *org* → Configuration | organization scope in the same tables | Org dashboard, exam paper header, grading, notifications | Tenant isolation: an org can only write rows whose `scope_id` is its own id; global rows are read-only to orgs | `test-config-org-isolation.mjs` |
| 5.6 | Question presentation fixed | component CSS; `QuestionForm.tsx` | Design tokens (card, border, radius, spacing, option layout, numbering) + reusable templates | Control Center → Question Studio | `question_templates` table; `questionDesign.ts` token resolver; tokens consumed by question rendering and the paper/PDF path | Question Bank, Paper Builder, exam renderer, candidate PDF | Template scope: global (Super Admin) or org (`questions.manage`); **published papers keep the token set snapshotted at authoring time** so an edit cannot restyle a live exam | `test-question-studio-templates.mjs` |
| 5.7 | Notification text hardcoded | call sites across `src/lib`, `src/app/**/actions.ts` | Template editor with variables, preview, per-scope override | Control Center → Notifications | `notification_templates` table; `renderTemplate()` with a **whitelisted variable set** (no expression evaluation) | Invitations, reminders, submission confirmations, results publication, account invites, password reset, announcements | No credential/password variable is ever registered; org templates scoped to own tenant | `test-notification-templates.mjs` |
| 5.8 | No automation | — | Visual trigger → condition → action builder, activation, run history, retry | Control Center → Workflows | `workflow_definitions`, `workflow_runs`; **predefined validated action registry only** — no arbitrary code, no SQL, no `eval` | Exam lifecycle events, marking, validation, publication, candidate join, proctoring incidents | Actions execute server-side through existing guarded service functions; publication actions **request** publication, never auto-publish | `test-workflow-builder.mjs` |
| 5.9 | Report definitions hardcoded | `/admin/examinations/reports`, `/dashboard/reports` | Saved report templates: fields, filters, grouping, date range | Control Center → Reports | `report_templates` table | Exams, classes, subjects, candidates, criteria, MYP levels, marking progress, proctoring stats | Field whitelist per report family; tenant filter forced server-side, never from the client | `test-report-templates.mjs` |
| 5.10 | Dashboard layout fixed | `/dashboard/page.tsx` | Card/widget visibility, ordering, default landing page per role | Control Center → Dashboard | `dashboard_layouts` table | Dashboard, navigation | Cannot expose a module the entitlement denies — layout is filtered through `getCapabilities()` after composition | `test-dashboard-layout-config.mjs` |
| 5.11 | Proctoring requirements fixed | `src/lib/proctoring.ts`, `assessmentLockdown.ts` | Camera/mic/browser checks, incident categories, alert thresholds, evidence review rules | Control Center → Proctoring | `proctoring` namespace | Proctoring console, lockdown client, incident review | Recording/evidence access unchanged; privacy copy on every setting; **no setting is exposed unless its integration is operational** | `test-proctoring-config.mjs` |

### Deliberately NOT exposed as dashboard settings (class **[5]**)

| Capability | Why it stays in code |
|---|---|
| PDF engine internals (`candidatePaperPdf.ts`, 133 KB) | Page geometry is produced by a layout algorithm; only its *inputs* (header fields, section titles, marks display, logo) are configurable. Once a new layout primitive is developed, its options become dashboard settings |
| Cron schedule | Vercel infrastructure (`vercel.json` + project cron), not application state |
| RLS policies, DB triggers, `SECURITY DEFINER` functions | Security boundary. Exposing these would be exposing the infrastructure, which §17 of the directive forbids |
| LiveKit / SMTP credentials | Secrets belong in Vercel env + Supabase secrets, never in a configuration row |
| Grading *algorithms* | The engine is code; its *parameters* (boundaries, coefficients, weights, thresholds, rounding, pass marks) are already organization-configurable in `grading_systems` and remain so |
| New question renderers | A renderer is developed once; its supported layout settings then appear in Question Studio |

---

## 6. Delivery order

Phase 2 (this PR): 5.1–5.5 — architecture, Platform Control Center, platform configuration, organization configuration with inheritance, and the two confirmed defect repairs.
Phase 3: 5.6 Question Studio templates + design tokens.
Phase 4: assessment/marking/results configuration surface (extends 5.3).
Phase 5: 5.7 notifications, 5.8 workflows, 5.9 reports, 5.11 proctoring.
Phase 6: 5.10 dashboard builder.
Phase 7: end-to-end verification, regression, deployment.

Every phase ships functional and wired — no placeholder screens.

### Delivery status as shipped (updated after the build was promoted)

The order above was the plan; what actually shipped moved Phase 3 into the same
delivery, because the Question Studio settings only became honest once the
templates and design tokens existed to carry them.

| Phase | State |
|---|---|
| 2 — 5.1–5.5 architecture, Control Center, platform + organization configuration, the two confirmed defect repairs | **Delivered**, on branch `arena/fb70276a-evalora` (PR #111), migrations applied to Supabase `nqxqisjtbfsratgztmch`, production build promoted. Record: `PHASE2_CONTROL_CENTER_QUESTION_STUDIO_2026-11-26.md`. |
| 3 — 5.6 Question Studio templates + design tokens | **Delivered in the same increment** (deliberately: `question_studio.*` had no consumer without it). |
| — Admission device checks (defect 3.x) | **Delivered in the same increment.** |
| 4 — assessment/marking/results configuration surface | Partially delivered: the `assessment` and `examination` namespaces exist and are consumed (`examFeedback.passMarkFrom`, marking defaults, result-link expiry). The 277 `fmtDate`/`fmtDateTime`/`money()` call sites in `src/lib/utils.ts` are still not routed through `src/lib/formatting.ts`, so `formatting.*` is honoured by the new code paths only. **Open.** |
| 5 — 5.7 notifications, 5.8 workflows, 5.9 reports, 5.11 proctoring | Proctoring policy delivered (thresholds, capability report, incident note). Notification *delivery* is exposed read-only because no email provider exists. `notification_templates`, `workflow_definitions`, `workflow_runs`, `report_templates` exist as tables + RLS + permission keys with **no administrative surface**. **Open.** |
| 6 — 5.10 dashboard builder | `dashboard_layouts` table + RLS + permission key only. **Open.** |
| 7 — end-to-end verification, regression, deployment | Deployment done and smoke-tested unauthenticated; the authenticated end-to-end pass (a real Super Admin editing a value and watching it change a rendered page) has **not** been run against production. **Open.** |
