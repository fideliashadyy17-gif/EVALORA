# EVALORA — Phase 0 assessment platform audit

**Date:** 5 November 2026 (Africa/Lagos)
**Scope:** Read-only repository, GitHub, Supabase, Vercel and public benchmark inspection. This report is an audit, not a security certification or a claim of production acceptance. No production code, configuration, data, migrations or deployments were changed in this audit.

> **Follow-up:** the session branch was subsequently fast-forwarded locally to production commit `518c44e` and earlier work was restored for review. The findings below record the state at audit time; see `PHASE_1_RECONCILIATION.md` for the current working-tree state. This is a historical snapshot; subsequent applied database changes and scoped checks are recorded in `RELEASE_READINESS_2026-11-05.md`.

## 1. Executive findings

1. EVALORA has a substantial reusable Next.js/Supabase foundation: organizations, roles, question and quiz models, exams and attempts, automatic and manual marking, LiveKit, tenant administration, and rich mathematics. These are implementations to extend, not replace.
2. **Production is not the current checkout.** Vercel reports production deployment `dpl_8s8pF9K485z11sh4kseHnUuGzvDE` READY/PROMOTED, built from commit `518c44ed292179c444f93c6f390294c35d400a28`. The current session branch is `arena/b5f2778e-evalora`, HEAD `5d85daa`, and PR #2 is open. Production is six commits ahead of HEAD, with 64 changed files. `main` remains at `055347b`. The checkout also has uncommitted/untracked work from the earlier class-bank implementation. The local changes and production differ in at least five overlapping paths. **Deploying this checkout as-is could remove production functionality.**
3. The live database has **25 migration-history entries**, including the class/question/event migration and later pool, qualification, exam-link, institutional-entitlement and RLS migrations. Production source contains migrations 0012–0022; 0011 was applied to the database but is currently untracked in this checkout and is absent from the production Git tree. Migration history needs reconciliation before any replay or staging bootstrap.
4. The newer production source contains question-pool assembly, qualification/admission machinery, shared exam-link access and an institutional entitlement implementation not present in the committed HEAD of this checkout. The local, uncommitted event implementation is a *different* partial implementation. Review their semantics and preserve the deployed implementation before integrating either; do not infer absence from the older working tree.
5. Exam answers use server checks and persisted autosave, but the production candidate client has no durable offline queue or retry/conflict protocol and can display “all changes autosaved” after a failed request. Shared-link guests use a browser-provided key; a new browser/key may allow another candidate identity, so strong per-person attempt limits are not established. The shared-link access route inspected does not implement a visible rate limit. These require staging verification and remediation before high-stakes claims.
6. The actual `question-media` and `org-logos` storage buckets are public. Current storage `INSERT` policies allow authenticated users to insert into those buckets without an organization-path check. Public question assets should not be assumed confidential; cross-tenant upload and abuse resistance require review. Private buckets exist for payment proofs and student imports.
7. There is no evidence in the inspected application source of a production LLM-backed AI Studio. The local generator is seeded, parameterized mathematics templates; its legacy `ai_generated` value does **not** prove AI generation. PDF/OCR code is for student import, not PDF-to-assessment or paper grading. Do not promise these workflows as existing AI features.
8. Automated checks and previous SQL simulations provide useful evidence but do **not** establish full authenticated candidate, teacher, proctor or billing workflows; load, accessibility and hostile-tenant testing are also incomplete. No production deployment is authorized by this audit.

## 2. Evidence and boundaries

### GitHub and deployment

- Repository: `fideliashadyy17-gif/EVALORA`; PR #2 remains open from the fixed session branch. GitHub compare confirms production commit descends from `5d85daa` and is six commits ahead. Production Git metadata identifies a different branch; this audit inspected its immutable commit with `git show` without switching the session branch.
- Current working tree contains earlier changes to class/question/event administration and `0011_class_question_bank_events.sql`, plus a staged deletion of the generated seed bundle. They must not be silently discarded or deployed as a substitute for the newer source.
- Vercel deployment metadata reports production `READY` and `PROMOTED`, linked to `https://evalora-six.vercel.app`; a READY deployment does not establish authenticated functional correctness. The project has Supabase and LiveKit configuration names; secret values were not decrypted or recorded. Realtime health returned `healthy: true` but also `db_connected: false` and `replication_connected: false`; determine whether those detail fields reflect actual degradation using a real staging subscription, rather than assuming either failure or health.
- The live database project `nqxqisjtbfsratgztmch` reports Auth, DB, REST and Storage healthy. No Edge Functions are currently listed. All 50 public tables returned by the inventory report RLS enabled, but enabled RLS is not proof that every policy correctly isolates all tenants or operations.
- Current read-only Oak counts: 14 classes, 1,064 questions, one event, zero rows in the newer `question_pools` table. Existing assembled phase quizzes must not be confused with rows in the new pool table. The newer operations guide uses the official **Oak International School Mental Math Competition** identity. Validate event status, question count and configuration with the owner before any changes; the production guide records an unresolved elimination-count decision.

### Public reference

The publicly documented [AssessPrep plans](https://www.assessprep.com/book-a-demo/plans) distinguish question authoring, interactive question types, math, monitoring, anonymized marking, analytics and an AI tier with PDF import, AI grading, writing and Paper Mode. Its [delivery page](https://www.assessprep.com/features/deliver) describes browser security, native lockdown and paper delivery, while its [Paper Mode page](https://www.assessprep.com/features/papermode) describes print, bulk scan, mapping and teacher-overridable AI marking. These are vendor claims and functional benchmarks, not independently verified performance metrics or assets to copy.

### Status vocabulary

- **Implemented, evidence limited:** code/schema exists and specific checks were observed; no complete acceptance claim.
- **Partial:** some relevant routes, data or workflows exist, but required capabilities or assurance are missing.
- **Not found:** no implementation was identified in the inspected tree/dependencies; targeted discovery should precede new construction.
- **External dependency:** feature depends on a provider, contracts or infrastructure not established by this audit.

## 3. Architecture and data inventory

| Layer | Current evidence | Reuse / gap |
|---|---|---|
| Application | Next.js 15.5, React 19, TypeScript, Tailwind; server actions and route handlers under `src/app` | Preserve existing routes and responsive design; add tested feature modules. |
| Identity and tenants | Supabase Auth, `profiles`, `organizations`, `organization_members`, invitations, `src/lib/auth.ts`, tenant host selection; `is_super_admin`/`org_role` policies | Maintain verified-user and active-membership checks; test each role and tenant, including administrative workspace selection. |
| Academics | Years, levels, departments, subjects, classes, students, enrollments; import batch/migration tables | Extend existing model; a campus level and required granular institutional roles were not found in the inspected model. |
| Assessment | `questions`, options, categories, quizzes, quiz questions, sessions, participant answers; `exams`, candidates, attempts, exam answers | Reuse exam and quiz models. Question revisions/snapshots, rubric structures and consistent question-type contracts require design and verification. |
| Competition | Events, phases, phase-class links, qualification records and newer pool/usage/override tables | Production has newer RPCs and admission checks; reconcile them with local pending changes before work. |
| Commerce | `plans`, `subscriptions`, `payment_requests`, limits overrides and server entitlement resolution | Live DB has Free, Premium and Institution plans. Production source adds a capability resolver and owner/customer separation. Verify all routes and APIs enforce them; do not introduce a second subscription system. |
| Media | Public `question-media` and `org-logos`; private `payment-proofs` and `student-imports` | Protect assessments and future candidate submissions with private storage, authorization, size/MIME policy, retention and audited download. |
| Live and proctoring | LiveKit server-issued tokens, candidate and supervisor interfaces; proctoring rooms/incidents/recordings tables | Verify real connection recovery, consent and permissions; recording table is not evidence of a working recording pipeline. |
| Observability | Audit logs and some event/monitoring views | Add scoped operational metrics, redacted logs, alerting, migration/backup rehearsal and capacity baselines. |

## 4. Functional capability matrix

| Area | Status | Evidence and remaining acceptance work |
|---|---|---|
| Assessment authoring | Partial | Quiz/exam creation and reuse exist in dashboard/admin, with save, preview and publish paths. Collaboration, assessment-level versioning, full class/subject organization and detailed marking schemes need end-to-end verification or development. |
| Question types | Partial | `src/lib/brand.ts`, `QuestionForm`, `QuestionRunner`, `src/lib/scoring.ts` list single-choice, multi-select, true/false, short answer, numeric, ordering, matching, open-ended, poll and slide. Not all requested response types or delivery/marking combinations are supported. Treat each type as complete only after author → candidate → grading tests. |
| Mathematics and media | Partial | Tiptap, MathLive, KaTeX, math keyboard and rich-content rendering exist. Images and tables exist. Audio/video responses, graphs, annotation, cropping, accessibility and cross-device reliability require investigation and tests. |
| Question bank | Partial | Categories, question options, publish/edit and production question pools exist; DB contains class/curriculum/review metadata. The local branch adds metadata editing and generation pages but is uncommitted. Learning objectives, criteria, markschemes, shared collection scopes and full filter coverage are not established. Public question-media is not a confidential content store. |
| Template generation | Partial / local | `src/lib/questionGeneration.ts` creates seeded math templates and calculated answer keys. It is not an LLM. The previous seed has automated checks, not individual teacher review; source/curriculum alignment must be verified by teachers. |
| AI Studio | Not found / external dependency | No verified provider integration for generation, markschemes, AI grading, writing/translation, quotas or costs was found. Vendor choice, consent, security/privacy, abuse limits and evaluation data are prerequisites. |
| PDF to assessment | Not found; related reusable extraction | `src/lib/extractServer.ts` and the student-import wizard extract tabular CSV/XLS/PDF text and support OCR in that context. No complete question/answer/image extraction and approval workflow was established. |
| Examination access | Partial, newer production source | Production has `/api/exam/link-access` and `/exam/join/[token]`, mandatory first/last names, access code, class checks and verified-student mode. Legacy exam/candidate codes remain. The newer implementation requires an eligible class and needs authenticated, negative and guest-reentry tests. Guest keys are browser-provided and are not strong identity. |
| Exam runtime | Partial | Server calculates deadlines and verifies attempt token, status and membership of question in paper; save/submit/state paths and result-publishing behavior exist. Failed autosave/offline behavior, write ordering, concurrent submission and automatic expiry without a client request need robust testing and design. The inspected save handler accepts a client-supplied `quiz_question_id` after checking the separate `question_id`; consistency must be verified server-side. |
| Proctoring/security | Partial | LiveKit tokens and candidate/supervisor rooms exist, and incidents can be recorded. No comprehensive browser security event pipeline or native lockdown was identified. Verify no misleading “connected” indications and review camera/mic/screen permission, retention and consent. |
| Grading | Partial | `src/lib/scoring.ts` supports objective scoring and manual answers; exam/admin marking routes exist. Rubric configuration, blind marking, moderation, annotation, grade history and AI suggestions vs final teacher marks need development or full verification. |
| Paper mode | Not found | No complete print-personalize → scan → page/candidate/question mapping → human confirmation → marking → result sync workflow was identified. OCR dependency alone is insufficient. |
| Analytics and reports | Partial | Exam/session reports and CSV/export tools exist. Longitudinal student/class/criterion/organizational analytics, PDF/Excel exports and authorization need assessment-specific tests. Avoid assuming UI labels prove correct metrics. |
| Institutional management | Partial | Organization, departments, classes and rosters exist. Fine-grained director/principal/coordinator/department-head permissions, campuses, shared collections and policy matrix require design and tests. |
| Subscriptions and owner | Partial / production implementation | The production commit introduces `getEntitlementFor`, capability resolution and broader owner RLS; live plans contain `institutional` flags and quota metadata. A code or plan row alone does not establish unrestricted operation across every backend or ordinary-user isolation. Run role/plan/API/RLS tests; verify global feature flags and storage behavior. |
| External integrations | Not found / external dependency | No verified Classroom, Microsoft 365, ManageBac, Canvas, SIS, generic SSO, public integration API or reliable webhook synchronization was identified. Define provider access and contracts before advertising integration. |

## 5. Security, privacy and reliability priorities

| Priority | Finding and evidence | Action / acceptance |
|---|---|---|
| P0 | Source/deployment/schema drift: live production is six commits beyond checkout and DB has migrations absent from its Git tree. | Preserve local changes, compare deployed commit, reconcile histories/migrations on this same session branch without overwriting current work. Rehearse from an isolated database snapshot; no deployment or migration replay until reviewed. |
| P0 | Candidate save is network-dependent; production `TakeExamClient` has no persistent unsent-answer queue, does not surface failed saves reliably, and shows a generic autosaved message. | Implement durable encrypted/appropriate local pending state, explicit pending/error/synced UI, ordered idempotent writes, retry and reconnect tests, deadline and submission coordination; evaluate privacy and shared-device cleanup. |
| P0 | Shared link permits a caller-generated guest key, with uniqueness/resume anchored to that key. This cannot reliably enforce a human-level one-attempt rule across browsers. | Define honest anonymous-vs-verified identity policies; require verified identity/issued candidate credentials for high stakes; test reuse and concurrency. Do not infer that a name or device key proves identity. |
| P0 | Public media buckets and bucket-only authenticated INSERT policies permit broad uploads without tenant-path authorization. | Assess current exposure without accessing customer content; design private assessment/candidate storage and enforce role/org paths, size, MIME and retention safely; audit and test existing references before changing policies. |
| P1 | Access endpoints lack an evident rate limiter; exam codes and link tokens are distinct, but repeated guessing/abuse requires protection. Attempt tokens also appear in the state URL query string and browser local storage. | Implement shared rate limits and monitoring, review entropy and error leakage, use safe token transport, log redaction and XSS protections. Test without attacking production. |
| P1 | Save handler accepts client `quiz_question_id` separately from the verified `question_id`; autosave and submit involve multi-step writes. | Derive association on server, test cross-paper manipulation, idempotency, out-of-order saves, deadline races and atomicity in staging. Review service-role handlers as RLS bypasses. |
| P1 | Phase records and admission/approval implementations differ between local and deployed source. | Inspect newer `verify_phase_admission`, RLS, RPCs and every join/state/answer/host path; test qualified and unqualified identities and classes, revocation and concurrency. Do not replace production gates with the older local gate. |
| P1 | Existing mutable questions and scoring/marking workflows do not establish immutable assessment snapshots or grading history. | Design additive versioning and audit trail preserving past attempts and teacher-approved marks. Verify result publication and moderation. |
| P1 | Storage and proctoring affect minors and sensitive assessment content. | Define consent, processing basis, minimization, retention/deletion, regional hosting and recording policy with institution before adding AI or video retention. |
| P2 | Class admin performs per-class exact counts; many list paths use PostgREST row-limited fetches. | Use paginated/aggregated authorized queries and targeted indexes; load test in staging rather than claiming thousands of users. |
| P2 | WCAG token checks do not establish full accessibility; desktop and mobile keyboard/screen-reader flows are unverified. | Test WCAG 2.2 AA with keyboard, screen readers, zoom, focus, touch, mobile/tablet and math input; perform user testing and document exceptions. |

## 6. Test and assurance baseline

**Observed during this audit:** immutable production-source archive, using existing local dependencies, passed `test-additional-requirements.mjs` **51/51** and `test-event-operations.mjs` **45/45**. These are source/pure/static checks, not live browser or DB-backed route acceptance. Read-only DB inventories and Vercel deployment metadata were queried; no write tests or migrations were run during this audit.

**Observed in the immediately preceding local work:** local `npm run build`, `npx tsc --noEmit`, lint (0 errors, 10 warnings), class-bank suite (93), admin utilities (11), school systems (31), live interfaces (49), and rich content (143) passed. These results apply to the **local working tree**, not the newer production commit, and must be rerun after reconciliation. Prior documents report transactional SQL simulations; those historical results were not rerun in this audit. Some existing tests are static source assertions; count alone is not end-to-end coverage.

**Required before declaring Phase 1 ready:**
- Isolated staging with production-equivalent schema and data shape, no real student/proctor records, distinct secrets and no automatic production promotion.
- Authenticated role/plan matrix: super admin, owner, teacher, corrector, proctor, student, outsider and suspended user across at least two organizations; SQL/RLS and API negative tests.
- Full author → preview → publish → candidate join → autosave/offline/reconnect → submit → mark → publish result; correct timing, idempotency, per-question integrity, historical answer preservation and cross-tenant attempts.
- Shared-link and legacy credentials: wrong/expired/closed/revoked/code, first/last name, class/eligibility, duplicate guest and verified student cases; no reliance on browser-provided identity as proof.
- LiveKit real staging rooms with consent, denial/reconnect, supervisor role/tenant authorization and media/privacy checks; verify Realtime state in practice.
- Free/Premium/Institution and owner capability/quota paths via both UI and APIs; cannot grant ordinary users owner capabilities.
- Mobile/desktop accessibility tests, security regression, load and failure injection with explicit capacity results.

## 7. Dependency map and controlled roadmap

**Before Phase 1 — baseline reconciliation:** inventory the uncommitted local delta and deployed commit (`5d85daa..518c44e`); preserve both, compare overlapping files and migration 0011, port/reconcile the newer implementation and earlier fixes on the fixed session branch; inspect 0012–0022 compatibility and owner-deferred Oak decisions. Do not check out a different branch, replay already-applied migrations, or overwrite deployed behavior. Provision/validate isolated staging and a repeatable test harness.

1. **Foundation & core assessments:** harden candidate identity, rate limits, answer persistence/idempotency/deadline and submission races; private storage; question snapshot/versioning; role/capability enforcement and institution plans. Extend the question-type contract and author/runner/scorer tests; preserve rich math. Milestone: complete end-to-end workflows and negative tenant tests in staging.
2. **Grading & feedback:** add versioned marking schemes, criterion/rubric templates, grading state/history, authorized blind grading and moderation. Maintain existing manual marks. Milestone: score/review/approve/history and permissions work end to end.
3. **AI Studio:** agree provider and data-processing policy; use server-only adapter, explicit consent, quotas/rate limits/cost logs and teacher approval. Add bounded question/markscheme/PDF/writing/grading workflows with grounded sources and independent mathematical checks; distinguish suggestions from final grades.
4. **Secure exams:** monitored browser events and privacy/consent policies, existing LiveKit robustness and incident review; a native lockdown feasibility study for each OS before any promise or implementation. Coordinate with Phase 1 security fixes rather than postponing them.
5. **Paper mode:** assessment print and candidate identifiers → batch scan private storage → page/identity/answer matching with confidence → human confirmation → grading integration. Add OCR/handwriting only where quality and permissions are defensible.
6. **Analytics & integrations:** build analytics from validated assessment/grade/criterion events; authorized reporting/exports; then provider integrations using official APIs, consent, retries, idempotency, monitoring and tests. No external integration is operational merely because a UI exists.

Each increment requires an explicit scope, migration/rollback review, backend and frontend authorization, unit + integration + appropriate end-to-end tests, regression checks and a release report. Production promotion requires owner authorization and applicable safeguards; later authorization is recorded in `RELEASE_READINESS_2026-11-05.md`.

## 8. Decisions and open questions

- Confirm the official elimination question count; the newer Oak operations guide records the decision as deferred. Do not change or publish its exam configuration pending a decision.
- Decide if guest exams are low-stakes shared-code mode or require verified person-level identity and attempt limits; different guarantees need distinct configuration and messaging.
- Establish staging resources and data protection requirements for minors, recordings, AI inputs, imported files and cross-border processing.
- Decide desired institutional capabilities and commercial quotas; retain a separate authenticated platform-owner bypass.
- Confirm which LMS/SIS and AI providers have approved access, privacy terms, operational budgets and sandbox accounts.

## 9. Audit deliverable accounting

- **Files created:** this audit document only in the current request. Existing local modifications were left in place.
- **Database objects changed / migrations applied:** none in this request. Read-only metadata and counts were inspected.
- **APIs / permissions changed:** none in this request.
- **Deployments / branches / PRs changed:** none. The production commit was fetched read-only for `git show`/archive inspection; current branch was not switched. No production deployment is authorized or requested by this report.
- **Outstanding:** reconcile production and local work, then perform the staged Phase 1 work and independent verification above. This is not a claim that the entire requested platform is complete.
