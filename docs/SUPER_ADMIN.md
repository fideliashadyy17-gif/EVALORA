# EVALORA — Primary Super Admin & the Admin Console

## The Primary Super Admin account

- **Account:** the platform owner's email (`platform_settings` key `super_admin` records it).
- **Role:** `profiles.platform_role = 'super_admin'` with `profiles.is_primary = true` — a database-level
  designation, unique across the platform (partial unique index `profiles_one_primary`).
- **Provisioned by the operator**, never by registration: `handle_new_user()` always creates plain
  `user` profiles. Granting/revoking Super Admin is an explicit database operation.
- **Password:** the account was created with an unknowable random placeholder. The owner sets the
  real password via **Forgot password** on the live site (Supabase recovery email → reset page),
  then signs in normally and can change it later in Settings. Nobody else ever knows it.

## Protection against privilege escalation & accidents

- `protect_profile_privileges()` trigger: `platform_role` / `is_primary` are immutable for every
  ordinary API caller (`authenticated` role) — only `service_role` (server actions that already
  passed `requireSuperAdmin()`) or a database operator may change them. The Primary account
  additionally cannot be suspended or deleted through app traffic.
- Console guards (second layer): the Primary cannot be suspended from **Users**, users cannot
  suspend themselves, and only the Primary may suspend another Super Admin.
- Every admin mutation writes an `audit_logs` row. Destructive actions (delete quiz/question,
  end live session, cancel subscription, broadcast) require an explicit confirmation tick.

## Console map (`/admin`)

| Group | Modules |
|---|---|
| Overview | Platform overview (users, orgs, revenue, live now, incidents, tickets) |
| People | Users · Organizations (suspend, grant subscriptions) |
| Content & Events | Competitions (live sessions, force-end) · Quiz Management · Question Bank · Examinations · Proctoring (incidents, rooms, recordings) |
| Commerce | Subscriptions · Pricing & Plans · Payment Reviews · Revenue & Reports (CSV/PDF) |
| Platform | Notifications (broadcast) · Modules & Features (server-enforced switches) · Platform Settings · Support Tickets · Security & Audit Logs · Technical Monitoring (live DB/storage stats) |

Module switches are enforced server-side at three choke points: starting a live session,
creating an examination, and minting LiveKit proctoring tokens (`src/lib/platform.ts`).

## Verification performed at setup (2026-11-04)

Executed against the production database with simulated PostgREST identities
(`SET LOCAL ROLE authenticated` + JWT claims):

- Owner auth user exists, email confirmed, email identity present, not banned.
- Profile is `super_admin` + `is_primary`; exactly one Primary exists.
- `is_super_admin()` = true for the owner, false for a stranger identity.
- Owner reads platform-wide rows through RLS (incl. super-admin-only `audit_logs`);
  a stranger reads 0 rows in `profiles` / `audit_logs` / `payment_requests`.
- Benign own-profile update succeeds under the `authenticated` role.
- Registration trigger contains no promotion path; privilege-protection trigger installed.
- The one step that cannot be executed by the operator — by design — is typing the owner's
  password: the owner sets it via the reset flow, after which `/admin` is fully accessible.

---

# Owner Control Center (added 2026-11-04)

The Primary Super Admin is the platform owner and can run the entire platform from `/admin`
without any purchase workflow. This is enforced at three layers — never by hiding UI:

1. **Database (migration 0003):** `org_role()` returns `'owner'` when `is_super_admin()` is true,
   so every RLS policy built on the org helpers (`is_org_member`, `can_manage_org`,
   `can_create_content`) treats the owner as owner of every organization. Tenant isolation for
   everyone else is unchanged (verified with simulated JWT claims: stranger sees 0 rows).
2. **Entitlements (`src/lib/entitlements.ts`):** `getEntitlement` returns an unlimited
   "Platform Owner" entitlement for Super Admins, so no paywall, quota, or seat limit ever
   blocks the owner. `subscriptions.limits_override` merges over plan limits for customers.
   The bypass overrides **commerce only** — RLS, the privilege-protection trigger, and audit
   logging always stay on.
3. **Server actions:** every console operation runs through `requireSuperAdmin()` + the
   service-role client and writes an `audit_logs` row (with before/after values on edits).

## Workspace mode

"Open workspace" (organization hub, overview quick actions, quiz/question/exam rows) sets the
httpOnly `evalora_admin_org` cookie (12 h, super-admin only, audit-logged on enter/exit) and
drops the owner into that organization's normal `/dashboard`, where the full quiz, question
and examination builders live. A gold banner shows workspace mode; exiting restores the owner
to `/admin`. A platform-owned organization ("EVALORA Platform", `settings.platform_owned`) is
the owner's own home for creating content without a customer org.

## Financial integrity

- Manual payments (`source = 'manual' | 'adjustment'`) are recorded in **Payments → Add
  payment** with proof upload; approved + linked to a plan they activate the subscription via
  `activatePaidSubscription`. Unverified payments never count as revenue.
- Complimentary access is a subscription with `source = 'admin_grant' | 'complimentary'` and
  `granted_by` — never a fictitious payment row (verified: grant org had 0 payments).
- **Migration 0004** adds a partial unique index
  `payment_requests (organization_id, transaction_ref) where status not in
  ('rejected','cancelled')` — duplicate financial operations are blocked by the database
  (verified on insert and update); rejected payments can be resubmitted with the same ref.
- Refund/cancel are status transitions with confirmation; every change is audited with
  before/after values. Payment methods, currencies and customer instructions are configured
  in **Settings → Payment configuration** (`platform_settings.payment_config`).

## Console additions

| Page | What it does |
|---|---|
| `/admin` | "Run the platform" quick actions, attention strip (pending payments/tickets/incidents), 12 KPIs, recent audit |
| `/admin/organizations` (+`/new`, `/[id]`) | Full CRUD; 6-tab hub — Overview, Members, Academics, Subscription, Activity; ownership transfer; archive → delete; open workspace |
| `/admin/students` (+`/new`) | Roster across orgs; create/edit; CSV import (≤1000 rows, per-row errors); bulk status/delete; class move; optional student login |
| `/admin/users` (+`/new`, `/[id]`) | Invite/temp-password creation (one-time flash), reset email, memberships, super-admin grant (Primary only), guarded delete |
| `/admin/competitions` (+`/new`, `/[id]`) | Full lifecycle; tabs for access codes (expiry, max uses, org/class restrictions), participants (CSV import), results (validate/publish/export), settings; start live session. A competition's quiz must belong to its host org (server-enforced) |
| `/admin/payments` (+`/new`, `/[id]`) | Manual recording, review/approve/reject, refund/cancel, proof viewer, per-payment audit trail, CSV export |
| `/admin/subscriptions` | Assign plan (paid record, trial, or grant with custom expiry + limits), extend, suspend/reactivate, cancel |
| `/admin/quizzes`, `/admin/questions`, `/admin/examinations` | Cross-org catalogs with filters; create/edit opens the org workspace builders; examination class-candidate registration; question CSV export |
| `/admin/notifications` | Attention queues; broadcast; targeted (whole org or one user by email) — all audited |
| `/admin/search` | Global search: users, organizations, students, competitions, quizzes, examinations, payment references |
| `/admin/settings` | Friendly payment configuration form + raw platform settings |

## Verification performed (2026-11-04, production DB)

- Migration 0003 applied & verified: 10 new tables with RLS on, new columns, `org-logos`
  bucket, `payment_config` seed, platform org.
- Simulated-claims RLS battery: owner = `'owner'` on any org; stranger = NULL role, 0 rows.
- Full workflow battery in two throwaway QA organizations (created and deleted; table counts
  verified back to baseline afterwards): org → members → academic year/level/department/
  subject/class → 3 students + enrollments → quiz → competition + access code + 2
  registrations → approved manual payment → active `paid` subscription; second org:
  `admin_grant` subscription with limits override and **zero** payment rows.
- Negative tests: invalid student status and invalid subscription source rejected by CHECK
  constraints; duplicate `transaction_ref` was initially accepted by the DB → fixed by
  migration 0004 and re-verified (insert blocked, update blocked, rejected→resubmit allowed).
- Unit checks: `node scripts/test-admin-utils.mjs` — CSV parsing/validation, access-code
  generation, CSV export escaping (11 checks).
- `npm run build` green.

### Known boundaries (honest)

- Authenticated UI flows could not be click-tested by the operator: the owner's password is
  deliberately unknown (set via Forgot password), and the deployment is behind Vercel SSO.
  Everything above was verified at the DB/action-contract/build level instead.
- Per-candidate exam extensions were added later by migration 0005; see the unified
  Super Admin / mathematical-editor section below.
- The admin competition monitor is a server-rendered snapshot (refresh link); live
  "connected" = `last_seen_at` within 90 s.


---

# Complete A–H Super Admin modules & unified mathematical editor (2026-11-04)

## Navigation and route map

The Owner Control Center sidebar is now organized into eight explicit, collapsible groups.
Every entry below is a real route backed by server-side Super Admin authorization and the
existing Supabase data model; there are no decorative module labels or duplicate parallel
implementations. Existing organization workspaces are still used where the full builder is
tenant-scoped (notably Quiz Builder ordering and LiveKit proctor rooms), while question and
examination administration now also have direct platform-level workflows.

| Group | Working routes |
|---|---|
| **A. Overview** | `/admin` · `/admin/statistics` · `/admin/audit` · `/admin/activity` |
| **B. Organizations & Schools** | `/admin/organizations` · `/admin/organizations/new` · `/admin/organizations/admins` · `/admin/subscriptions` · `/admin/organizations/settings` |
| **C. Students & Users** | `/admin/students` · `/admin/users/teachers` · `/admin/users/school-admins` · `/admin/users` · `/admin/users/roles` · `/admin/students/new` · `/admin/students/bulk` · `/admin/students/access` |
| **D. Live Competition** | `/admin/competitions` · `/admin/competitions/new` · `/admin/competitions/configuration` · `/admin/competitions/participants` · `/admin/competitions/register` · `/admin/competitions/codes` · `/admin/competitions/questions` · `/admin/competitions/live` · `/admin/competitions/results` · `/admin/competitions/reports` |
| **E. Quiz & Questions** | `/admin/quizzes` · `/admin/quizzes/new` · `/admin/questions` · `/admin/questions/new` · `/admin/questions/categories` · `/admin/questions/types` · `/admin/questions/solutions` · `/admin/quizzes/assignments` · `/admin/quizzes/results` |
| **F. Examinations** | `/admin/examinations` · `/admin/examinations/new` · `/admin/examinations/questions` · `/admin/examinations/candidates` · `/admin/examinations/register` · `/admin/examinations/codes` · `/admin/examinations/schedule` · `/admin/examinations/time-limits` · `/admin/examinations/monitoring` · `/admin/examinations/marking` · `/admin/examinations/results` · `/admin/examinations/reports` · `/admin/proctoring` |
| **G. Payments & Subscriptions** | `/admin/payments` · `/admin/payments/new` · `/admin/subscriptions` · `/admin/plans` · `/admin/subscriptions#assign` · `/admin/revenue` |
| **H. Platform Administration** | `/admin/users?role=super_admin` · `/admin/users/roles` · `/admin/settings` · `/admin/modules` · `/admin/audit` · `/admin/system` · `/admin/notifications` · `/admin/support` |

## One editor everywhere

`QuestionForm` is the shared authoring surface for organization workspaces and direct
Super Admin question creation/editing (`/admin/questions/new`, `/admin/questions/[id]`).
The same `RichContent` renderer and structured documents are used by the Question Bank,
quiz builder/preview, live participant and host/projector views, examinations, marking,
reports, answer feedback and worked solutions.

- **Text mode (Tiptap/ProseMirror):** headings and paragraphs; bold, italic, underline and
  strike; font family and size; text/highlight colour; alignment; bullet/numbered lists;
  links; tables with row/column controls; clipboard editing; undo/redo.
- **Math mode (MathLive):** a visual mathematical surface for the selected equation.
  Authors can click inside fractions, radicals, scripts, integrals and matrices, use
  keyboard movement/selection/deletion and fill structured placeholders.
- **LaTeX mode:** raw LaTeX with validation and rendered preview. Invalid source is never
  silently rewritten; visual switching is blocked until it parses, while the source stays
  exactly as typed.
- **Mathematical keyboard:** categorized, cursor-aware and reopenable. Button faces are
  rendered mathematics, and structural keys insert placeholders rather than English words.
  Categories cover basics, fractions/roots, powers, relations, algebra, geometry,
  trigonometry, functions, limits, derivatives, integrals, sums/products, matrices, Greek,
  sets/logic, statistics/probability, vectors and other structures.
- **Images/diagrams:** upload or URL insertion, width presets, alt text, caption/title,
  replacement by editing the node, and deletion. Prompt, each choice option and worked
  solution each have independent rich content. Uploads use the Supabase Storage
  `question-media` bucket; the database stores the public URL and accessibility metadata,
  never base64 file payloads.

Supported question storage/rendering remains aligned for single choice, multiple select,
true/false, short answer with accepted alternatives, numeric tolerance, ordering, matching,
poll, open-ended structured responses and slides. Exact-match answer identities (accepted
short answers, ordering labels and matching pair labels) intentionally remain canonical
text for deterministic scoring, while their prompts/options/explanations can be rich. Drafts may
remain incomplete, but server actions refuse to publish a question whose answer key,
accepted answers, numeric answer/tolerance, pairs/items or marking criteria are not ready.

## Structured storage and security

Migration `0005_rich_content.sql` added JSONB documents without deleting legacy columns:

- `questions.prompt_doc`
- `questions.explanation_doc`
- `question_options.content_doc`
- `exam_attempts.extension_minutes` (0–1440)

Math nodes preserve their LaTeX in node attributes. Plain-text prompt/explanation/label
projections are retained for compatibility and search. Candidate/participant payloads are
built through `publicQuestion()`, which carries prompt and option documents but strips
correctness, accepted answers, explanations and marking criteria. Examination explanations
are returned only after submission **and** result publication. Super Admin mutations use
`requireSuperAdmin()`, service-role server actions and `audit_logs`; RLS remains in force
for ordinary authenticated traffic.

## Examination time enforcement

An attempt deadline is always calculated on the server by `attemptDeadline()`:

`min(started_at + duration_minutes + extension_minutes, ends_at + extension_minutes)`

Access, state, save and submit all use this calculation. Autosave after the deadline is
rejected. A direct submit request that arrives late grades only previously autosaved
answers and is recorded as `auto_submitted` with `submitted_at` equal to the deadline,
not the later request time. Authorized extensions are granted from **Examinations →
Duration & Time Limits**, can add minutes or set a total, require an in-progress attempt,
and are written to the audit log with previous/new values, reason and computed deadline.

## Verification

- `node scripts/test-admin-utils.mjs` — CSV/import/code/export checks.
- `node scripts/test-rich-content.mjs` — structured mixed-content samples covering
  radicals, stacked fractions, super/subscripts, matrices, summation, integrals, limits,
  derivatives, image metadata, LaTeX round-trip/validation/rendering, keyboard templates,
  candidate-safe payloads, deadline/extension calculations, late-submit source contract
  and existence of every A–H navigation route.
- `node scripts/check-contrast.mjs` — WCAG 2.2 AA token checks.
- `npm run build` — Next.js production compilation, lint and type checking.

### Honest formats and remaining boundaries

- Exports labelled “CSV / Excel” are UTF-8 CSV files that open directly in Excel; EVALORA
  does not currently generate native `.xlsx` workbooks. PDF output uses the browser's
  print-to-PDF flow.
- Spreadsheet imports accept CSV (including an Excel sheet saved/exported as CSV), not a
  binary `.xlsx` upload.
- The production owner password is intentionally known only to the owner, and Vercel
  Deployment Protection may remain enabled. Authenticated browser click-through therefore
  still requires the owner to sign in after deployment; database, API-contract, unit and
  production-build verification are automated in the repository.

## School portals, classes, imports & DEMO (added 2026-11-04)

See `docs/SCHOOL_PORTALS_AND_IMPORTS.md` for the full guide. In short:
**/admin/classes** manages classes across schools; organization subdomains
(`organizations.slug`, reserved-label checked, changes audit-logged) drive
server-side tenant resolution in middleware/`getSessionContext`; the
advanced student-import wizard (CSV/XLS/XLSX/PDF/DOC/DOCX + browser OCR)
runs through `/api/students/import` with `import_batches` logging and
per-school SHA-256 idempotency; **/admin/demo** controls the protected
EVALORA DEMO ACADEMY (one-time DEMO logins, activity reset scoped to the
demo org) and the source-question migration ledger. Production school
subdomains still require the owner's custom root domain + wildcard on
Vercel and `NEXT_PUBLIC_ROOT_DOMAIN` — only `*.vercel.app` is attached
today, so portals currently live at `/portal/<slug>`.
