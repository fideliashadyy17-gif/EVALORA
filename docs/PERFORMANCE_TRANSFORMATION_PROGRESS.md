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
