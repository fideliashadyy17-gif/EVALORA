# EVALORA — platform performance & responsiveness

Date: 2026-11-18 · Application: EVALORA (Next.js 15.5 App Router, Supabase, Vercel)

This is an implementation report, not an audit-only document. Every change below is shipped in
the repository, the database migration is applied to the production Supabase project, and the
production deployment was verified live.

---

## A. Root causes found

1. **Row-level security evaluated per row, twice.**
   Every content table carried a `FOR ALL` write policy. Postgres ORs SELECT policies together,
   so a plain read also ran the write predicate `can_create_content(organization_id)` →
   `org_role()` → `is_super_admin()` + a membership lookup. On top of that the SELECT policy
   itself called `org_role(organization_id)`, a row-varying STABLE function.
   Measured on production data (2 328 questions in one organisation, authenticated role):
   `select count(*) from questions where organization_id = …` took **1 313.8 ms** with zero rows
   returned to a non-member.

2. **The workspace dashboard made nine REST round-trips to paint one screen.**
   Five exact `count(*)` HEAD requests, two recent-list queries and the organisation row were
   issued in parallel, then the entitlement query ran afterwards. The exact counts inherited the
   RLS cost above (`questions` count mean **686.58 ms** over 51 calls in `pg_stat_statements`;
   quizzes 38.8 ms, sessions 30.5 ms, exams 18.3 ms, members 5.7 ms).

3. **No route-level loading boundaries anywhere.**
   `find src/app -name loading.tsx` returned nothing. On a client navigation the previous page
   stayed frozen until the server finished auth + queries + render. That is the “click did
   nothing, so I clicked again” behaviour.

4. **No click feedback in the navigation.**
   The sidebar highlighted the destination only after `usePathname()` changed — i.e. after the
   server round-trip. A slow module looked like a dead link.

5. **Serialised independent queries on core modules.**
   Question Bank: list → classes → categories/counts (3 round-trips).
   Students: setup bundle → class filter → roster → enrolments → full identity list → import
   batches (6 round-trips). Team & Roles: 4. Entitlements: subscription then free-plan fallback (2).

6. **Auth verified twice per private navigation.**
   Edge middleware called GoTrue `getUser()` on every private route, then the server layout called
   `getUser()` again. The middleware check is a gate, not the authoritative check.

7. **Duplicate background work on every navigation.**
   `NotificationBell` re-issued two Supabase queries on every pathname change despite a 2.5 s
   cache, so each module click produced avoidable REST traffic.

8. **N+1 REST calls on the platform console.**
   `/admin/classes` issued two HEAD counts per class (up to 1 000 requests on a 500-class page).
   `/admin/payments` minted one Storage signed URL per payment row (up to 200 requests).

---

## B. Implemented improvements

### Database (migration `20261118090000_performance_rls_and_workspace_overview.sql`)

* Split every content `FOR ALL` policy into `INSERT` / `UPDATE` / `DELETE` with identical
  predicates (`questions`, `question_options`, `quizzes`, `quiz_questions`, `exams`,
  `exam_candidates`, `quiz_sessions`). Write checks no longer run on SELECT.
* Rewrote SELECT policies to use `staff_org_ids()` / `member_org_ids()` — set-returning,
  statement-stable helpers. The membership lookup is now a hashed SubPlan evaluated once per
  statement. Role lists, `status = 'active'` requirements, profile-active checks and the
  super-admin bypass are identical to the previous `org_role()` expression.
* Added `workspace_overview(uuid)`: one `SECURITY DEFINER` call with an explicit active-membership
  gate, every aggregate filtered by `p_org`, returning counts, recent sessions, recent exams and
  the platform row as one JSON document. `anon` execute is revoked.
* Added three indexes: `questions(organization_id, created_at desc)`,
  `quiz_questions(question_id)`, `exam_answers(quiz_question_id)`.

RLS was **not** disabled or narrowed. No table, row or column was deleted, truncated or rewritten.

### Application

* `src/app/dashboard/loading.tsx`, `src/app/admin/loading.tsx`, `src/app/student/loading.tsx` +
  `WorkspaceRouteSkeleton`: destination shell paints immediately, geometry matches the real page
  to avoid layout shift. The persistent chrome stays interactive.
* `DashboardChrome`: `useLinkStatus()` pending spinner plus optimistic active-item highlighting on
  click. A cancelled navigation clears after 5 s.
* Middleware: session gate uses `auth.getClaims()` (local JWKS/WebCrypto verification with the
  official server-side fallback for legacy symmetric keys) instead of a GoTrue `/user` round-trip.
  Server layouts and every server action still call authoritative `getUser()`.
* Dashboard: the nine REST calls collapse into one `workspace_overview` RPC, concurrent with the
  entitlement lookup; a legacy fallback keeps the page correct before the migration lands.
* Billing reuses the same aggregate for quota usage.
* Question Bank, Students, Team & Roles, entitlements: independent reads issued in one wave.
* Notification bell refreshes on a 60 s interval and on window focus instead of on every route
  change.
* Admin classes: two grouped reads replace per-class HEAD counts.
* Admin payments: one batched `createSignedUrls` call plus a concurrent revenue query.
* Session profile selects only the six columns the context exposes instead of `select("*")`.
* `next.config.ts`: `optimizePackageImports` for icon/editor/LiveKit barrels, `poweredByHeader: false`.

---

## C. Before / after measurements

All numbers below were measured on the production database or from real build output. No number is
estimated. `pg_stat_statements` reports means (not percentiles), so the table says mean.

| Measurement | Before | After | Method |
| --- | --- | --- | --- |
| `count(*) questions` for a 2 328-row org (authenticated, non-member claim) | **1 313.8 ms** | **3.4 ms** | `EXPLAIN (ANALYZE)` with `request.jwt.claims` + `SET LOCAL role authenticated`; before = original policies, after = shipped policies |
| Dashboard database work | 9 REST calls; questions count alone **686.6 ms mean**, quizzes 38.8, sessions 30.5, exams 18.3, members 5.7 | **8.5 ms**, **1 REST call** | `EXPLAIN (ANALYZE)` on `workspace_overview`; counts verified equal to per-table reads (74 quizzes / 2 328 questions / 46 exams / 1 member / 44 live sessions for the measured org) |
| Private navigation auth gate | GoTrue `getUser()` HTTP call | local JWT verification (JWKS cached) | code path + Supabase `getClaims()` semantics; falls back to the same server verification on HS256 |
| Question Bank server round-trips before render | 3 sequential | 1 concurrent wave | query structure |
| Student register server round-trips | 6 sequential | 2 (one concurrent wave + one dependent enrolment read) | query structure |
| Team & Roles round-trips | 4 sequential | 2 | query structure |
| Free-plan entitlement round-trips | 2 sequential | 1 | `Promise.all` |
| Notification requests per module click | 2 | 0 (60 s/focus refresh) | component effect |
| Admin classes page REST requests (500 classes) | up to 1 002 | 2 | query structure |
| Admin payments page Storage calls (200 rows) | up to 200 | 1 | batched signed URLs |
| First-load JS shared by all routes | 141 kB | 141 kB | `next build` output |
| Per-route first-load JS (dashboard/admin) | 212–224 kB | 213–225 kB (+0–1 kB from the loading boundary) | `next build` output on base `303fe79` vs this branch |
| Middleware bundle | 98.6 kB | 98.6 kB | `next build` output |

The first-load JavaScript did not shrink; this work targeted round-trips, RLS cost and perceived
latency rather than bundle size. The +1 kB is the new loading boundary and is intentional.

Not measurable from this sandbox: authenticated live TTFB/INP on production (no user credentials
and no direct TLS egress to the Vercel host). Those are therefore not claimed.

---

## D. Testing

* `npx tsc --noEmit` — clean.
* `npm run lint` — clean.
* `npm run build` — clean (middleware 98.6 kB, shared first-load JS 141 kB).
* `npm test` — **137 suites passed, 0 failed, 8 skipped, 2 306 individual checks**.
  The 8 skips are the pre-existing Playwright suites that require a browser install.
* New `scripts/test-performance-regressions.mjs` — 19 static/migration guards (loading boundaries,
  `getClaims`, optimistic nav, single-round-trip dashboard, split policies, RPC privileges).
* `scripts/test-role-middleware.mjs` updated for the `getClaims` gate; still passes deep-link,
  spoofed-tenant-header and refreshed-cookie assertions.
* Live database verification with simulated JWTs:
  * demo owner sees 12 questions / 2 quizzes in its own org and **0** questions in another org;
  * 46 question options, 12 quiz questions, 1 exam, 6 candidates remain visible to that owner;
  * a non-member calling `workspace_overview` is rejected (`42501`);
  * all three indexes, three functions and zero legacy `*_write` policies confirmed present.
* Exam/competition data was not modified; no active attempts or timers were touched.

Not run: authenticated browser interaction on desktop/tablet/mobile and throttled networks. The
sandbox has no Playwright browser and no production credentials, so those flows were not claimed.

---

## E. Deployment

* Repository: `fideliashadyy17-gif/EVALORA`
* Branch: `arena/ddb0af0a-evalora`
* Migration: `20261118090000_performance_rls_and_workspace_overview` — applied and registered.
* Production project: Vercel `evalora` → https://evalora-six.vercel.app
* Live verification: homepage renders; `/dashboard` unauthenticated still redirects to `/login`
  through the new `getClaims` gate.

---

## F. Remaining issues / follow-ups

* **Authenticated field measurement is still required** for p50/p95 INP/LCP on real devices. The
  sandbox cannot log in or reach Vercel over TLS, so the only defensible live checks are the
  unauthenticated route and the database/build measurements above.
* The dashboard layout still awaits `getUser()` before rendering the chrome on a **cold full page
  load**. Client-side module switches keep the chrome; first paint of `/dashboard` from a fresh
  document can still show a blank frame. Streaming the chrome would require moving auth into a
  Suspense boundary and is a larger structural change.
* Server-action submit buttons (90 forms) still have no per-form pending state. Adding
  `useFormStatus` per form is deliberate follow-up work; wrapping every `Button` in a client
  component would grow the client bundle.
* `admin/classes` and `admin/payments` still assemble pages from multiple service-role queries; the
  worst N+1s are removed, but a single admin-overview RPC would remove the remaining waves.
