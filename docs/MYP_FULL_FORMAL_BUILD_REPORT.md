# MYP Full Formal Assessments — Build & Verification Report

Date: 2026-11-13 · Branch: `arena/238e02f7-evalora` (base `main` @ `ff1bf105`) · Author: Arena Agent Mode
Scope: the two full formal MYP e-assessments commissioned for Grade 9 (MYP 4) and Grade 10 (MYP 5), Mathematics.

---

## 1. What was delivered

| | MYP4 — Statistics & Distributions | MYP5 — Sequences & Series |
|---|---|---|
| Exam ID | `e4000000-0000-4000-8000-000000000002` | `e5000000-0000-4000-8000-000000000002` |
| Quiz ID | `e4000000-0000-4000-8000-000000000001` | `e5000000-0000-4000-8000-000000000001` |
| Access code | `MYP4-STAT-FULL-2026` | `MYP5-SEQ-FULL-2026` |
| Class | `Grade 9 — MYP 4` (`0a400000-0000-4000-8000-000000000109`) | `Grade 10 — MYP 5` (`0a400000-0000-4000-8000-000000000110`) |
| Questions | 70 (Part I Q1–50 single-choice + Part II Q51–70 written) | 74 (Part I Q1–50 single-choice + Part II Q51–74 written) |
| Marks | 98 (50 objective + 48 written) | 166 (50 objective + 116 written) |
| Duration | 180 minutes | 180 minutes |
| Status | `open` · shared link enabled · **results not published** | `open` · shared link enabled · **results not published** |
| Hints | Two progressive hints per question, 140 published hint rows, verified | Two progressive hints per question, 148 published hint rows, verified |

Migrations `0116`–`0133` create everything. They are idempotent (`ON CONFLICT DO NOTHING`) and re-runnable; the `0132` finale carries an abort-on-mismatch self-check and passed it. Both papers reproduce the source papers' wording, notation, numbering, tables, marks per part and figures. Part I follows the chapters in the printed order; Part II keeps the printed grouping (MYP4: by MYP criterion; MYP5: four questions per chapter). The source PDFs print no answer key anywhere; **every key in these e-assessments is DERIVED** (see §5).

## 2. Deployment status

- **Production is LIVE.** Vercel deployment `dpl_Bu9YLCd1QkVdKD6VQWNt33CYGzi4` (project `evalora`, sha `9028ec72…`, branch `arena/238e02f7-evalora`) reached `READY` / `PROMOTED` on 2026-11-13 (build started 20:15:56 UTC, alias assigned 20:18:23 UTC). The branch alias, `evalora-starboyboy2017-cells-projects.vercel.app` **and `evalora-six.vercel.app` now serve this deployment.**
- Preview of the same sha (`dpl_3aVmAvwvCGkwNvSzNHnjn99wojwd`) was READY before promotion. Prior production (`dpl_6FkB95EYK4r8qRGDaGkKnFzdpgrh`, `main` @ `ff1bf105`) remains available for instant rollback.
- The 26 figures are repository static assets under `public/exam-figures/myp4/` (23) and `public/exam-figures/myp5/` (3) and are shipped with the deployment.
- **Not independently verified from this environment:** the sandbox has no outbound access to `vercel.app`, so HTTP reachability of the live pages and figure URLs was not fetched directly. Readiness rests on Vercel's `READY`/`PROMOTED` state, the alias assignment record, and the build completing successfully. No browser-based end-to-end sitting has been run; a teacher pilot attempt before exam day is recommended (§8).

## 3. Content fidelity to the source papers

Checked against the available renders of the source PDFs (`/home/user/myp4_text.txt`, `/home/user/myp5_text.txt`, page images under `/home/user/myp4_pages/`, `/home/user/myp5_pages/`).

- **MYP4 Q52** (the specifically requested check): paper reads — waiting times "12, 4, 9, 15, 7, 21, 9, 6, 11, 14, 8, 9, 17, 5, 10"; "a Write the five-point summary … and calculate the interquartile range (2)". Stored items match the paper verbatim; the stored model answer (sorted 4, 5, 6, 7, 8, 9, 9, 9, 10, 11, 12, 14, 15, 17, 21; median 9; Q1 6; Q3 14; five-point 4, 6, 9, 14, 21; IQR = 8) is correct and consistent with the paper's quartile convention (median excluded from both halves).
- **MYP5 Q51–Q54** (previously unverified): checked against source pages 5–6 — stems, marks per part (4+4+4+5), criterion and level labels all match; solutions re-derived independently and all correct (uₙ₊₁ = 3uₙ → 2, 6, 18, 54, 162; uₙ = 5n + 2 → u₁₀ = 52; uₙ = 2·3^(n−1) with the four checks; Fₙ = 4500 + 300n → F₁₀ = 7 500, first breach of 10 000 in year 19 with F₁₈ = 9 900, F₁₉ = 10 200). The taxi-fare convention is stated inside the question, matching the printed "year 1 is the first year after the rise begins".
- All other written questions in both papers (MYP4 Q51–70; MYP5 Q55–74) were re-derived independently from the paper text/tables — see §6. Data tables in the paper match the stored data everywhere checked (e.g. MYP5 Q58 table 3, 8, 13, 18; Q65 7, 14, 25, 40; Q69 table 300/600/1200/2400; MYP4 Q56 table with frequencies 18, 42, 70, 48, 22; Q58 list of 14 shops).
- Marks per part sum to the question points for **all 44 written questions** in both papers, verified in the live database (zero mismatches), including MYP5 Q71–74 (migration 0131).
- **Deliberate deviations from the source (commissioned, not accidental):** both papers are delivered as formal **180-minute** assessments (sources *suggest* 110 min / 90 min); instruction pacing was adjusted to match (MYP4 "about 2 minutes per mark", MYP5 "about 1 minute per mark"). The MYP4 source PDF's running footer brands it "IB MYP 5 Mathematics" even though the commission places it as the Grade 9 / MYP 4 paper; the branding line is **not** reproduced in the e-assessment.
- **Defects inherited from the source are reproduced, and flagged, not silently corrected:** see §7, notably MYP4 Q61.

## 4. Figures

All 26 figures were visually inspected and are consistent with the data used in the stored derivations:

- MYP4: q02 (stem-and-leaf, 22 students, stems 5/6/7 → 6+2+1 = 9 ✓), q04 (22 heights, stems 14–18 ✓), q05 (back-to-back stall A = 12/15/18/21/24/26/28/31/33/35/38/42 ✓), q06 (student's miscopied salon plot, 20 leaves ✓), q07 (25 spelling marks, ordered leaves match ✓), q12 (box plots A ≈ 59–71, B ≈ 62–82 ✓), q13 (Q1 ≈ 15, Q3 ≈ 30 ✓), q15 (12 battery lifetimes, dot at 84 ✓), q16 (A ≈ 19, B ≈ 41 ✓), q17 (12, 15.5, 18.5, 24, outlier 52 ✓), q19 (A outlier 105, B tight ✓), q26 (points (0,0)…(60,60), cf 25 at mark 30 ✓), q28 (points (0,0)…(50,40) ✓), q30 (points (20,0)…(50,32) ✓), q31 (same curve as Q26, cf 45 at mark 40 ✓), q32 (heights 6, 14, 12, 10, 8 ✓), q35 (student's unequal-width histogram, heights 8, 20, 30, 12 ✓), q36 (heights 4, 9, 13, 8, 4, 2 ✓), q37 (P symmetric / Q right-skew / R bimodal / S left-skew ✓), q38 (densities 3, 1.2, 2.5, 0.8 ✓), q46 (μ 120 σ 15, mark at 141 ✓), q47 (μ 60 σ 4, band 52–56 shaded ✓), q50 (μ 200 σ 20, 160 h shaded ✓).
- MYP5: q06 (4, 7, 10 sticks ✓), q26 (1×1 → 4×4 ✓), q28 (2, 6, 12 dots ✓).

## 5. Answer-key provenance — ALL KEYS ARE DERIVED

No source answer key exists. The source PDFs print only questions (worked solutions are "issued separately by your teacher"). **Every key in both e-assessments was derived during the build:** each MCQ option key, each `accepted` answer list, every numeric answer/tolerance, every keyword rubric, and every model answer in the explanations was computed from the paper data, not copied from any key. Derived keys carry the usual risk of author error, so they were audited post-build (§6) and one defect was found and fixed (MYP4 Q22, §7.3).

Students see hints, not keys. Marking is criterion-aware: Part II parts marked on keywords/accepted variants; single-choice keys are position-mapped A=1…D=4.

## 6. Verification performed (all 2026-11-13)

Method and results. "Independent re-derivation" = recomputed from the paper, not from the stored solution.

1. **Part I MCQ internal consistency (live DB):** for all 100 single-choice questions, the letter in each stored explanation ("Answer: X") matches the position of the keyed (`is_correct`) option. **100/100 match, 0 mismatches.**
2. **Part I MCQ option integrity (live DB):** both papers, 50/50 questions each with exactly 4 options and exactly 1 keyed option. **0 violations.**
3. **Live coverage (live DB):** MYP4 — 70 on-paper questions at positions 1–70 (distinct), 98 marks, 50 objective questions (50 objective marks), 48 written marks, 50/200 keyed options, 70 questions with 140 published hint rows, all questions tagged. MYP5 — 74 on-paper at positions 1–74 (distinct), 166 marks, 50 objective + 116 written marks, 50/200 keyed options, 74 questions with 148 hint rows, all tagged.
4. **Written-question independent re-derivation:** all 44 assess_parts questions (MYP4 Q51–70, MYP5 Q51–74) re-derived by machine check and read-through; every numeric answer confirmed correct to its stored tolerance (e.g. MYP4 Q54 mean before/after 13.15/11.08, σ = 8.20 ✓; Q66 median 53.3, IQR 24.5 ✓; Q68 mean 52.3 kg, value 1 569 000 FCFA ✓; MYP5 Q57 d = 5, a₁ = 14 ✓; Q65 u₁₀ = 214 ✓; Q74 Sₙ method, u₂₀ = 62 ✓). Rubric keyword lists and accepted variants read for consistency with the model answers.
5. **Part-point sums == question points** for all 44 written questions in the live DB — 0 mismatches (this also closes the 0131 pre-validation gap).
6. **Explanations vs keys (live DB):** spot-checked and, for numeric content, re-computed — one arithmetic slip found and fixed (§7.3). Two other cosmetic notes only (§7.4, §7.5).
7. **Migration ledger:** 0116–0133 all applied to the live database (`nqxqisjtbfsratgztmch`). Self-check in 0132 (abort-on-mismatch on the complete paper) passed at apply time. 0133 applied and verified post-apply. Migrations 0128, 0129, 0131 were applied earlier without prior offline pre-validation; live verification now shows their content green, so this gap is closed retrospectively.
8. **Build/deployment:** `next build` via Vercel for sha `9028ec7` completed READY/PROMOTED; cron `/api/cron/close-expired-attempts` (0 3 * * *) intact; exam feedback uses `criterionNarrative(criteria)` (`examFeedback.ts`, 1564 checks green).

## 7. Known defects and caveats (read before the first sitting)

1. **MYP4 Q61 — the printed question is mathematically impossible.** It asks the candidate to "show how pooling the marks of two classes can give a median higher than both class medians". No pooling of raw data can do this; the pooled median always lies between the two class medians. The stored model answer says so explicitly, marks `70` as impossible (at least 16 of 32 pooled marks ≤ 68), and rewards the strongest valid reading (pooled median higher than the *lower* class median, with a worked example) plus the warning about quoting class medians. Marking keywords accept the impossibility argument, any correctly computed example, and the warning. **Teachers should be briefed**; the question, as printed, cannot be answered as asked.
2. **MYP5 Q51–54 verified** — no issues (see §3). (Listed here only because it was an open item.)
3. **MYP4 Q22 — explanation arithmetic slip FIXED.** The stored explanation said "…= 30 + 2.27 ≈ 31.8 cm" (2.27 + 30 = 32.27). Fixed live by migration **`0133_myp4_q22_explanation_fix.sql`** (2026-11-13): the stored explanation now derives the grouped-data median consistently (n ÷ 2 = 15 → 30 + (15 − 13) ÷ 11 × 10 ≈ 31.8 cm) and notes the 15.5-position variant (≈ 32.3 cm). The key itself was always correct (D, 31.8 cm) — **key unchanged**. The migration is idempotent and aborts unless exactly one row is affected; it was verified post-apply. It is committed on this branch.
4. **MYP4 Q58 (outlier fence).** The stored solution computes the 1.5 × IQR fence from the **full** 14-value set (Q1 45, Q3 58, IQR 13, fence 77.5). Computing the fence from the 13 non-outlier values instead gives 76.0 — also above every remaining value, and also proving 92 is an outlier. Both methods are mathematically defensible; the marking keywords currently credit only the fence-77.5 phrasing. Flag for teacher discretion at marking time; a rubric relaxation can follow if wanted.
5. **MYP4 Q67 (skew direction).** The plot's full leaves are not printed in the question (only stem counts: 4 stems, 11 leaves, smallest 22, largest 54, stem 4 carries six). "Skewed left / negatively skewed" is the intended and defensible reading (bunched 40s, tail toward the 20s). The rubric accepts any "skew" + left/negative evidence; an answer arguing for symmetry must cite the leaf layout to score. Judgment-dependent by construction of the source paper.
6. **MYP4 Q16 / Q13 / Q17 / Q19 / Q12 (figure read-offs).** Box-plot read-offs are approximate (e.g. Q16 stored text says IQR ≈ 8 vs ≈ 40; the figure reads ≈ 11 vs ≈ 36 — conclusion unchanged). Tolerances in marking accommodate the read-off band; conclusions (which paper wins, IQR vs median) are unaffected.
7. **MYP4 Q54 — sample vs population formula.** Stored solution uses the population formula (σ ≈ 8.20). Sample-formula candidates get σ ≈ 8.52; the marking note tells the examiner to accept only with stated method. Minor, documented in the question itself.
8. **MYP5 Q54 — year convention.** Year 1 = first year *after* the rise begins, per the printed paper; all stored answers follow it and an alternate self-consistent convention yields identical answers; noted inside the question.
9. **Source inconsistencies not reproduced:** MYP4 source branding ("IB MYP 5 Mathematics" footer on the Grade 9 paper) and the sources' suggested times (110/90 min) are not reproduced; delivered duration is 180 minutes for both, with in-paper pacing adjusted to match.
10. **No end-to-end student sitting has been run.** The app build, data integrity, keys, figures and hints are verified as above; a live walkthrough (login → attempt → autosave → submit → teacher marking view) has **not** been executed for these two exams. See §8.
11. **Public-asset figures untested end-to-end.** Figure URLs ship with the build and the build is READY/PROMOTED, but figure URLs were not fetched from this environment (no outbound access to the production domain). If any figure 404s for students, it is a deployment/routing issue, not a data issue; all assets are committed under `public/exam-figures/`.
12. **All keys are DERIVED** (§5) — none comes from an authoritative key. First-sitting moderation (or a teacher spot-check of a sample per paper) is advisable before stakes attach.

## 8. Recommendations

1. Before the first real sitting: a teacher dry-run of both papers (sign in as candidate → complete a handful of parts → submit → review marking output), specifically exercising the Part II numeric entry, expression entry (`^` for powers) and keyword-rubric parts.
2. Brief the MYP4 Q61 examiner team on §7.1 (and, if useful, supply the fence-76.0 acceptance for §7.4 as a rubric update).
3. Keep results unpublished (`results_published=false`) until the marking moderation above is done.
4. Recommended tweak for a future revision: relax MYP4 Q58 keywords to also credit "fence 76" and any numerically sound variation.
5. Keep the delivery pipeline: migrations applied in filename order, idempotent; production rollback path is re-promoting `dpl_6FkB95EYK4r8qRGDaGkKnFzdpgrh`.

## 9. Traceability

- Migrations: `0116`–`0133` (`supabase/migrations/`), builder `scripts/exam-import/build_myp45_full_migrations.py`.
- Live DB project: `nqxqisjtbfsratgztmch` (all verification queries in this report were run there 2026-11-13).
- Deployment: `dpl_Bu9YLCd1QkVdKD6VQWNt33CYGzi4` (READY/PROMOTED) — inspector `https://vercel.com/starboyboy2017-cells-projects/evalora/Bu9YLCd1QkVdKD6VQWNt33CYGzi4`; production alias `evalora-six.vercel.app`.
- Source papers: `/home/user/myp4_text.txt`, `/home/user/myp5_text.txt`, page images `/home/user/myp4_pages/`, `/home/user/myp5_pages/` (used for verification only; not committed).
- Working tree: clean except the `0133` migration and this report at the time of writing.
