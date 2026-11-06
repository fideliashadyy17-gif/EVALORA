# Class question bank and Oak Mental Math event

## Current state and safety

This guide describes the branch implementation, not necessarily the version currently deployed. Migration `0011_class_question_bank_events.sql` adds class, curriculum, provenance and review metadata, event phases and qualification records. Deploy app changes only after migration and verification. Class associations and the review status are organizational metadata; they do **not** by themselves restrict all quiz editors, public exam routes, host controls or participant admission. Organizers must independently verify pools and identities before use. The event phase status controls the event administration workflow, not all underlying exam or live-session access paths.

Generation is **parameterized template generation**, not a call to an AI model. The legacy `ai_generated` database value denotes generated content, not proof an AI was used. References guide topic selection and are not guarantees of alignment. The Benin link is a sector budget document, not a syllabus; teachers must check official school syllabi. AP grade-to-course mappings are school choices flagged for review, not official equivalencies. Seed questions were automatically validated and marked approved in the database, not individually teacher-reviewed; subject experts must review them before high-stakes use. Text symbols are used for the early visual questions, not separate illustrations.

## Manage questions

1. Select a school under **Class Management**; configure the year, class, subjects, curriculum associations and course labels. Mapping review flags are informational.
2. Open **Question Bank** to create, edit and filter by school/class and review state. Class, subject, curriculum, course and reference fields are editable; subject and class are checked against the selected organization.
3. Under **Generate**, load an active class and choose one of its linked supported programmes. Generated items start as pending review, with computed answer keys, source references and a reproducibility seed. Duplicates are skipped; a shortfall is reported instead of padding.
4. A super admin reviews and approves or rejects generated questions. Review the mathematics, language, accessibility, age appropriateness, source and intended curriculum; automated checks are not a substitute for a teacher. Existing quiz editors do not universally enforce approved-only selection.

## Oak seed snapshot

The destination organization is `0a400000-0000-4000-8000-000000000001`, academic year 2026/2027. It has 14 classes and 28 class–curriculum links, 1,064 distinct seeded questions and 4,112 options. Every class × curriculum has 10 elimination, 13 semi-final and 15 grand-final questions. The temporary Edge Functions used for the seed were removed. `scripts/oak-seed-function.ts` is a historical one-off harness, not an automatic migration; do not deploy or rerun it against existing data without a separate plan and backup.

The Oak event `0a400000-0000-4000-8000-000000000200` was assembled as a draft; confirm its current status before operating it. Its official name is Oak International School Mental Math Competition. It has 42 class/phase quiz links, 14 draft exams, 28 draft/private competitions and 28 locked lobby sessions. Elimination has 20 questions per class (10+10), semi-final 24 (12+12, one unused spare per curriculum) and grand final 30 (15+15). Pools are disjoint; 1,036 questions are attached. These are assembled draft assets, not proof of participant readiness.

## Operating the event

- Verify the school, teacher assignments, class rosters, AP mappings, question content and access settings before enabling an exam or opening admission. Keep the pre-created sessions linked to their corresponding competition; don't replace an ended session without reconciling results.
- Mark the preceding phase completed, compute eligibility for the next phase, and review every proposed decision. The local event-detail UI adds a phase-opening check for the preceding phase and qualification decisions; the separate production event monitor and admission routes must also be tested independently. Qualifying rules default to top 10 / minimum 50% for semi-final and top 5 / minimum 50% for final. Classes with no qualifying candidates need an explicit operational resolution; the current gate does not model a class-level waiver.
- The production qualification review uses database functions and admission-token / verified-student checks for competition admission. Check source scores and identities, and test qualification, revocation, join, state and answer flows end-to-end in staging; do not assume that all other access paths are covered.
- **Known gaps:** the production baseline has a question-pool UI and database guards but the combined local changes are not yet verified end-to-end; generic quiz/exam/competition creation does not consistently expose a class selector; approval gating is not universal in underlying exam/session routes; large result sets in eligibility computation may be affected by PostgREST row limits; recomputation does not reconcile previously approved records after score changes. These areas need further validation and possibly further development and authenticated end-to-end testing before unattended/high-stakes operation.

## Checks

Run `node scripts/test-class-question-bank.mjs`, `npx tsc --noEmit`, `npm run lint`, and `npm run build`. These checks cover pure generation and ranking invariants and static route presence; they are not a replacement for authenticated browser, RLS, exam-to-live progression and admission testing.
