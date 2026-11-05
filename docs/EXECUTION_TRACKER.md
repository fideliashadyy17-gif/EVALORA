# EVALORA execution tracker

Updated 2026-11-05. This is an evidence ledger, not a completion claim.

## Source and baseline

The original master prompt is not present in the checked-out files or this conversation's retained context. The current instruction and `PHASE_0_ASSESSMENT_PLATFORM_AUDIT.md`, `IMPLEMENTATION_PHASE_STATUS.md`, `ADDITIONAL_REQUIREMENTS.md`, and `RELEASE_READINESS_2026-11-05.md` are the available requirement sources. The checklist below covers the phases and modules explicitly retained there; it cannot certify that no detail from the missing original prompt has been omitted. Preserve earlier work and reconcile additional original requirements if recovered.

On recovery, `arena/b5f2778e-evalora` was clean at `cc9e64ea2ae047aac27922a487ac18d3e210bb44`, matching origin and open PR #2. Production Vercel project `evalora` was READY/PROMOTED for that commit (`dpl_7EzGmEvDBUtxMr65WVicPJAAyb6J`), serving the requested admin hostname. Vercel's configured production branch is `main`; the established workflow explicitly creates production deployments from the pushed session branch. Preview and production share the production database, so previews are not isolated staging.

Supabase EVALORA `nqxqisjtbfsratgztmch` is healthy. Its migration history records the equivalent of 0001–0027 (some earlier migrations were applied in parts or supplemental corrections). 0023–0027 are applied as documented in `RELEASE_READINESS_2026-11-05.md`. Another active Supabase project is Oak, not EVALORA staging. Supabase branching was previously rejected because the current plan does not include it. No project or production record was reset.

## Phase and capability checklist

Statuses apply to the requirement as a whole, not to every underlying increment. No phase is claimed completed and verified in production without end-to-end evidence.

| Requirement | Status | Evidence / remaining acceptance |
|---|---|---|
| Phase 0: audit and inventory | PARTIALLY IMPLEMENTED | Initial documented inventory and production checks; update for current state and perform full security/RLS/storage assessment. Original master prompt unavailable in retained materials. |
| Phase 1: assessment studio and question bank | PARTIALLY IMPLEMENTED | Existing authoring, question types, exams, queue and tenant controls. Complete atomic answer/submission, deadline and cross-tab handling, question-history immutability, comprehensive author-to-result verification. |
| Phase 2: grading studio | PARTIALLY IMPLEMENTED | Existing objective and manual grading; writes are non-atomic. Rubrics, moderation, history, blind grading and real end-to-end tests remain. |
| Phase 3: AI Studio | NOT STARTED | Existing template generation is not a genuine LLM workflow. Provider integration, privacy/consent, review and safety checks remain. Actual provider operation depends on provider access and terms. |
| Phase 4: secure examination and online proctoring | PARTIALLY IMPLEMENTED | Deadlines, candidate and LiveKit room code exist. Real LiveKit acceptance, consent, permissions, privacy/retention, incidents and identity guarantees remain. Native OS lockdown feasibility not established. |
| Phase 5: paper mode | NOT STARTED | Printing, scanning, mapping, human review and result integration are not a complete workflow. |
| Phase 6: analytics and reporting | PARTIALLY IMPLEMENTED | Existing CSV/reports; assessment accuracy, permission and longitudinal analytics tests, PDF/Excel coverage remain. |
| Institutional management | PARTIALLY IMPLEMENTED | Organizations/classes/rosters and institutional plan exist. Role matrix, shared resources, tenant and plan tests remain. |
| Integrations | NOT STARTED | No verified Classroom, Microsoft 365, Canvas, SIS, SSO, API or webhook integrations. Real provider verification depends on provider credentials and agreements. |
| Super Admin console | PARTIALLY IMPLEMENTED | Existing global console and owner entitlement bypass; authenticated browser and all write/feature paths remain unverified. |
| Subscription and entitlement management | PARTIALLY IMPLEMENTED | Free/Premium/Institution plans and Super Admin bypass exist; comprehensive backend quota enforcement and plan/role matrix testing remain. |
| Production baseline deployment | COMPLETED AND VERIFIED IN PRODUCTION | Deployment above READY/PROMOTED; public homepage and unauthenticated admin redirect checked. This does not verify authenticated features. |
| Isolated Supabase branching | BLOCKED BY A GENUINE EXTERNAL DEPENDENCY | Pro plan entitlement denied. Isolated fixtures and rollback-only synthetic checks remain available alternatives, not equivalent to staging. |
| Oak competition elimination-count publication | BLOCKED BY A GENUINE EXTERNAL DEPENDENCY | Owner explicitly deferred the elimination count; do not publish new configuration without confirmation. |

## Increment: student imports and spreadsheet-safe reporting

- Replaced the unmaintained npm `xlsx@0.18.5` package with the pinned third-party `@e965/xlsx@0.20.3` SheetJS repackaging, including both server import and browser template generation. This version is above the affected ranges for the reported prototype-pollution and ReDoS advisories. It is third-party packaging, not an official SheetJS registry distribution; dependency provenance and future security advisories still require monitoring. This does not guarantee safe processing of malicious files or address compressed-file expansion/resource exhaustion. Existing XLS/XLSX/CSV workflows remain supported.
- Shared CSV report/export encoding prefixes spreadsheet-formula-like *text* with an apostrophe, quotes carriage returns, and retains numeric cells. Applied to the student template and import report as well as shared admin/customer `toCsv` exports. The apostrophe is intentionally present in raw CSV, including phone-like text beginning with `+`; users importing raw CSV should account for that. Spreadsheet-specific interpretation can vary; this is risk reduction, not a proof against every spreadsheet implementation.
- No migration: changes only affect file parsing and generated CSV, not persisted schema or records. Reviewed production schema and migration history above.
- Real parser tests generate/read XLS and XLSX, check multiple sheets, leading-zero text, output bounds and CSV escaping; extraction authorization tests use mocked session/parser boundaries. See command results and release entry below.

## Release milestones

- Baseline: commit `cc9e64ea2ae047aac27922a487ac18d3e210bb44`, deployment `dpl_7EzGmEvDBUtxMr65WVicPJAAyb6J` READY/PROMOTED; homepage and anonymous admin login redirect checked.

## Increment: question editor failure handling

- `src/app/dashboard/questions/actions.ts` no longer ignores a failed deletion of old options. It returns an explicit partial-update error before attempting to insert replacements; the details update has already happened. `scripts/test-question-metadata-permissions.mjs` exercises this failure with a mocked database.
- This is not atomic option editing or historical-question protection; both remain open above. No migration is required for this error-handling-only change.

## Increment verification before release

- Real XLS/XLSX and CSV safety tests: 5/5; CSV delimiter tests: 8/8. School systems: 31/31 (PDF fixture was present on this machine); student extraction authorization: 12/12 mocked. Question metadata/action checks: 7/7 mocked, including option-delete failure.
- Additional requirements 53/53, exam save handler 11/11, save queue 7/7, workspace marking 13/13; these use static, mock or pure boundaries as indicated by each script, not real authenticated end-to-end execution. TypeScript and production build passed; lint had 0 errors and 16 existing warnings.
- `npm audit --omit=dev` after parser replacement reports 38 vulnerabilities, including one high associated with Next's transitive PostCSS. No automatic major framework upgrade was applied. No high advisory for `xlsx@0.18.5` remains because that package was removed; this does not prove the replacement free of vulnerabilities.
- Import/report/question-editor increment: application commit `4fb87a5c93a205970dcf2691c1c0bf3841715c7e` pushed to `arena/b5f2778e-evalora` and confirmed as PR #2 head. Automatic Vercel build detected the commit as preview `dpl_EWvBiiSaocZWGwtCWf8kNcnem75T`; since production branch is `main`, the established explicit production workflow created `dpl_4gFmWDW9CFovBu3haRav21J4gmav`. Vercel reported READY/PROMOTED and both production domain aliases assigned. Cache-busted requests to the requested hostname served the public homepage and DEMO portal and redirected anonymous `/admin` to EVALORA sign-in. The changed authenticated import, report download and question-edit workflows were tested locally, not in an authenticated production browser; their production behavior is therefore not fully verified. No migration was created or applied for this increment.
