# Organization portal, authentication and tenant administration

Report for the Oak International School request. Everything below was verified against
production (`https://evalora-six.vercel.app`) or the Supabase project `nqxqisjtbfsratgztmch`
unless it is explicitly listed as a blocker.

## 1. Why "Sign in" used to land in the examination flow

The portal's *Staff and student → Sign in* button pointed at `/login`, and the middleware
immediately sent any request carrying a session cookie to `/auth/resolve`. A visitor who
already had a session (a student, or staff on a shared laptop) therefore never saw a sign-in
form: they were resolved straight to `/student`, whose landing page offers the exam-access and
live-competition entry points. Nothing was broken in the authentication itself — the page the
user asked for was never rendered.

Fixes:

* `/portal/<slug>` now links to `/login?next=/dashboard&switch=1&org=<slug>`, and its header
  carries a **Staff & student sign in** button.
* `middleware.ts` treats `?switch=1` as an explicit request to see the form; `LoginForm` shows
  "You are already signed in as …" with a **Sign out** action, and signing in switches accounts.
* `/portal/<slug>/login` redirects to that page, so a per-institution address exists.
* The sign-in page is named after the institution ("Sign in to Oak International School") and
  reads only public identity fields of the organization (name, slug, status, portal flag).
* Live Competition (`/join`: code + name + avatar) and Examination Candidates (`/exam-access`)
  remain separate, account-free flows and are linked from the sign-in page.

## 2. Role routing after authentication

`/auth/resolve` decides from **server-verified** records, never from the URL or a client hint:

| Verified state | Destination |
| --- | --- |
| `platform_role = super_admin` | `/admin` (never a customer dashboard) |
| Owners/administrators of the active organization | `/dashboard` |
| Teachers / organizers / supervisors / correctors | `/dashboard` |
| Students, candidates, participants, parents | `/student` (learner destinations) |
| Several memberships | `/workspaces` |
| No membership | `/onboarding` |

Ownership of an organization never implies `super_admin`, and a `super_admin` cannot be routed
into a tenant dashboard by a `next` hint. Only same-origin, root-relative paths are accepted as
`next`; everything else is discarded.

## 3. Modules delivered

| Area | Where | Notes |
| --- | --- | --- |
| Overview | `/dashboard` | Existing statistics, tenant-scoped. |
| Students | `/dashboard/students` | Search, filters, create, class assignment, activation, password reset, results. |
| Teachers | `/dashboard/teachers` | **New.** Real teacher memberships with their classes (`classes.teacher_id`) and authored examinations (`exams.created_by`); managers create accounts here. |
| Staff & Members | `/dashboard/team` | Renamed from *Team & Roles*; members, roles, invitations, removals. |
| Classes / Academic structure | `/dashboard/academics`, `/dashboard/academics/classes` | Existing. |
| Examinations | `/dashboard/exams` | Existing create/schedule/publish/monitor/grade flows. |
| Quizzes | `/dashboard/quizzes` | Existing. |
| Live Competitions | `/dashboard/competitions`, `/dashboard/competitions/[id]` | **New.** Create, publish/close, delete drafts, admission codes, registrations. |
| Question Bank | `/dashboard/questions` | Existing (LaTeX, images, snapshots preserved). |
| Results & Reports | `/dashboard/reports` | Existing. |
| Rubrics / Proctoring | `/dashboard/rubrics`, `/dashboard/proctoring` | Existing. |
| Accounts & Permissions | `/dashboard/accounts` | **New.** Password-reset emails (never plaintext), suspend/reactivate, create staff accounts, student login table. |
| Organization Settings | `/dashboard/settings`, `/dashboard/platform` | Existing, incl. copyable platform URL. |

Navigation is filtered by audience: learners see none of the administration sections, teachers
see teaching areas, and only owners/administrators see Accounts, Organization Settings and
Billing. Every page and server action re-checks the role independently — hiding a link is never
the security boundary.

## 4. Data connected to Oak

* `organizations` row `oak-international-school` (active, portal enabled).
* 18 classes, 27 examinations, 55 quizzes, 28 competitions, 1609 questions already linked to
  that organization id — they appear automatically in the modules above.
* `organization_members` is the authoritative staff link. **Oak has exactly one member: the
  platform operator's global account (`platform_role = super_admin`).** No dedicated Oak
  teacher, administrator or student roster exists yet.
* Nothing was reassigned, copied or backfilled. Records that cannot be verified as belonging to
  Oak were left untouched.

## 5. Organization administrator status (blocker for sign-in verification)

Because Oak has no dedicated Organization Owner, the new one-time provisioning flow was built and
deployed:

* Migration `0081_organization_admin_provisioning.sql` adds `organization_admin_setup`
  (SHA-256 hash only, RLS enabled with **zero policies**, so only the service role can read it).
* `/portal/<slug>/admin-setup?code=…` lets the institution create its own Organization Owner:
  single use, 72-hour expiry, password typed by the institution and stored only by Supabase Auth,
  membership always `owner` in that one organization, `super_admin` emails refused.
* Super Admin console → organization → **Platform URL** → *Create a one-time set-up link*; the
  code is shown once through a short-lived HttpOnly cookie and never enters a URL or a log.

A one-time link for Oak has been issued; it is deliberately **not** written into this repository
(which is public). It is supplied in the conversation and expires 72 hours after issue.

## 6. Tenant isolation checks

* RLS enabled on `organizations` (4 policies), `organization_members` (4), `classes` (2),
  `exams` (2), `competitions` (3); `organization_admin_setup` has RLS on with no policies.
* Every new server action resolves the organization from the session and re-reads the target
  membership **with that organization id**, so a crafted form cannot address another tenant.
* The platform Super Admin's account is refused by name in account management, and the
  organization owner is protected from suspension/password resets by other administrators.
* Password resets only queue Supabase Auth recovery mail; no password is ever written to an
  application table, logged, or returned in a response.

## 7. Migrations

* `0081_organization_admin_provisioning.sql` — applied to `nqxqisjtbfsratgztmch`; additive only
  (one new table, one index, RLS). No existing table, column or row was altered.

## 8. Tests and build

* `npx tsc --noEmit`: clean.
* `eslint`: 0 errors (warnings only, pre-existing).
* `npm test`: **95 suites passed, 0 failed, 7 skipped** (Playwright suites need a browser).
* New suite `scripts/test-org-access-and-accounts.mjs` (13 checks) covers per-role destinations,
  learner isolation, super-admin `next` rejection, navigation audiences, email/password policy,
  account-action guards, and setup-code hashing/expiry/single use.
* `scripts/test-sso-login-page.mjs` extended with institution-named page, unknown-slug fallback,
  switch-account notice and "no candidate-interface copy" checks.
* `npm run build`: success.

## 9. Commit, deployment and production verification

* Commit `768b230`, pull request **#38**, merge `c838fb9` on `main`.
* Vercel deployment `dpl_L6tLqqyyrsxDaqieXUE2Gw6QPEGH` for commit `c838fb9`,
  state **READY / PROMOTED**, aliased to `https://evalora-six.vercel.app`.
* Verified in production (unauthenticated fetch, so the HTML is the server-rendered result):
  * `/login?org=oak-international-school&switch=1&next=/dashboard` renders
    "Sign in to Oak International School" with the form, Show/Hide, Forgot password, and no
    candidate-interface copy.
  * `/portal/oak-international-school/admin-setup?code=<issued>` renders the setup form.
  * `/dashboard/teachers` redirects an unauthenticated visitor to
    `/login?next=%2Fdashboard%2Fteachers`, i.e. tenant-aware route protection is live.

## 10. Blockers and what is still needed

1. **Oak administrator account** — the institution must supply the name and email of the person
   who will hold Organization Owner, and choose a password on the setup page (or ask for an
   invitation instead). Until then no Oak-specific sign-in can be demonstrated end-to-end.
2. **Email delivery** — recovery/invitation mail depends on Supabase SMTP. If it is not
   configured, the console reports that rather than claiming an email was sent.
3. **`oak.evalora.com`** — the production root domain (`evalora-six.vercel.app`) has no wildcard
   DNS/TLS, so per-institution subdomains cannot resolve. The working address is
   `/portal/oak-international-school`; the platform-URL module already models the subdomain and
   will serve it once DNS is delegated.
4. **Student roster** — Oak has no student records; importing them is a separate, deliberate step
   (CSV import exists on the Students page).
