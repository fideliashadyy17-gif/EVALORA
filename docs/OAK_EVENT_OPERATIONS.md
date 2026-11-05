# Oak International School Mental Math Competition — Operations Guide

**Status:** implemented and statically / transactionally tested on the working branch. Authenticated browser testing and production deployment remain blocked (see `docs/TESTING.md`).

## Official identity

The one canonical parent event is **`Oak International School Mental Math Competition`**. `MENTAL` is the correct word; legacy `Matamat` strings were corrected in existing DB records and the Oak seed scripts. The event was updated in place, not duplicated; its three existing linked phase records retain their participants, questions, results and class relationships.

Exact phase titles:

- `Oak International School Mental Math Competition — Elimination Round`
- `Oak International School Mental Math Competition — Semi-Final`
- `Oak International School Mental Math Competition — Grand Final`

The event monitor is `/admin/competitions/events`. It shows one parent event, the three phase records, all class links, pool status, qualification counts and links to the existing Examination and Live Competition records.

## Question-count decision (owner deferred)

Actual configuration: Elimination **20** questions per class, Semi-Final **24** configured / **25** phase maximum, Grand Final **30**. Master guidance contains conflicting Elimination values **20**, **25** and an earlier **5 per class**. The owner decision on 2026-11-05 was: **keep existing 20 but do not create or publish a new examination configuration**. The authoritative count remains unresolved and is recorded in the event settings as `elimination_question_count_status=pending_owner_confirmation`. Elimination pool publishing is blocked until the owner confirms the count. No published examination or question count was changed.

## Generic question-pool assembly

Open `/admin/competitions/pools`. Filters cover organization, parent event, phase, class, subject, curriculum, topic / subtopic, difficulty, question type, creation method, approval status and previous usage. The page shows eligible approved count, selected count, curriculum distribution, shortfall and a review/approve workflow when approved questions are insufficient.

Workflow:

1. Select organization → parent event → phase → class → curriculum / filters.
2. Create a draft pool. It uses the phase maximum as its default target and derives a curriculum quota from the event's `curriculum_split` or the selected curriculum.
3. Use **Auto-generate** to fill from approved/published questions only, or tick questions and **Save selected questions**.
4. **Preview**, **Shuffle**, **Replace** and **Save filters** operate on drafts only.
5. Reopen a published pool as a draft to edit it. Publishing requires a complete, valid, single-class, curriculum-valid, approved-only pool and owner confirmation for Elimination.
6. If a shortfall appears, use **Generate in Question Bank** and **Review & approve**, then regenerate the draft pool. Unapproved questions are never silently added and the target count is never silently reduced.

Database guards enforce the same rules for direct REST/SQL writes: `question_pool_item_guard`, `question_pool_publish_guard`, `set_question_pool_items`, `question_pool_validate`, `generate_question_pool_items`, `replace_question_pool_item`, `shuffle_question_pool_items`, `track_question_pool_usage` and the `question_usage` ledger.

## Qualification and admission

Open `/admin/competitions/qualifications`.

1. Choose the parent event and target phase.
2. **Calculate & create records** reads existing Examination / Live Competition results, ranks within each class, applies the phase's `top_n` / `min_percent` rule and creates traceable `qualification_records`. It never changes answers, scores or attempts.
3. Organizers review eligible records and **Approve**. The one-time admission token is shown only in the secure flash message; the DB stores only its SHA-256 hash.
4. Authorized manual overrides require a documented reason. `qualification_overrides` records administrator, candidate, original/new status, reason, timestamp, event and phase.

Admission is enforced on the server in `/api/live/join`, `/api/live/state` and `/api/live/answer`. `verify_phase_admission` checks identity, organization, parent event, class, target phase, qualification record, approval status and competition/session availability. `verify_participant_phase_admission` re-checks state and answer requests using either the stored admission-token hash or a reliably verified `students.user_id`. Hidden buttons, localStorage, display-name spoofing, URL/session-ID manipulation and anon Realtime subscriptions do not bypass the gate. Organizer-only RLS protects qualification records, overrides, pools and usage.

Candidates joining a Semi-Final or Grand Final enter their one-time qualification token on `/play/{code}`.

## Shareable examination link + access code

Open `/admin/examinations/invitations` (also linked from the org exam detail page). Each existing examination has:

- one general shareable link `/exam/join/{invite_token}` (not personalized);
- one configurable exam access code, validated server-side against `exams.access_code_hash`;
- copy-link and copy-code controls, link-expiry and enabled/disabled settings, and regenerate-link / regenerate-code actions.

Candidate flow: open the link → enter access code → enter **mandatory first name** and **last name** → choose an eligible class (or use their verified registered class) → consent → start/resume the single attempt. No EVALORA account is required. A verified signed-in student may be associated with the attempt only through `students.user_id`; duplicated names never merge a guest candidate into a student record.

`POST /api/exam/link-access` validates the link token, code hash, exam status/window, class eligibility and organization, guest-key conflicts, duplicate attempts and re-entry. The invitation controls expose the existing single-attempt policy: `single_resume` (default) resumes only an in-progress attempt and blocks a submitted one; `read_only_reentry` permits a token-bearing candidate to return to a submitted, read-only result view without creating another attempt. The legacy two-code `/api/exam/access` route applies the same policy. Save/submit/state gates remain server-authoritative. Class options are scoped to the exam's own class, direct phase-class links and unassigned links for the same stage; Semi-Final/Grand-Final links with no `exam_id` cannot expose another class through an Elimination link. First/last name and class are stored with `exam_candidates` and `exam_attempts`; answers, score and final result remain linked to that attempt. The existing server-authoritative timer, autosave, submission/proctoring and result-publication behaviour are preserved. Invalid/expired/closed codes, unauthorized classes, duplicate/conflicting attempts and anonymous result/answer reads are rejected.

## Event/phase integration

No new engine was created. One Elimination Round examination uses the existing Examination module; one Semi-Final Live Competition and one Grand Final Live Competition use the existing Live Competition module. `competition_phase_classes` links each phase/class to the existing exam, competition, session and approved pool. The event monitor provides organizer oversight across all three phases.

## Migration map

The workspace contains forward-looking SQL under `supabase/migrations/0012_*` through `0019_*` plus `ROLLBACK_0012_0019.sql`. The Supabase connector applied the same resulting schema under these migration-history names (versions from `list_migrations`):

| Workspace file | Applied DB migration(s) |
|---|---|
| `0012_official_event_identity.sql` | `20261105064057 official_event_identity` |
| `0013_question_pools.sql` | `20261105064317 question_pools`, `20261105064358 question_pool_validate_curriculum_counts_fix` |
| `0014_phase_qualification_admission.sql` (consolidated candidate) | `20261105064710 qualification_schema_part_a`, `20261105064733 compute_phase_qualification_function`, `20261105064806 qualification_admission_functions_policies` |
| `0015_exam_shared_links.sql` | `20261105064909 exam_shared_links` |
| `0016_participant_admission_recheck.sql` | `20261105065223 participant_admission_recheck` |
| `0017_pool_manual_selection.sql` | `20261105065308 pool_manual_selection` |
| `0018_participant_admission_verified_student.sql` | `20261105070353 participant_admission_verified_student` |
| `0019_shared_link_identity_integrity.sql` | `20261105071022 shared_link_identity_integrity` |

The applied connector queries and workspace files are not guaranteed byte-identical; `0014` is a consolidated local candidate and `0019` was applied with a compact equivalent. Post-apply schema validation confirmed the expected functions, tables, policies, constraints, triggers, indexes and official names. Do not reapply these migrations to a project that already has them.

## Security and reversibility

New tables/columns are additive. RLS is organizer-only for `question_pools`, `question_pool_items`, `question_usage`, `qualification_records` and `qualification_overrides`; exam candidates/attempts/answers were tightened to organizer roles. Private tables are excluded from Realtime `postgres_changes`; live participant screens continue to use token-scoped server APIs and broadcast-only triggers. A schema rollback script is provided at `supabase/migrations/ROLLBACK_0012_0019.sql`; use it only before go-live or after a verified backup, because it drops new pool/qualification data. The 0012 text/JSONB name correction is not automatically reversible; restoring pre-0012 wording requires a backup.

## Admin decisions still open

- Authoritative Elimination question count (20 / 25 / 5 per class).
- Production deployment is authorized **only after** authenticated browser tests and the full changed-file / migration / RLS / build / lint / test / Vercel env / secret review pass. No production deployment has been performed in this work.
