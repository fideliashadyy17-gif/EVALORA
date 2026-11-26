# Score Adjustment — production visibility record

Deployed so the feature can be **opened and used** in the live application, not
just called through an API.

| Item | Value |
|---|---|
| Branch commit | `96feabb` |
| Merged to `main` as | `f3a214a` (PR [#107](https://github.com/fideliashadyy17-gif/EVALORA/pull/107), merge commit) |
| Vercel production deployment | `dpl_AZnPJBjvSC55qydo1AHE7eNrVoho` |
| State | **READY / PROMOTED** on `f3a214a` |
| Production domain | `evalora-edu.online` (+ `www`, `ois.evalora-edu.online`) |
| Supabase project | `nqxqisjtbfsratgztmch` (migration `20261125230000_score_adjustments.sql` applied) |

`git rev-parse f3a214a^{tree}` and `git rev-parse 96feabb^{tree}` both return
`04884a523b1c0c38d848ad73d9cec12f5372c8aa` — the deployed artifact is
byte-for-byte the tested tree.

## Why it was invisible before

PR #107 had **never been merged**. `origin/main` at `f0d2d1f` contained zero
score-adjustment files:

```
$ git ls-tree -r --name-only origin/main | grep -iE "scoreAdjust|score-adjust"
(none)
$ git cat-file -e origin/main:src/components/exam/ScoreAdjustmentPanel.tsx
(missing)
```

So production ran a build without the feature at all. Beyond that, even on the
branch the only entry points were deep links: a per-exam button gated on
`scoreAdjustmentEligible && canMark`, and links buried inside
`/dashboard/results` and `/dashboard/exams/[id]/grades`. There was **no sidebar
entry and no landing page**, and the Super Admin studio defaulted to the first
organization — a Premium one with no usable paper — so the panel never rendered
even when the nav item was clicked.

## Navigation paths per role

### Super Admin — `F. Examinations → Score Adjustment (Institution)`

1. Sign in as `starboyboy2017@gmail.com` (platform Super Admin).
2. Left sidebar → **F. Examinations** → **Score Adjustment (Institution)**
   (`/admin/examinations/score-adjustments`). Also reachable through the shell's
   runtime search.
3. The console now opens on **Oak International School** (Institution, 50 live
   examinations) instead of an empty Premium organization. A plan-gate card is
   shown if you switch to an ineligible organization.

### Oak Organization Admin — `Dashboard → Score Adjustment`

1. Sign in as `ayofajemirokun@gmail.com` (Oak `admin`).
2. Left sidebar → **Score Adjustment** (`/dashboard/score-adjustments`).
3. Pick an examination from the picker (badges show Published / Validated /
   Pre-validation), or arrive pre-selected from
   `/dashboard/exams/<id>/adjustments`.
4. Fill the three steps: category + points + scope + reason → **Preview** →
   **Confirm & apply**.

### Teacher / corrector

Identical to the admin path. The sidebar entry requires the `operational`
audience plus `grading.view` / `results.view` to open. Applying requires
`grading.edit`.

### `school_founder`

Supervision-only by design. Opens the panel **read-only** (has `grading.view`,
lacks `grading.edit`), so governance visibility is preserved without granting
write access.

## Gating, verified

Three independent gates, in order of authority:

1. **PostgreSQL** — `apply_exam_score_adjustment` refuses with `plan_ineligible`
   unless the target organization holds an active/trialing Institution
   subscription. Nothing above it can override that.
2. **Server page** — `requireModule(entitlement, "exam_results")` blocks the
   direct URL, and `getEntitlement(supabase, org.id)` (never `ownerBypass`)
   drives the Institution gate.
3. **Sidebar** — `isNavVisible` + a `scoreAdjustmentEligible` flag computed from
   the same real entitlement.

Live proof of the sidebar rule (real `isNavVisible` against Oak's plan):

```
Oak (exam_results ON ) -> true
exam_results OFF       -> false
student                -> false
```

## Publication safeguards

- Adjustments are only permitted while an examination is pre-validation and
  unpublished; the RPC refuses once results are validated or published.
- The adjusted total is written into `exam_attempts.score`, so verification,
  weighted/`/7` level conversion and export all consume the folded number.
- **No adjustment line is rendered anywhere a candidate can see it.**
  `grep -rn "adjustment" src/app/student/ src/components/exam/CandidatePaper*
  src/lib/candidatePaper*.ts` returns nothing.
- Immutable append-only ledger (`exam_score_adjustments` +
  `exam_score_adjustment_items`, both RLS-enabled with 1 policy each) and an
  `audit_logs` row with action `exam.score_adjustment_applied`.

## Evidence

- `https://evalora-edu.online/dashboard/score-adjustments` → HTTP 200, redirects
  an anonymous visitor to `/login?next=%2Fdashboard%2Fscore-adjustments` (route
  exists and is guarded, not a 404).
- `https://evalora-edu.online/admin/examinations/score-adjustments` → HTTP 200,
  redirects to `/login?next=%2Fadmin%2Fexaminations%2Fscore-adjustments`.
- `main` carries all three surfaces:
  - `DashboardChrome.tsx:93` — `{ href: "/dashboard/score-adjustments", label: "Score Adjustment", icon: SlidersHorizontal, audience: "operational", requiresFlag: "scoreAdjustment" }`
  - `modules.ts:337` — `exam_results` nav surface includes `/dashboard/score-adjustments`
  - `AdminShell.tsx:159` — `label: "Score Adjustment (Institution)", labelKey: "admin.scoreAdjustments"`

## Test results

| Check | Result |
|---|---|
| Full suite | **183 passed / 0 failed / 8 skipped — 10,147 checks** |
| `test-score-adjustment` | PASS (15 checks, incl. 6 new reachability checks) |
| `test-plan-modules` | PASS (208 checks) |
| `test-plan-module-workspace-integration` | PASS (522 checks) |
| `test-module-sync` | PASS (325 checks) |
| `test-platform-redesign-audit` | PASS (278 checks, 176 routes) |
| `test-i18n` | PASS (5,977 checks) |
| `tsc --noEmit` | clean |
| `npm run build` | success, all 5 score-adjustment routes emitted |
| `npm run lint` | 0 errors, 18 warnings |
| Vercel preview | PASS |
| `build-windows` | PASS |

`exam-browser` is red, but it was already red before this change: the workflow
failed on runs `45808290520` (11:11Z), `45831813140`, `45718778172`,
`45648875944` and `45644332365`, all before commit `96feabb` (13:42Z). The
failures are in `test-exam-messaging-browser` and `test-exam-browser`, which this
change does not touch.

## Live data

No adjustments exist yet — the feature is ready but unexercised on real data:

```
adjustments = 0, items = 0, audit_rows = 0
```

Oak has five pre-validation, unpublished examinations ready to adjust, the
largest being *MYP 5 (Grade 10) Mathematics — End of First Term E-assessment
(Version C)* with 55 attempts.

## What the user should do next

1. Open `https://evalora-edu.online` and sign in.
2. **Super Admin:** sidebar → *F. Examinations* → *Score Adjustment
   (Institution)*. Oak is pre-selected.
3. **Workspace admin:** sidebar → *Score Adjustment*. Pick *MYP 5 (Grade 10)
   Mathematics — … (Version C)*.
4. Select a category, enter points, choose *All eligible* or *Selected
   students*, add a reason, **Preview**, then **Confirm & apply**.
