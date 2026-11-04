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
