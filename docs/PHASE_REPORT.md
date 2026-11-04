# EVALORA — Phase Report (build of 4 Nov 2026)

Production: **https://evalora-starboyboy2017-cells-projects.vercel.app**
Repo/branch: `fideliashadyy17-gif/EVALORA` @ `arena/2f92ccd9-evalora`
Supabase project: `EVALORA` (`nqxqisjtbfsratgztmch`, eu-west-3) — newly created;
`oak-competition-platform-premium` was **paused** (owner-approved, reversible)
to free a free-plan slot.

## Phase 0 — Audit ✅
Empty repo (README only); 2 existing Supabase projects (both Oak school);
Vercel Hobby account; reference site studied (deep-green academic identity).

## Phase 1 — Foundation ✅
- Original EVALORA logo system (SVG set in `public/brand/`, favicon, light/dark/horizontal/stacked), brand centralized in `src/lib/brand.ts`.
- Design tokens (evergreen/gold/cream, Fraunces + Public Sans self-hosted).
- Public site: home, features, how-it-works, use-cases, pricing (live from DB), FAQ, contact (writes support tickets), help, privacy, terms, cookies.
- Supabase Auth: register/login/forgot/reset/callback, profile trigger, Super Admin bootstrap for the owner's email.
- Multi-tenancy: organizations, 9 roles, invitations, 26 tables, RLS on all, storage buckets,Realtime publication, seed plans (Free/Premium/Institution) + 14-day trial setting.

## Phase 2 — Studio ✅
Question bank (10 types, KaTeX, media, categories, preview), reviewed CSV
import with per-row error report + template, quiz builder (ordering,
randomization settings, duplicate/publish/archive), plan-limit enforcement.

## Phase 3 — Live engine ✅
Sessions with 6-char codes + QR, lobby, synchronized & self-paced modes,
host console (start/next/pause/end, remove participant, leaderboard toggle),
participant play client (countdown from server offset, feedback, recovery via
stored token), server-side scoring with speed factor in sync mode, idempotent
answers, projector screen. **Not yet load-tested** (see TESTING.md).

## Phase 4 — Examinations ✅
Exam CRUD from published quizzes, candidate registers (single/bulk) with
personal codes, admission API, per-candidate randomized order, autosave,
flag-for-review, server deadline with auto-submission, objective auto-marking,
corrector queue, results publication with PASS/FAIL vs pass mark, candidate
review of explanations after publication.

## Phase 5 — Proctoring ✅ (recording pending config)
LiveKit Cloud wired with the owner's project: server-minted room tokens
(candidate publish, supervisor subscribe-only), candidate camera (+ optional
screen share) inside the exam UI, supervisor grid paginated at 12/page with
focus view, incident logging + human review workflow. **Recording/egress is
not enabled** — needs an S3 target + retention decision (documented).

## Phase 6 — Commercial system ✅
Plans with JSON limits/features, entitlement resolution (trial → active →
free fallback), usage meters, manual payment flow (instructions from DB,
reference + proof upload to private bucket, pending state, Super Admin
approve/reject with reason, notifications both ways, activation only on
approval).

## Phase 7 — Super Admin ✅
Overview metrics, payment reviews (signed proof URLs), users (suspend),
organizations (suspend, grant subscriptions), plans editor, support tickets,
audit log, platform settings (JSON).

## Phase 8 — QA (partial) ⚠️
Build green; scoring unit tests pass; migration verified. Still required
before real cohorts: the manual acceptance script on the live URL, tenant-
isolation tests with two orgs, and staged load tests (TESTING.md). No
performance claim is made yet.

## Phase 9 — Deployment ✅ (one owner action remains)
Vercel project `evalora` created with env vars (Supabase, LiveKit, Super
Admin); production deployment READY from the arena branch; Supabase Auth
site URL + redirect allow-list set to the production domain.
**Action required:** your Vercel team protects all `*.vercel.app` URLs with
SSO (Deployment Protection). In Vercel → project *evalora* → Settings →
Deployment Protection → set **Vercel Authentication** to *Disabled* (or add a
custom domain). Until then visitors see a Vercel login page.
Also recommended: connect the repo in the same Settings → Git (install the
Vercel GitHub App for `fideliashadyy17-gif`) so merges to `main` auto-deploy —
the API-created deployment works, but Git integration needs repo admin access
your Vercel GitHub identity didn't have.

## Known limitations / next steps
1. Email: Supabase built-in SMTP is heavily rate-limited — add custom SMTP.
2. Recording egress: configure S3 target + retention before enabling.
3. Excel/PDF/Word imports: CSV template is the supported path (documented in UI).
4. Word clouds: represented via poll/open-ended today; dedicated renderer is a small follow-up.
5. Load testing & the 1,000-participant target: unproven until TESTING.md stages run.
6. Vercel Hobby → Pro required for commercial use.
7. `oak-competition-platform-premium` remains paused — restore from the Supabase dashboard whenever needed (restoring may require the free-slot math to be revisited).
