# First Term 2026/27 — source-to-platform fidelity checklist

Papers covered:

| Paper | Student paper | Marking scheme | Questions | Marks |
|---|---|---|---|---|
| MYP 4 (Grade 9) Mathematics | `Grade_9_MYP_4_Mathematics_Summative_Assessment.pdf` (2 pages) | `Grade_9_MYP_4_Mathematics_Marking_Scheme.pdf` (6 pages) | 45 | 100 |
| MYP 5 (Grade 10) Mathematics — Version B | `GRADE 10 exam 1st term.pdf` (2 pages) | `GRADE 10 exam 1st term answer version B.pdf` (4 pages) | 35 (19 + 16) | 100 |

Platform records:

- MYP 4 — quiz `cb000000-0000-4000-8000-000000000001`, exam `cb000000-0000-4000-8000-000000000002`
- MYP 5 — quiz `cc000000-0000-4000-8000-000000000001`, exam `cc000000-0000-4000-8000-000000000002`

This checklist records what was compared, page by page, and the independent
re-solve of every question. The automated checks are in
`scripts/test-summative-a-papers.mjs` (112 checks) and
`scripts/test-summative-a-grading.mjs` (22 checks).

## 1. Page-by-page checklist

### MYP 4 student paper

| Source page | Source content | Platform record | Status |
|---|---|---|---|
| Page 1 | Header, instructions, Part A Q1–25 (30 marks): Q1–9 multiple choice, Q10–14 true/false, Q15–18 matching, Q19–20 short numerical answers, Q21–25 challenge multiple choice; figures for Q2, Q5, Q7, Q21, Q22 | Questions 1–25 in the same order, wording, options, keys, marks and criterion tags; five figures rebuilt as structured blocks (Q5 as a high-resolution crop of the printed chart) | Reproduced |
| Page 2 | Part B Q26–45 (70 marks), grouped under Criterion A (Q26–31, 22 marks), B (Q32–35, 15), C (Q36–40, 18), D (Q41–45, 15); printed titles, tables and figures | Questions 26–45, same order, titles, stems, tables, marks and criteria; tables/figures rebuilt as structured blocks | Reproduced |

### MYP 4 marking scheme

| Source page | Content checked | Status |
|---|---|---|
| Page 1 | Part A answer key Q1–25 and the true/false/matching decisions | Every key matches |
| Page 2 | Q26–27 model answers and mark allocations | Matches |
| Page 3 | Q28–32 model answers, boundaries, midpoints, mean, σ and outlier pattern | Matches |
| Page 4 | Q33–36 scaling/shifting, grouping bias, skewness and back-to-back stem-and-leaf | Matches |
| Page 5 | Q37–41 grouped table, histogram critique, box-plot comparison, language precision and mini-grid demand | Matches |
| Page 6 | Q42–45 quality control, athletics, courier and maize decisions | Matches |

### MYP 5 student paper

| Source page | Source content | Platform record | Status |
|---|---|---|---|
| Page 1 | Header, instructions, Part A printed Q1–19 (30 marks); graphs for printed Q4, Q10, Q13, Q14, Q17; tables for printed Q9 | Platform positions 1–19 in the same order; five structured graphs and one structured table | Reproduced |
| Page 2 | Part B printed Q1–16 (70 marks), under Criterion A (Q1–5, 22 marks), B (Q6–8, 16), C (Q9–12, 16), D (Q13–16, 16) | Platform positions 20–35; both the printed number (1–16) and the paper position are stored; titles, tables and graphs preserved | Reproduced |

### MYP 5 marking scheme

| Source page | Content checked | Status |
|---|---|---|
| Page 1 | Part A key printed Q1–19 | Every key matches |
| Page 2 | Part B printed Q1–7 model answers and mark allocations | Matches |
| Page 3 | Printed Q8–15 model answers and financial/series calculations | Matches |
| Page 4 | Printed Q16 model answers and advice | Matches |

## 2. Independent re-solve — MYP 4

Each result below was recomputed from the printed data, without copying the
marking scheme. “Key” is the platform's stored objective answer.

### Part A (objective, 30 marks)

| Q | Criterion | Independent result | Key |
|---|---|---|---|
| 1 | A | Body mass is continuous | C |
| 2 | C | Ordered values 18…41; median 27, range 23 | A |
| 3 | A | (12+15+11+18+15+14+20)/7 = 15 | B |
| 4 | A | Nearest-kg boundaries 14.5 and 19.5 | B |
| 5 | C | Enrolment is categorical; bar graph uses gaps | B |
| 6 | A | N = 40; 20.5th value is in 20 ≤ t < 30 | C |
| 7 | C | 40 − 22 = 18 | B |
| 8 | D | Mean 368/6 ≈ 61.33, median 71 | A |
| 9 | A | Variance 20/4 = 5, σ = √5 | B |
| 10 | A | Grouped mean is an estimate | T |
| 11 | C | Unequal widths need frequency density | F |
| 12 | B | Shifting by +10 leaves σ unchanged | T |
| 13 | A | ¾ × 120 = 90 | T |
| 14 | A | IQR ignores the maximum for N ≥ 5 | F |
| 15 | C | Stem-and-leaf keeps every raw value | T |
| 16 | A | Frequency ÷ class width | P |
| 17 | A | √(Σ(x−μ)²/N) | Q |
| 18 | C | Cumulative frequency curve | R |
| 19 | D | (15×15 + 5×21)/20 = 16.5 | 16.5 |
| 20 | D | 7×176 − 6×174 = 188 | 188 |
| 21 | D | Median 30, Q1 20, Q3 35, IQR 15 | A |
| 22 | D | 10×1.5 + 10×3.5 + 20×2 = 90 | C |
| 23 | B | (80 + 6k)/(12 + k) = 6.4 → k = 8 | B |
| 24 | D | Fence 34 + 1.5×12 = 52; 56 is an outlier | A |
| 25 | B | μᵧ = 19.0, σᵧ = 5.0 | C |

### Part B (constructed response, 70 marks)

| Q | Criterion / marks | Independent result |
|---|---|---|
| 26 | A / 3 | (a) qualitative; (b) discrete, bar graph; (c) continuous, histogram |
| 27 | A / 3 | Mode 2, median 2, range 4, mean 24/12 = 2 |
| 28 | A / 4 | Boundaries 319.5/339.5; modal and median class 340–359; Σfx = 17 275, mean 345.5 g |
| 29 | A / 4 | μ = 12; squared deviations 9,1,0,0,4,4; σ = √3 ≈ 1.73 V |
| 30 | A / 4 | Q2 275, Q1 225, Q3 325, IQR 100; CF(350) = 54 → 6 mangoes = 10% |
| 31 | A / 4 | Widths 5,10,15,20; densities 2.0,2.8,1.2,0.4; heights 4.0,5.6,2.4,0.8 cm; 14+12 = 26 patients |
| 32 | B / 4 | 7-day mean 16, median 15, IQR 4; with 64: mean 22, median 15.5, IQR 5.5; mean = 14 + x/8 |
| 33 | B / 4 | μ₂ = 15, σ₂ = √5; μ₃ = 15, σ₃ = 3√5; μ_w = aμ_x + b, σ_w = aσ_x |
| 34 | B / 4 | m_A = 23.5; m_B = 21.0; narrower classes reduce midpoint bias |
| 35 | B / 3 | X symmetric (18/18); Y positively skewed (6/22); Z negatively skewed (30/6); Q3−Q2 > Q2−Q1 |
| 36 | C / 4 | Rest median 71, range 18; post median 89, range 24 |
| 37 | C / 3 | Frequencies 7, 9, 4; midpoints 7.5, 12.5, 17.5; total 20 |
| 38 | C / 4 | Gaps, frequency instead of density, third bar too narrow; densities 0.6, 1.4, 0.6 |
| 39 | C / 4 | 9A 35/52/64/74/88, IQR 22; 9B IQR 36, range 66 |
| 40 | C / 3 | 25 is a midpoint, not an observed mode; σ ÷ N for a population, s ÷ n−1 for a sample |
| 41 | D / 3 | Mean 7.5 kWh, total 300 ≤ 315; upper-interval clustering can still exceed 315 |
| 42 | D / 3 | μ = 500.0, σ = √4.8 ≈ 2.19 > 2.00 → fail |
| 43 | D / 3 | Q1 12.5, Q3 13.5, IQR 1.0; squad 8; 12 grants, so 12.0 s guarantees a grant |
| 44 | D / 3 | All 9: mean 28, median 22; normal 8: mean 22, median 22; median best represents typical time |
| 45 | D / 3 | Beta higher mean/median; Alpha much more consistent; choose Alpha (5.5 is 2σ below its mean) |

## 3. Independent re-solve — MYP 5

### Part A (printed Q1–19, 30 marks)

| Printed Q | Platform position | Criterion | Independent result | Key |
|---|---|---|---|---|
| 1 | 1 | C | 80+40+20+10 has constant ratio ½ | C |
| 2 | 2 | A | r = 54/−162 = −⅓; u₅ = 6(−⅓) = −2 | B |
| 3 | 3 | A | 3(25) − 4(5) + 2 = 57 | D |
| 4 | 4 | A | u₁ = 14, d = −3 → uₙ = 17 − 3n; u₁₀ = −13 | A |
| 5 | 5 | A | 2 → 4 → 10 → 28 | C |
| 6 | 6 | B | Second difference constant (+2): quadratic | C |
| 7 | 7 | B | n² + 1 gives 2, 5, 10, 17, 26 | D |
| 8 | 8 | D | 16/2 × (15 + 60) = 600 | B |
| 9 | 9 | B | 2a = 4 → a = 2; p = 17, q = 47 | B |
| 10 | 10 | C | (1,27)…(4,8), r = ⅔, u₅ = 16/3 | A |
| 11 | 11 | A | d = 5, u₁ = 9, u₂₀ = 104 | C |
| 12 | 12 | D | 850 × 0.85³ = 522.006… → 522 | B |
| 13 | 13 | B | u₂ = 3, u₃ = 6, u₄ = 11, u₅ = 18; uₙ = n² − 2n + 3 | open |
| 14 | 14 | C | A₄ = G₄ = 8; S₅ = 31 | open |
| 15 | 15 | A | 81 × ((4/3)⁵ − 1)/(1/3) = 781 | D |
| 16 | 16 | A | (2m+1)² = (m−1)(7m−1) → m = 4, r = 3 | C |
| 17 | 17 | B | u₄ = 44 − 27 = 17; u₃ = 27 − 14 = 13, d = 4 | A |
| 18 | 18 | D | 3n² + 27n = 756 → n = 12 | B |
| 19 | 19 | D | P = 1 000 000; Q = 930 000; Q cheaper by 70 000 | C |

### Part B (printed Q1–16, 70 marks)

| Printed Q | Position | Criterion / marks | Independent result |
|---|---|---|---|
| 1 | 20 | A / 4 | u₁ = 4, u₄ = 19; 2n²−5n−42 = 0 → n = 6; v₂ = 9, v₃ = 15/2, v₄ = 27/4 |
| 2 | 21 | A / 5 | Lₙ = 33 − 4n, Mₙ = 3n + 5; L₉ = −3; S₁₅ = 435 |
| 3 | 22 | A / 4 | r = −3, u₁ = 6; u₇ = 4 374; −13 122 = u₈ |
| 4 | 23 | A / 4 | uₙ = 2n² − n − 2; u₁₀ = 188; n = 9 |
| 5 | 24 | A / 5 | n = 23, S₂₃ = 1 679; n = 6, S₆ = 266 |
| 6 | 25 | B / 6 | Bₙ = 2n, Tₙ = n² + 2n; C exceeds B at Stage 3; T₁₂ = 168 |
| 7 | 26 | B / 5 | 11, 19, 35, 67; Δ = 4, 8, 16, 32; uₙ = 2ⁿ⁺¹ + 3 |
| 8 | 27 | B / 5 | Aₙ = 3n + 3, Gₙ = 6(1.5)ⁿ⁻¹; G₅ exceeds A₅ by 68.75% |
| 9 | 28 | C / 4 | I geometric (r = −½), II quadratic, III arithmetic (d = 2.5); formulas/recursions correct |
| 10 | 29 | C / 4 | Σₖ₌₁¹⁴(18 − 4k) = −168; S₇ = 2(3⁷ − 1) = 4 372 |
| 11 | 30 | C / 4 | Dₙ = 2an + a + b, D₁ = 3a + b, gradient 2a; Qₙ = 3n² − 2n + 3 |
| 12 | 31 | C / 3 | X arithmetic u₅ = 1; Y geometric u₅ = 243/32; Z quadratic u₅ = 45 |
| 13 | 32 | D / 4 | u₁₂ = 133 m, S₁₂ = 1 068 m; 4n² + 41n = 1 680 → n = 16 |
| 14 | 33 | D / 5 | Eₙ = 500(0.95)ⁿ⁻¹; E₆ ≈ 386.9, E₈ ≈ 349.2; S₈ ≈ 3 365.8; Year 9 |
| 15 | 34 | D / 4 | S₁₀ = 52 827.15; interest 12 827.15 |
| 16 | 35 | D / 4 | S₈A = 2 900 000; S₈B ≈ 2 976 279; S₄A = 1 170 000; S₄B ≈ 864 844 |

## 4. Corrections made during the build

1. **Printed Part B titles.** The first import reproduced every stem, figure,
   mark and criterion but omitted the short title printed above each
   constructed-response question (for example “Comparing fleet logistics
   contracts” and “Zou irrigation canal construction”). A forward migration,
   `20261117120000_summative_a_source_titles.sql`, restores all 36 titles as the
   first, bold line of the prompt and records them in `config.paper_title`.
   No mark, key, criterion, answer, attempt or published result changed.
2. **MYP 5 Q5 arithmetic check** in the test harness initially evaluated the
   recursion one step short (18 instead of 28). The paper and platform were
   correct; the test expectation was fixed.
3. **MYP 5 Q11 arithmetic check** in the test harness used 19 instead of 9 as
   u₁ (114 instead of 104). The paper and platform were correct; the test
   expectation was fixed.
4. **No answer-key errors were found** in either paper. No question was
   reworded, renumbered, re-levelled or re-criterioned.

## 5. Rendering and figure notes

- Every mathematical expression in the student UI is a structured `mathInline`
  node (or a native table/graph). The legacy plain-text `prompt` mirror contains
  `$…$` only as a fallback; it is never rendered raw by the exam surface.
- 17 MYP 4 questions and 11 MYP 5 questions carry structured figures. MYP 4 Q5
  uses a 700 dpi crop of the printed bar chart because the question asks why the
  bars have gaps and does not use the bar values; every other figure is drawn
  from its underlying data values.
- On screens narrower than 640 px, figures expand to the full column width so
  charts remain readable on a phone.

## 6. Reproduce the checks

```bash
node scripts/test-summative-a-papers.mjs    # 112 paper/key/figure checks
node scripts/test-summative-a-grading.mjs   # 22 criterion-level grading checks
node scripts/validate-summative-a-migrations.mjs  # 36 migration invariants
```
