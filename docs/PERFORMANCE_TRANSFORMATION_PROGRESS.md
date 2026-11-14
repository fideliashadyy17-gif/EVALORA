# EVALORA performance transformation — implementation checkpoint

Date: 2026-11-13. This is an incremental checkpoint, **not completion of the requested platform-wide transformation**.

## Verified baseline

- Installed the existing lockfile with `npm ci` (no dependency upgrades).
- Original test baseline: 118 passing suites, 1,564 checks; seven browser/server suites skipped by the existing runner.
- Original production build succeeded. First-load JS: examination runner 699 kB, live player 507 kB, shared JS 137 kB (Next build output, not network-transfer or Web Vital measurements).
- Existing design-token checker passes all 30 checked pairs. This is not a complete rendered-page accessibility audit.
- Supabase project is in Paris (`eu-west-3`); previously inspected Vercel function configuration was `iad1`. Latency benefit of region alignment is a hypothesis until deployed and measured.
- Sequential scan counts are cumulative workload observations, not proof that every scan is costly: tables are currently small and PostgreSQL can correctly prefer sequential scans.
- Current auth implementation already parallelizes profile/membership reads and has request-local session deduplication. Middleware and page authentication still both verify the user; that has intentionally not been weakened.

## Implemented in this checkpoint

1. Applied and verified ten additive indexes via connected Supabase migration API: examination organization/date, quiz reference, attempt examination/date, quiz organization/update, session organization/date and host, notification user/date and unread user, answer question, enrollment organization/status/class.
2. Migration has two-second lock and 30-second statement timeouts. No data mutation, RLS change, auth/session invalidation, or deadline change. `create_migration` returned version null; presence of all ten index names was independently checked with `pg_indexes`. Local timestamp is the repository filename, not a claimed remote history version.
3. Configured Vercel `regions: ["cdg1"]` for the next deployment; preserved the examination sweep cron.
4. Removed disabled prefetch from primary organization sidebar links; Next defaults provide route-aware prefetching. Added actual Next link pending feedback and active-page accessibility state.
5. Added dashboard/admin streaming loading boundaries. They reflect real server pending work and do not declare success or use artificial delays.
6. Shared explicitly submitted Buttons show actual React form pending state, prevent duplicate submission, and never claim success before completion. Non-submit controls stay usable. Shared buttons have a 44px minimum height.
7. Question bank uses bounded 30-row server pagination, stable ID tie-break ordering, exact filtered count, accessible search, and filter-preserving previous/next links. Category read runs in parallel; removed the unused class-list fetch.
8. Team invitations/entitlements/member reads run concurrently. Rubric and criterion reads run concurrently. Authenticated attempt exam/candidate reads run concurrently after token validation.
9. Notifications refresh at mount, window focus, and a visibility-aware minute interval instead of on every route change. Opening/read actions still force fresh reads. Badge updates from unrelated server events may take up to a minute while the panel is closed.
10. Added persistent desktop organization/page/profile header. Existing sidebar, mobile behavior, role filters, tenant selectors and modules remain.
11. Examination navigator has 44px targets, explicit current/confirmed/review accessible states, a legend and native server-confirmed progress. Local queue entries are not presented as saved. Exam timers, durable queues, submission, LiveKit and messaging logic are untouched.
12. Added behavioral regression coverage for pagination and form pending semantics.

## Validation

- Updated full non-browser suite: 119 suites passed, 0 failed; 1,580 individual checks, 7 skipped. Notification refresh scheduling was subsequently changed; its targeted 55-check suite passed again.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed after all implementation changes.
- `npm run lint`: zero errors, 34 warnings (existing unused imports and similar warnings; not all removed).
- `git diff --check`: passed.
- Current build examination first-load JS remains 699 kB; shared JS remains 137 kB. **No bundle reduction claimed.**
- `npm ci` audit reported 43 moderate and one high vulnerability; dependency remediation remains to be investigated rather than applying breaking automatic upgrades.

## Outstanding acceptance criteria

- Comprehensive redesign and search/filter/sort/pagination across all dashboard modules (only question-bank pagination and shell work are implemented here).
- Full examination/math workspace redesign and response-tool/proctoring code splitting; isolate high-frequency timer renders without changing server-authoritative expiry and pause rules.
- Remaining server/API waterfalls and safe removal of the large student duplicate-check payload.
- Authenticated browser/device testing, browser suites, full rendered contrast/focus audit.
- Actual before/after TTFB, LCP, INP, CLS and warm-navigation timings. No authenticated production timings or sub-100ms/200ms compliance claims have been made.
- Deployment verification of function region and production route behavior, followed by the requested final 13-point report. This checkpoint is not that final report.

## Rollback

Revert the application/configuration commit and redeploy to restore previous UI/query behavior. The new indexes are backward compatible and can remain; do not roll back by resetting data or touching attempts. If removal is ever necessary, schedule index-only maintenance separately. No production data cleanup is part of this work.


## Continuation: roster pagination and response-tool chunks

- Student roster now loads 30 rows per page with a filtered exact count and stable name/ID ordering. An enrollment inner join applies class/active-enrollment filters before pagination; unfiltered lists retain unenrolled students. The visible enrollment comes from the joined response, removing the separate enrollment request.
- Roster, import duplicate identities and import batch history run concurrently after lookup data loads. Read-only users no longer receive the import identity payload or batch-history query. Editors still receive the original duplicate-detection payload: removing that safely remains outstanding.
- Search input strips PostgREST filter delimiters, and query errors explicitly report failure rather than showing a misleading empty state.
- Eight response editor components use named dynamic imports. Construction/document state remains in the parent, preserving existing save/unmount-flush behavior. Component tests explicitly resolve tool doubles synchronously; they do not verify browser chunk loading.
- Current production build succeeds: examination first-load JS **543 kB vs 699 kB baseline** (156 kB / ~22% lower); live player **352 kB vs 507 kB baseline** (155 kB / ~31% lower). These are rounded Next build estimates, not transferred-byte, navigation-time or Web Vital measurements. A constructed-response question will still load its required tool chunk.
- Full existing suite passed again: 119 suites / 1,580 checks, seven skipped. Added a separately passing 13-check roster pagination regression suite afterward (mocked server page/DB). Typecheck passed. Lint: zero errors, 34 warnings. Token contrast checker passed again.
- Attempted the Chromium exam smoke suite with temporary npm-only browser dependencies (no package/lockfile edits). Chromium could not launch because the environment lacks `libnspr4.so`; browser test is **blocked**, not passed. The isolated mock preview was stopped.
- GitHub reports the prior checkpoint's Vercel status as successful. This does not establish production promotion or authenticated production verification. Broader dashboard redesign, timer render isolation, browser coverage and measured end-user timings remain outstanding.

## Continuation: assessment collections and isolated examination clock

### Implemented

- Examination and quiz indexes now use a shared URL-backed collection toolbar: title search, validated status filtering, most-recent/oldest/title sorting, filter-preserving previous/next links, filtered exact totals, explicit error feedback, and 18-record server pages with stable ID ordering.
- Quiz cards request embedded question/session counts rather than downloading every related ID. Examination cards request candidate counts and a filtered submitted-attempt count instead of downloading all candidate/attempt IDs and statuses. These reads retain organization filters and session RLS; no policies or actions changed.
- Existing examination open/close/resume actions and quiz publish/duplicate/delete/live-session actions remain. Their submit controls now show real pending action state and have 44px minimum touch targets. Session pacing selection now has an accessible name.
- Extracted `ExamCountdown` into a small client leaf. Its 500ms presentation clock no longer updates state in the large examination client. Server deadline polling still runs every 500ms with the existing in-flight guard, pending-save-aware `load()`, and exponential retry backoff; it no longer causes periodic parent renders.
- Countdown pause/resume keeps the local frozen display and resynchronizes against server deadline/clock offset on resume. The display cannot submit, credit time, or mutate an attempt. Live competition timer/render isolation remains outstanding because its tick also drives audio and answer-lock presentation.

### Validation

- `npm test`: **122 suites passed, 0 failed, 7 skipped; 1,633 individual checks**. Includes new controlled-clock React coverage and mocked server-page query/aggregate coverage. Existing draft/video test harnesses now stub the extracted clock; independent clock tests exercise the real component.
- New clock tests verify parent render isolation, pause/resume, server offset, focus catch-up, invalid/expired deadline presentation and cleanup. Existing connection pause, save queue, draft guard, grading and submission tests remain passing.
- `npx tsc --noEmit` and production build passed. Lint: zero errors, 34 warnings. All checked token contrast pairs pass; not a full rendered accessibility certification.
- Current Next build reports examination first-load JS **548 kB** (previous checkpoint 543 kB, original baseline 699 kB). Do not claim a new bundle reduction in this step. The clock work reduces periodic rendering, not payload size. Browser INP, navigation latency and Web Vitals remain unmeasured.
- Previous checkpoint `ef0e5ed` was explicitly deployed to production: Vercel deployment `dpl_EUNZYAcQgw6RmthTon9EeJAmoAdi` was READY/PROMOTED, served `evalora-six.vercel.app`, and reported region `cdg1`. Public login and examination entry loaded; unauthenticated student dashboard redirected to login. This describes the prior deployment, not proof that this continuation is live.
- No database migration or production exam action was executed in this continuation. The broad platform redesign and authenticated browser/device validation remain incomplete.


## Release continuation — 2026-11-13

This section supersedes older blockers above; it is not a claim that every original acceptance criterion is finished.

1. **Navigation:** shared persistent dashboard, loading boundaries, pending submit feedback and restored ordinary admin-link prefetch. Added collapsible navigation groups, skip link and bounded mobile menu.
2. **Lists:** URL-backed search/status/sort/stable server pagination now covers examinations, quizzes, rubrics, competitions, notifications and reports. Existing roster and question-bank pagination retained. These controls are not yet universal across every other module.
3. **Query work:** overview entitlement loads alongside dashboard queries; exam answers, optional published hints and optional usage load concurrently. Reports fetch only the selected family, with aggregate participant/attempt counts; rubrics use criterion counts.
4. **Student import:** ordinary roster visits no longer preload up to 20,000 identities. An explicit preview fetch uses active-session tenant authorization, no-store, 1,000-row ranges and a fail-closed 20,000 identity ceiling. Admin pre-supplied identity contract remains. Import preview and import fail visibly if checks cannot load.
5. **Truthful feedback:** settings/notification write failures are shown; unavailable overview counts are not reported as zero, and failed entitlement reads do not invent an active plan.
6. **Assessment performance:** isolated presentation countdown and eight lazy response editor chunks from earlier checkpoints retained; live-player 250ms state tick has not been rewritten.
7. **Math accessibility:** related ARIA tab/panel IDs, roving tab focus and Arrow/Home/End selection for all eight response workspace tabs; written reasoning survives graph-tab changes in real Chromium.
8. **Safety:** no attempt reset, timer mutation, forced submission/logout, queue clearing, answer-data migration or RLS change in this continuation. Earlier ten additive indexes remain. Browser checks intercept API calls, not production examinations.
9. **Regression validation:** `BASE=http://127.0.0.1:3101 SERVER_HAS_SECRET=0 LD_LIBRARY_PATH=/tmp/lib npm test -- --all` passed 130 suites, 0 failures, 0 skips and 1,670 counted checks. Subsequently added real response-tool browser smoke passed seven checks separately. Browser fixtures now model current retake APIs, synchronized live mode and public-screen presentation fields. Lockdown passes all A–K scenarios, 52 browser assertions, zero unexpected API calls.
10. **Build/accessibility:** production build and TypeScript passed; lint zero errors, 34 warnings; token contrast checks pass WCAG AA. Real written/graph tool chunks, keyboard tab activation, confirmed save and no horizontal page overflow at 390/768/1366px passed. This is not comprehensive manual WCAG or all-tool/device certification.
11. **Measured payload:** latest Next build first-load estimates: examination 548kB vs original 699kB (~22% lower); play 353kB vs original 507kB (~30% lower). Required tool chunks still download on demand. No authenticated production TTFB/LCP/INP/CLS or warm-navigation timing claim is made.
12. **Deployment:** release is intended for explicit Vercel production deployment from the exact pushed SHA. Deployment identity and post-deploy smoke verification will be recorded separately after readiness is confirmed. Local mocked build variables are not committed and are not passed to Vercel; Vercel uses existing production settings.
13. **Remaining scope:** comprehensive module-specific redesign/controls for classes, academics, teachers, team, accounts, proctoring, platform and billing; authenticated real-tenant device/performance coverage; live-player clock isolation; full rendered accessibility audit; dependency vulnerability triage (previous npm audit 43 moderate/1 high). Shared shell/styles benefit existing modules but do not establish completion of these criteria. Rollback is an application redeploy, never a data reset.
