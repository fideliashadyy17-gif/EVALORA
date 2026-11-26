# MYP4 & MYP5 Version C — Post-Moderation Audit (2026-11-26)

Production Supabase `nqxqisjtbfsratgztmch`. Sources used: the two uploaded marking
schemes now located at `/tmp/arena-coding-uploads/Marking scheme of grade 9 version C.pdf`
and `… grade 10 version C.pdf`, plus the paper generators in
`scripts/exam-import/version_c_g9.py` / `version_c_g10.py` and the import migrations.

## 1. Grading and moderation status

| | MYP4 | MYP5 |
|---|---|---|
| Attempts | 52 (50 reviewed, 2 blocked) | 55 |
| Answers | 1,239 | 1,339 |
| Submitted, unmarked | 0 | 0 |
| Human-graded → `approved` | 127 | 86 |
| `adjusted` (this audit) | 1 | 0 |
| Awaiting moderation | 0 | 0 |

Nothing remains in `Manual` or `Pending`. There is no `pending` state in the
schema at all: `exam_answers.moderation_status` allows only
`not_required | pending | approved | adjusted | returned`, and the only remaining
`not_required` rows belong to `auto_graded` objective answers (which carry no
moderation requirement) or to the blocked attempts below.

## 2. MYP4 Q7 — answer-key discrepancy (resolved)

**Correct answer is B ("IQR = 26, 75%").** Three independent sources agree:

1. **Official Grade 9 Version C marking scheme**: `Q7 C` in the printed key grid,
   but its own verification line states "Q7: IQR = 50 − 24 = 26; Q3 = 50 marks 75%".
   IQR 26 + 75% is option **B**; option C reads "IQR = 26, 50%".
2. **Paper source** `scripts/exam-import/version_c_g9.py:154-158` declares
   `answer="B"` with explanation "…(Option B)".
3. **Import migration** `20261118054730_myp4_grade9_statistics_version_c.sql`
   inserts `{"n":7,"l":"B","c":true}` — i.e. it *stored* B as correct.

So the live database drifted from the import: it now holds `C` as correct. The
flip post-dates the import; no migration in the repository performs it.

**The official scheme's key grid is unreliable on this paper.** It also prints
`Q6 A` (correct B) and `Q8 D` (correct A) — both already flagged in the paper's
own explanations. The importer handled Q6 and Q8 correctly and only Q7 drifted.

**Reconciliation performed.** Before: 20 candidates who chose B scored 1,
14 who chose C scored 0, and **one** who chose B (attempt `248d194b`, Emily
Gathoni) still held 0 despite a marker note reading "Awarded 1/1". That single
response was corrected through the moderation workflow (`adjusted`, 0 → 1) and
the attempt total recomputed 51 → 52. Q7 is now perfectly consistent:
**21 chose B → 21 × 1 mark; 5 A, 14 C, 2 D → 0**.

**The stored option key was NOT flipped to B.** `question_options` is protected by
`guard_assessment_source_mutation`, which raises
`ASSESSMENT_SOURCE_IMMUTABLE` because both papers are frozen once any attempt
exists. Attempting the update was refused. Flipping it would also have required
rewriting 14 already-submitted responses' scores downward, contradicting
"preserve original responses" and risking backward drift against the 20 marks
awarded by the original marker. The correct state (B as the awarded answer) is
now uniform across the marks, the note trail and the paper source; the residual
defect is the stale stored key, which must be corrected at source by duplicating
the paper before any future sitting. Recorded as an exception below.

## 3. Audit reconciliation (213 vs 215)

```
grading_moderation, both exams:            215 rows
  MYP4  approved  127  starboyboy2017@gmail.com   ← this audit (turn 1)
  MYP5  approved   86  starboyboy2017@gmail.com   ← this audit (turn 1)
  MYP5  approved    2  ayofajemirokun@gmail.com   ← pre-existing, another moderator
  ---------------------------------------------------------------
  total moderation rows                       215
  distinct answer_ids                         215   (0 duplicates)
```

`grade_change_log` shows the identical split: 127 (MYP4, actor A) + 86 (MYP5,
actor A) + 2 (MYP5, actor B) = **215** `moderated` rows, 215 distinct answers.

**No discrepancy and no duplicated approval.** The earlier report compared the
213 rows written in that turn against the 215-row table total, omitting the 2
pre-existing MYP5 rows created by a different moderator before the turn. This
audit adds exactly **1** further row (the MYP4 Q7 `adjusted` decision), bringing
`grading_moderation` to **216** rows / 216 distinct answers, with zero
duplicates over the same answer.

## 4. The two MYP4 attempts shown `in_progress`

These are **not** system-error cases, and their answers cannot be reconciled
because the missing answers were never transmitted to the server.

| | `9f78d40d…` Manoelle SEMANOU | `affd35ee…` saizonou mathys |
|---|---|---|
| Status | `in_progress` | `in_progress` |
| Submitted at | **NULL** | **NULL** |
| Answers on server | **3** of 31 | **0** of 31 |
| Server marks | 0 | 0 |
| Deadline | 09:58:12Z | 11:33:21Z |

Documented trail (`exam_pause_events` + `audit_logs`):

- **10:18:42 / 10:18:44** — both attempts **paused** by the Oak administrator
  (`355ba2fe…`), `action=pause`, `reason=student`.
- **10:19:06 / 10:19:09** — both given **+10 minutes** of extra time through the
  Live Monitor (`exam.extension_granted`, `source=live_monitor_api`).

Not one submission event exists for either attempt in any table.

**Mechanism.** While an attempt is organizer-paused, `POST /api/exam/save`
returns **HTTP 409** — *"This assessment is paused by your organizer. Your answer
is saved in this browser and will sync automatically when the assessment resumes."*
`POST /api/exam/submit` likewise refuses. So from the moment of the pause neither
candidate could transmit further answers, and a submit attempt would have been
rejected. Whatever remained in their browsers never reached the server. The
`+10 minute` extensions granted a minute later could not help a paused paper:
`isPastDeadline` returns false for a manually paused attempt, so the automatic
sweep will not close them either.

**Consequence.** Grading them would require awarding marks to answers that do not
exist in the database. I did not fabricate answers, did not invent a submission
timestamp, and did not close them. The server genuinely holds 3 answers for one
candidate and 0 for the other. They are the only two `in_progress` rows and the
only two attempts where `score` (NULL) differs from the answer sum.

**Required to finish them:** an explicit decision on how to handle the data loss —
e.g. grant a resit/retake, or accept the partial submissions as-is and mark the 3
available answers. Either is a policy call, not a grading task.

## 5. Safeguards observed

| Safeguard | Verified |
|---|---|
| Only the two Version C exams touched | all writes scoped to them |
| Original answers preserved | 2,578 answers, **0 null, 0 empty**; no `answer` column written |
| No answers fabricated | — |
| Unrelated examinations | untouched |
| Already-approved responses | untouched (2 pre-existing MYP5 rows left alone) |
| Audit trail | +1 `grading_moderation` row, +1 `grade_change_log` `moderated` row |
| Results not validated | `results_validated` absent on both |
| Results not published | `results_published=false`, `grades_published_at=NULL`, `grades_published_by=NULL` on both |

## 6. Remaining exceptions

1. **MYP4 Q7 stored key is C** while every source says B. Marks and the note trail
   are consistent with B; the key cannot be edited in place
   (`ASSESSMENT_SOURCE_IMMUTABLE`). Fix at source in the generator/migration and
   ship as a new paper version before re-use.
2. **Two MYP4 attempts blocked** with 3 and 0 of 31 answers — see §4. Needs a
   policy decision; not gradable as data stands.
3. **`auto_score` / `auto_max_score` are stale** on MYP5 (39/55 attempts differ
   from `score`; `auto_max_score` ranges 1–100 against `max_score=100`). These are
   an intermediate auto-marking snapshot, not the authoritative score; `score`
   reconciles exactly with the answers. Left untouched as out of scope.
4. **`part_scores` is empty on human-graded answers**; per-part detail lives in
   `marker_note` text rather than machine-readable fields.
5. **MYP5 Q15 and Q17 are missing from the scripted answer list** (the generator
   emits 1–19 except 12/15/17 for some types). Their DB keys match their
   explanations/prompts, so no action taken, but they are not covered by an
   automated source comparison.

## 7. Totals after this audit

| | MYP4 | MYP5 |
|---|---|---|
| Attempts | 52 | 55 |
| Total points (matched, sum of answer marks) | 1,317.00 | 1,047.00 |
| Score/answer-sum mismatches | 2 (both `in_progress`) | 0 |

Both examinations remain **unvalidated and unpublished**.

## 8. Post-fix verification (2026-11-25, production)

Added after the admin reported *"You are not authorized to apply score adjustments to
this examination."* on the Adjustments page. The report was correct: the permission
check was broken, and it was failing for every staff member.

### 8.1 The defect

`applyScoreAdjustmentServer()` (`src/lib/scoreAdjustmentsServer.ts:727`) calls
`public.apply_exam_score_adjustment` through the **service-role** client, so
`auth.uid()` is `NULL` inside the RPC. The RPC's grading gate called
`public.access_has_permission(p_actor_id, v_exam.organization_id, 'grading.edit')`,
which opens with:

```sql
if auth.uid() is distinct from p_user_id and not public.is_super_admin() then
  return false;
end if;
```

With no session identity that guard returned **false for everyone**, and the RPC
raised `unauthorized: grading.edit permission in target organization required`
(42501) — mapped at `scoreAdjustmentsServer.ts:801` to the 403 message shown.
Super Admins were unaffected only because their branch reads `profiles` directly.

Reproduced live: with empty `request.jwt.claims`,
`access_has_permission('355ba2fe…','0a400000-…001','grading.edit')` → **false**.

### 8.2 The fix

`supabase/migrations/20261126200000_score_adjustment_actor_permission_resolution.sql`
adds `public.access_actor_has_permission(uuid, uuid, text)` — the same permission
graph logic (active profile → permission enabled → super admin → org scope →
founder ceiling → active org → active membership → deny overrides → grants) with
the **session guard removed**. It is `SECURITY DEFINER`, revoked from
`public, anon, authenticated` and granted to **`service_role` only**, which is
sound because `apply_exam_score_adjustment` is itself service_role-only, takes
`p_actor_id`, and already records that actor in the ledger and audit trail.

`access_has_permission` itself was **not** changed — removing its guard would let
any authenticated user query another user's rights.

The RPC was repointed by rewriting its own body via `pg_get_functiondef` +
targeted `replace`, guarded by `position(...)` assertions, so no hand-retyping of
the 400-line body. Live migration recorded as
`20261126155557 score_adjustment_actor_permission_resolution`.

### 8.3 Verification

| Check | Result |
|---|---|
| Resolver exists / RPC repointed | 1 / `prosrc` contains `access_actor_has_permission(p_actor_id, …)` |
| Old resolver gone from RPC | `access_has_permission(p_actor_id, …)` absent |
| Execute grants on new resolver | `postgres, service_role` — **not** `authenticated`/`anon` |
| Oak admin `355ba2fe` `grading.edit` | `true` (was `false`) |
| Owner/super `3c3ed712` | `true` |
| `school_founder` `cccd0907` edit / view | `false` / `true` (ceiling preserved) |
| Oak admin vs DEMO org | `false` (cross-tenant refused) |
| Null actor | `false` |
| RPC as admin, attempt `55cdad7e`, rolled back | 66.00 → **67.00**, then rolled back clean (0 adjustment rows) |
| RPC as `school_founder` | 42501 `unauthorized: grading.edit…` (refusal intact) |
| RPC on published Premium exam `de…3e9` | 42501 `exam_already_published` (lifecycle gate fires first) |

The GET/read path is unaffected: it resolves through `checkPermissions` /
`hasPermission` (`src/lib/rbac.ts:148,162`) on the **user-session** client after
`auth.uid()`, so the identity guard is correct there and stays.

Regression coverage: `scripts/test-score-adjustment.mjs` now asserts the artifact
and role grants, and that the RPC does not use the caller-session resolver
(16 checks pass; `tsc --noEmit` clean).

### 8.4 Re-confirmed state (unchanged by the fix)

| Check | Value |
|---|---|
| `grading_moderation` rows / distinct answers / duplicate answer sets | 216 / 216 / **0** |
| Decisions | MYP4 127 approved + 1 adjusted; MYP5 86 + 2 pre-existing approved |
| Answers `human_graded` | 213 (one per approved response besides `adjusted`/legacy rows) |
| Answers awaiting moderation (`pending`/`proposed`) | **0** |
| Answers `not_graded` | 3 — all in paused attempt `9f78d40d` |
| Answers `unanswered` | 17 (MYP4 10, MYP5 7) — all genuinely blank `""` values, 0 marks due, not awaiting marking |
| `exam_score_adjustments` | 0 (Q7 was reconciled as a moderation `adjusted`, not a ledger adjustment) |
| MYP4 attempt `248d194b` | 52.00 `marked` — Q7 0 → 1 applied, correct answer `is_correct=true` |
| MYP4 totals | 52 attempts, 1,317.00 across 28 `auto_submitted` + 20 `submitted` + 2 `marked` + 2 `in_progress` |
| MYP5 totals | 55 attempts, 1,047.00 across 22 `auto_submitted` + 31 `submitted` + 2 `marked` |
| Publication | both `paused`, `grades_published_at=NULL`, `grades_published_by=NULL` — **unvalidated, unpublished** |

The 213-vs-215 question is closed by the row-level detail: 216 moderation rows
map 1:1 onto 216 distinct answers with zero duplicates, and the 213 headline was
the count of responses *this audit* approved, not the count of decisions in the
table. No approvals were duplicated to close the gap.
