# First Term 2026/27 — Mathematics examinations delivery report

**Scope:** MYP 4 (Grade 9) and MYP 5 (Grade 10) First Term Mathematics
examinations, built from the four owner-supplied PDFs inside the existing
EVALORA app, with all four MYP criteria, automatic objective marking,
disconnect recovery, capacity evidence and Super Admin reporting.

**Production:** <https://evalora-six.vercel.app>

**Branch:** `arena/205ae4cc-evalora` · **Base:** `8718621`

---

## 1. Examinations created

Both papers are live (`status = open`) in the Oak International School
organisation and are linked to the correct Grade 9 / Grade 10 classes.

| | MYP 4 — Grade 9 | MYP 5 — Grade 10 |
|---|---|---|
| Title | MYP 4 (Grade 9) Mathematics — Term 1 Summative Assessment | MYP 5 (Grade 10) Mathematics — Summative Assessment: Sequences and Series (Version B) |
| Quiz | `cb000000-0000-4000-8000-000000000001` | `cc000000-0000-4000-8000-000000000001` |
| Exam | `cb000000-0000-4000-8000-000000000002` | `cc000000-0000-4000-8000-000000000002` |
| Class | `0a400000-0000-4000-8000-000000000109` (Grade 9 — MYP 4) | `0a400000-0000-4000-8000-000000000110` (Grade 10 — MYP 5) |
| Duration | 120 minutes | 120 minutes |
| Marks | 100 | 100 |
| Questions | 45 (Part A 25 objective · 30 marks; Part B 20 theory · 70 marks) | 35 (Part A 19 objective · 30 marks; Part B 16 theory · 70 marks) |
| Criteria | A 32 · B 20 · C 24 · D 24 | A 32 · B 24 · C 20 · D 24 |
| Access | Shared link, Grade 9 class only, one attempt with resume | Shared link, Grade 10 class only, one attempt with resume |

Each question stores its printed number (MYP 5 Part B keeps both its printed
number 1–16 and its platform position 20–35), its criterion, marks, difficulty,
calculator permission, source key and marking model. The exam screen shows the
paper's own number and scopes the “of N” count to the current part (“Part B ·
Question 1 of 16”), not the global platform position. The two source papers were
not modified, and no older examination or question was replaced.

## 2. Assessment and marking

- **Objective answers are marked automatically**: 25 MYP 4 questions (30 marks)
  and 19 MYP 5 questions (30 marks), including multiple choice, true/false,
  matching and exact numerical answers. Numeric answers accept tolerance and
  equivalent forms.
- **Constructed-response questions are teacher-marked against the official
  scheme** with per-part mark breakdowns, model answers and guidance. They are
  never auto-awarded: content-bearing unmarked work stays *pending*, blank work
  on a final attempt is an explicit *zero*.
- **All four criteria are reported separately**, with marks, maximum, percentage,
  achievement level 0–8 and criterion status. A criterion that was assessed and
  earned nothing shows **0**; a criterion that was not assessed shows
  *not assessed*; a criterion still awaiting marking shows *pending marking*.
  The three states are never collapsed.
- **Overall MYP grade 1–7** is the sum of the four criterion levels mapped
  through the configured grade boundaries. Default MYP boundaries are used until
  the school configures its own; the source of every boundary is printed in the
  UI and in exports.
- **Independent re-solve:** all 80 questions were re-solved from the printed
  data. No answer-key error was found. One fidelity omission was corrected
  forward: the 36 printed Part B titles that the first import had dropped are
  now the first line of each constructed-response prompt. No mark, key,
  criterion, answer, attempt or published result changed.
- Automated evidence: 112 paper/key/figure checks, 22 criterion-grading checks,
  36 migration invariants, and the existing MYP grading/report suites
  (`npm test`: 134 suites passed, 0 failed, 8 browser-only suites skipped).

## 3. Disconnection detection and recovery

The timer is **server-authoritative**:

- The browser sends periodic heartbeats; the server records `last_seen_at`.
- A connection is treated as lost only when the server has not heard from the
  attempt for 65 seconds (`CONNECTION_LOST_AFTER_MS = 65_000`), not merely when
  `navigator.onLine` flips.
- When the candidate reconnects, the server computes the creditable outage from
  the last confirmed contact, subtracts hidden-tab time, clamps to the
  server-verified window, rounds in the candidate's favour to whole minutes and
  adds it to `extension_minutes`. Per-event and per-attempt caps apply.
- The attempt, answers, current question and remaining time are restored from
  the server; there is one active attempt per candidate (database unique index),
  and duplicate reconnects can never add extra time.
- Organizer pauses freeze the deadline and refuse saves with a paused banner;
  reconnection never clears an organizer pause. Individual student pauses use
  the same ledger and are visible to staff.
- All 12 requested edge cases are covered by
  `scripts/test-exam-connection-pause.mjs` (27 checks), including: normal
  heartbeat, confirmed outage, exact credit, reconnect, isolation between
  candidates, duplicate reconnect, repeated outages, manipulated clock, hidden
  tab, short jitter, `leave`, closed attempt, connected-past-deadline and
  disconnected-past-deadline recovery.

## 4. Scalability at 100 / 200 / 300 / 500

Full method and caveats: [`docs/SUMMATIVE_A_CAPACITY.md`](./SUMMATIVE_A_CAPACITY.md).

**Verified in the application benchmark** (real save route + real grading engine,
in-memory database boundary):

| Candidates | Autosaves | Lost/duplicate | p95 | p99 | Attempts graded |
|---:|---:|---:|---:|---:|---:|
| 100 | 1 000 | 0 | 19.7 ms | 20.5 ms | 100 |
| 200 | 2 000 | 0 | 12.3 ms | 12.6 ms | 200 |
| 300 | 3 000 | 0 | 24.3 ms | 24.9 ms | 300 |
| 500 | 5 000 | 0 | 68.8 ms | 69.8 ms | 500 |

Admission was also verified at 100/500/1 000 simultaneous joins (100% admitted,
0 duplicates, p99 36/58/116 ms).

**Estimated, not verified:** 500 candidates without video can be served by the
application, but production capacity depends on Vercel functions, Supabase
connection limits and network RTT; the current Free/Hobby setup should be
upgraded to Vercel Pro + Supabase Pro for a 500-candidate sitting. **500
video-proctored candidates are not claimed**; that is a LiveKit paid-capacity
problem and must be piloted separately. No production exam data was used for
load testing.

## 5. Super Admin results and exports

The existing **Super Admin → MYP Results & Reports** console is global, not
organization-scoped. It supports filtering by organization, class, subject,
exam and date; shows criterion marks/maxima/levels and the three criterion
states; and links each examination to its MYP results.

Exports are **explicit-click buttons**, never automatic downloads, and contain all
four criteria:

- XLSX: student sheet (marks, maxima, levels per criterion, overall grade,
  percentage), detailed criterion rows, class statistics and a grading-config
  sheet. Numeric cells remain numeric; assessed zeros are real zeros; pending and
  not-assessed levels stay blank with a status.
- PDF: individual and collective reports with the same criterion detail and
  boundary sources.

The new papers appear automatically because the console reads the same exam
records and the same `src/lib/myp.ts` engine; no separate reporting code path was
added. The report/export suites pass (79 checks plus 28 surface/control checks).

## 6. Technical delivery

| Item | Detail |
|---|---|
| Branch | `arena/205ae4cc-evalora` (from `8718621`) |
| New migrations | `20261117110000_myp4_grade9_first_term_summative.sql` (45 Q, 100 marks) |
| | `20261117110100_myp5_grade10_sequences_version_b.sql` (35 Q, 100 marks) |
| Forward correction | `20261117120000_summative_a_source_titles.sql` (36 printed titles) |
| Database | Supabase `nqxqisjtbfsratgztmch`; all three migrations applied; migration history updated |
| Verification | `scripts/validate-summative-a-migrations.mjs` 36/36; `scripts/test-summative-a-papers.mjs` 112; `scripts/test-summative-a-grading.mjs` 22; `npm test` 134 suites passed, 0 failed |
| Build | `npx tsc --noEmit`, `npm run lint`, `npm run build` all green |
| Deployment | Vercel project `evalora`; production alias `evalora-six.vercel.app`; branch commit deployed to production after merge |
| Docs | `docs/SUMMATIVE_A_SOURCE_CHECKLIST.md`, `docs/SUMMATIVE_A_CAPACITY.md` |

No production data was reset, truncated or deleted. No RLS policy or tenant
boundary was weakened. Existing exams, questions, attempts and published results
remain untouched. The temporary `http` extension used to fetch the migration
payload was dropped immediately after the migration, and the temporary deploy
payload files were removed from the branch.

## 7. Outstanding issues and evidence

1. **Production E2E with authenticated candidates was not run.** No test
   candidates exist in the live organisation and creating them would alter
   production data. The route, grading, recovery and export paths are covered by
   the automated suites and the isolated load harness. Evidence: test output in
   §6.
2. **500-candidate capacity is estimated, not proven** for the managed services.
   The application benchmark is in-process; see §4 and the capacity document.
3. **Video proctoring at 500 is out of scope/not claimed.** LiveKit capacity must
   be purchased and piloted separately.
4. **70 marks per paper are teacher-marked.** Objective marking is automatic;
   constructed responses remain provisional until a teacher marks them. This is
   the scheme's design, not a missing feature.
5. **MYP 4 Q5 uses a bitmap crop** of the printed bar chart. The question asks
   why the bars have gaps and does not use the bar values; every other figure is
   native SVG rebuilt from data.
6. **Default MYP boundaries** are in use for any organization that has not saved
   its own. The UI and exports state this source explicitly.
7. **No published results yet** for the two new papers because no candidate has
   attempted them in production; the grading engine was exercised with synthetic
   final, all-zero and pending attempts.
