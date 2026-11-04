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
- No per-candidate exam time extension: `exam_attempts` has no extension column and the
  deadline is server-computed (`started_at + duration`). Extend the exam window by editing
  `ends_at` in the workspace.
- The admin competition monitor is a server-rendered snapshot (refresh link); live
  "connected" = `last_seen_at` within 90 s.
