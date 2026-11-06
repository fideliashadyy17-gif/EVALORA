-- Sommetisation Assessment — Grade 10 (Oak International School)
--
-- Source document: "MYP 5 Mathematics — Sequences & Series E-Assessment"
-- (34 pages, supplied PDF). The assessment title follows the owner's naming,
-- not the document's own cover title; that difference is recorded, not hidden.
--
-- Fidelity rules applied:
--   * answers are the document's own key (50/50 cross-checked against the
--     marking scheme: no mismatch, no missing key);
--   * every item is 1 mark because the document states "1 mark each" — no mark
--     values are invented, and no question is reworded;
--   * the paper's superscripts that the PDF text layer flattened are restored
--     from the marking scheme itself (Q37 "a_n = 2 x 3^n", Q39 "L_n = 2^n"
--     against the distractor "L_n = 2n"); the ambiguous Q39 duplicate is
--     resolved by the document's own explanation, not by guesswork;
--   * question order and option order stay fixed, so the printed A–D key
--     remains valid (randomize_questions and randomize_options are false).
--
-- The assessment is written in four steps so that no single migration carries
-- the whole paper: questions 1–25, questions 26–50, the 200 options, then the
-- paper and the examination. The last step refuses to create the examination
-- unless all 50 questions and 200 options are present.
--
-- This step writes questions 26–50 only. Idempotent: a question whose
-- source marker and number already exist is skipped.

do $$
begin
  if not exists (select 1 from public.classes where id = '0a400000-0000-4000-8000-000000000110'
                  and organization_id = '0a400000-0000-4000-8000-000000000001') then
    raise exception 'Grade 10 — MYP 5 class not found in Oak International School; the assessment cannot be attached.';
  end if;

  with seed(n, prompt, prompt_doc, explanation, difficulty, topic, tags, criterion, level, descriptor) as (
    values
  (26, $txt$A gardener lays square flower beds made of 1 m² tiles: the first bed uses 1 tile, the second 4 tiles, the third 9 tiles and the fourth 16 tiles. How many tiles are in the 5th square bed? 1 × 1 2 × 2 3 × 3 4 × 4 …$txt$, null::jsonb, $txt$1. The beds are squares of side n tiles, so the number of tiles is n²: 1, 4, 9, 16. 2. For n = 5: 5² = 25 tiles. 3. Using differences: 1 → 4 → 9 → 16 rise by 3, 5, 7, so the next rise is 9 and 16 + 9 = 25 ✔ .

Why the other options are wrong:
A 20 comes from adding 4 to 16, as if the increases stayed the same; they grow: 3, 5, 7, then 9.
C 36 is 6², the 6th bed.
D 24 comes from adding 8 instead of 9, so the second difference was applied incorrectly.$txt$, $txt$easy$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$1-2$txt$, $txt$BASIC PATTERN INVESTIGATION$txt$),
  (27, $txt$How can you tell, from a list of terms, that a sequence is quadratic rather than linear?$txt$, null::jsonb, $txt$1. For a linear sequence the first differences are constant (for example 2, 2, 2). 2. For a quadratic sequence the first differences change by the same amount each time, so the second differences are constant and non-zero. 3. Example: 1, 4, 9, 16 has first differences 3, 5, 7 and second differences 2, 2 ✔ .

Why the other options are wrong:
A A constant ratio describes a geometric sequence, not a quadratic one.
B Constant first differences describe a linear (arithmetic) sequence.
D Increasing terms prove nothing: n² sequences can also decrease, and linear sequences increase too.$txt$, $txt$easy$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$1-2$txt$, $txt$BASIC CONCEPTUAL REASONING$txt$),
  (28, $txt$The figures show arrays of dots. Figure 1 has 2 dots, figure 2 has 6 dots and figure 3 has 12 dots. In figure n the array has n rows and n + 1 columns. Which rule gives the number of dots Dₙ in figure n? figure 1 figure 2 figure 3 …$txt$, null::jsonb, $txt$1. An array with n rows and n + 1 columns contains n(n + 1) dots. 2. Expanding: n(n + 1) = n² + n. 3. Check: n = 1 → 2, n = 2 → 6, n = 3 → 12 ✔ . The first differences 4, 6 have a constant second difference of 2, which matches the n² term.

Why the other options are wrong:
A n(n + 1) ÷ 2 gives 1, 3, 6: this is the triangular-number rule, exactly half the array.
B n² + 1 gives 2, 5, 10: the extra column of dots was not counted.
C 2n² gives 2, 8, 18: it doubles the square instead of adding n.$txt$, $txt$medium$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$3-4$txt$, $txt$MEDIUM PATTERN INVESTIGATION$txt$),
  (29, $txt$The area of a pond covered by algae is measured every week: 5 m², 8 m², 13 m², 20 m². The measurements form a quadratic sequence. What is the constant second difference?
week: 1, 2, 3, 4
algae area (m²): 5, 8, 13, 20$txt$, $txt${"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The area of a pond covered by algae is measured every week: 5 m², 8 m², 13 m², 20 m². The measurements form a quadratic sequence. What is the constant second difference?"}]}, {"type": "table", "content": [{"type": "tableRow", "content": [{"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "week"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "3"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "algae area (m²)"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "5"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "8"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "13"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "20"}]}]}]}]}]}$txt$::jsonb, $txt$1. First differences: 8 − 5 = 3, 13 − 8 = 5, 20 − 13 = 7. 2. Second differences: 5 − 3 = 2 and 7 − 5 = 2. 3. The constant second difference is 2 (which is why the rule contains n², since 2 ÷ 2 = 1).

Why the other options are wrong:
A 1 is the coefficient of n² in the rule (second difference ÷ 2), not the second difference itself.
B 3 is the first difference, between the first two measurements.
D 5 is one of the first differences, taken from the middle of the list.$txt$, $txt$medium$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (30, $txt$Four sequences are described by what happens between their terms. Which one is quadratic?$txt$, null::jsonb, $txt$1. A quadratic sequence has first differences that change by a constant amount. 2. For 3, 5, 7, 9 the second differences are 5 − 3 = 2, 7 − 5 = 2, 9 − 7 = 2 ✔ constant and non-zero. 3. So the sequence with first differences 3, 5, 7, 9 is quadratic (for example 2, 5, 10, 17, 26 with rule n² + 1).

Why the other options are wrong:
A Constant first differences (4, 4, 4, 4) mean the sequence is linear, with second differences equal to zero.
B Here the differences double (1, 2, 4, 8), so the second differences are 1, 2, 4 — not constant.
C A constant ratio of 2 describes a geometric sequence.$txt$, $txt$medium$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (31, $txt$Find the nth term of the quadratic sequence 3, 9, 17, 27, 39, …$txt$, null::jsonb, $txt$1. First differences: 6, 8, 10, 12. Second difference: 2, so a = 2 ÷ 2 = 1 and the rule starts with n². 2. Subtract n² from each term: 3 − 1 = 2, 9 − 4 = 5, 17 − 9 = 8, 27 − 16 = 11. The remainders form the linear sequence 2, 5, 8, 11 with difference 3. 3. So b = 3 and the constant is 2 − 3 = −1: uₙ = n² + 3n − 1. 4. Check: n = 5 → 25 + 15 − 1 = 39 ✔ .

Why the other options are wrong:
A The first difference 6 was used as the coefficient of n instead of the difference of the remainders (3).
B The first term 3 was used as the constant, so every value is 4 too large.
D The second difference 2 was used directly as the coefficient of n²; it must be halved.$txt$, $txt$hard$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING PROCEDURAL FLUENCY / MULTI-STEP$txt$),
  (32, $txt$A ball is dropped from a tower. Its height above the ground, in metres, is modelled by h = 100 − 5t², where t is the time in seconds. The heights recorded at each whole second form a quadratic sequence. At which recorded time is the ball first below 30 m?$txt$, null::jsonb, $txt$1. Evaluate the model at each whole second: t = 0 → 100, t = 1 → 95, t = 2 → 80, t = 3 → 55, t = 4 → 20. 2. The heights fall by 5, 15, 25, 35 — the first differences change by 10 each time, so the sequence is quadratic. 3. 30 m is passed between t = 3 (55 m) and t = 4 (20 m), so the first recorded time below 30 m is t = 4 s.

Why the other options are wrong:
A At t = 2 s the ball is still at 80 m.
C At t = 5 s the model gives 100 − 125 = −25 m, which is impossible — the ball has already landed.
D At t = 3 s the ball is at 55 m, which is still above 30 m.$txt$, $txt$medium$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (33, $txt$At a market meeting, every trader shakes hands exactly once with every other trader. With 2, 3, 4 and 5 traders there are 1, 3, 6 and 10 handshakes — a quadratic sequence. A student says the rule is Hₙ = n² − n. Which statement is correct?$txt$, null::jsonb, $txt$1. Test the student’s rule: n² − n gives 2² − 2 = 2 handshakes for 2 traders, but there is only 1. The rule counts every pair twice. 2. Correct reasoning: each of the n traders shakes hands with n − 1 others, which counts each handshake twice, so Hₙ = n(n − 1) ÷ 2. 3. Check: 1, 3, 6, 10 for n = 2, 3, 4, 5 ✔ . First differences 2, 3, 4 and second difference 1, consistent with Hₙ = 0.5n² − 0.5n.

Why the other options are wrong:
A n(n + 1) ÷ 2 gives 3, 6, 10, 15: this is the sequence shifted by one trader.
C The second differences of 1, 3, 6, 10 are 1, not 2 — and the student’s rule gives 2, 6, 12, 20, which does not match the data.
D n² would mean each trader also shakes hands with themselves and counts pairs twice.$txt$, $txt$hard$txt$, $txt$Quadratic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$quadratic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$),
  (34, $txt$A short film is shared in a neighbourhood. It gets 5 views on day 1, 20 views on day 2, 80 views on day 3 and 320 views on day 4. The daily totals form a geometric sequence. What is the common ratio?$txt$, null::jsonb, $txt$1. The common ratio is found by dividing a term by the term before it. 2. 20 ÷ 5 = 4, 80 ÷ 20 = 4 and 320 ÷ 80 = 4. 3. So r = 4: the number of views is multiplied by 4 each day.

Why the other options are wrong:
B 5 is the first term, not the ratio.
C 16 is 80 ÷ 5: terms two positions apart were compared.
D 15 is 20 − 5: a difference was used where a ratio belongs.$txt$, $txt$easy$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (35, $txt$A geometric sequence has first term 3 and common ratio 2. What is the 6th term?$txt$, null::jsonb, $txt$1. Use aₙ = a₁ × rⁿ⁻¹. 2. a₆ = 3 × 2⁶⁻¹ = 3 × 2⁵ = 3 × 32 = 96. 3. Listing to check: 3, 6, 12, 24, 48, 96 ✔ .

Why the other options are wrong:
B 64 is 2⁶: the power of the ratio was written without multiplying by the first term 3.
C 48 is 3 × 2⁴, the 5th term: one multiplication by 2 too few.
D 192 is 3 × 2⁶, the 7th term.$txt$, $txt$easy$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC PROCEDURAL FLUENCY$txt$),
  (36, $txt$Four situations are described by their first four values. Which one is a geometric sequence?$txt$, null::jsonb, $txt$1. A geometric sequence has a constant ratio between consecutive terms. 2. For the ball: 50 ÷ 100 = 0.5, 25 ÷ 50 = 0.5, 12.5 ÷ 25 = 0.5 ✔ — the ratio is r = 0.5 (the ball keeps half its height at each bounce). 3. The running distances add 4 km (arithmetic); the areas grow by 6, 10, 14 whose differences are constant 4 (quadratic, 2n²); the rice prices have no constant ratio (0, 1 000, 0).

Why the other options are wrong:
A Adding 4 each time is an arithmetic rule, not a geometric one.
B 2, 8, 18, 32 is 2n²: the ratios 4, 2.25, 1.78 are not constant, and the second differences are.
C There is neither a constant difference nor a constant ratio here.$txt$, $txt$easy$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION / PATTERN INVESTIGATION$txt$),
  (37, $txt$A student writes the explicit rule of the geometric sequence 2, 6, 18, 54, … as aₙ = 2 × 3ⁿ. What is wrong with this rule?$txt$, null::jsonb, $txt$1. Test the rule at n = 1: 2 × 3¹ = 6. But the first term of the sequence is 2. 2. Each term of the real sequence is obtained by multiplying the previous one by 3, so the ratio 3 is right, but the starting value must not be multiplied an extra time. 3. Correct rule: aₙ = 2 × 3ⁿ⁻¹. Check: a₁ = 2, a₂ = 6, a₃ = 18, a₄ = 54 ✔ .

Why the other options are wrong:
B This swaps the first term and the ratio: 3 × 2ⁿ gives 6, 12, 24, which is a doubling sequence.
C The terms increase, so multiplying by 3 is correct; dividing would give a decreasing sequence.
D The student did not test n = 1: the rule produces 6, 18, 54, 162 — the sequence shifted by one place.$txt$, $txt$medium$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (38, $txt$A culture of bacteria doubles every hour, starting from 250 bacteria at hour 0. How many bacteria are there after 5 hours?$txt$, null::jsonb, $txt$1. Doubling every hour means a common ratio of 2, with first value 250 at hour 0. 2. After n hours the count is 250 × 2ⁿ. 3. For n = 5: 250 × 2⁵ = 250 × 32 = 8 000 bacteria.

Why the other options are wrong:
A 4 000 is 250 × 2⁴, the count after 4 hours.
C 1 500 comes from adding 250 five times (250 × 6) — linear thinking in a doubling situation.
D 16 000 is 250 × 2⁶, the count after 6 hours.$txt$, $txt$medium$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (39, $txt$A sheet of paper is folded in half and the number of layers is recorded after each fold: 2, 4, 8, 16. Which rule gives the number of layers Lₙ after n folds?
number of folds n: 1, 2, 3, 4
Lₙ (layers): 2, 4, 8, 16$txt$, $txt${"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "A sheet of paper is folded in half and the number of layers is recorded after each fold: 2, 4, 8, 16. Which rule gives the number of layers Lₙ after n folds?"}]}, {"type": "table", "content": [{"type": "tableRow", "content": [{"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "number of folds n"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "3"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Lₙ (layers)"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "8"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "16"}]}]}]}]}]}$txt$::jsonb, $txt$1. Every fold doubles the number of layers, so the rule is geometric with ratio 2. 2. After 1 fold there are 2 layers, after 2 folds 4 layers: Lₙ = 2ⁿ. 3. Check: n = 3 → 8 ✔ , n = 4 → 16 ✔ .

Why the other options are wrong:
A Lₙ = 2ⁿ⁻¹ gives 1 layer for the first fold — an index error of one place.
B Lₙ = 2n gives 2, 4, 6, 8: doubling once is not the same as multiplying by 2 repeatedly.
D Lₙ = n² gives 1, 4, 9, 16: the first and third values do not match.$txt$, $txt$medium$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$3-4$txt$, $txt$MEDIUM PATTERN INVESTIGATION$txt$),
  (40, $txt$A motorbike is bought for 800 000 FCFA. Every year it loses 15% of its value. What is its value at the end of the 3rd year?$txt$, null::jsonb, $txt$1. Losing 15% means keeping 85%, so each year the value is multiplied by r = 0.85. 2. Value after 3 years: 800 000 × 0.85³. 3. 0.85³ = 0.614125, therefore 800 000 × 0.614125 = 491 300 FCFA. 4. Step by step: 800 000 → 680 000 → 578 000 → 491 300 ✔ .

Why the other options are wrong:
A 578 000 FCFA is the value after only 2 years (0.85²).
B 440 000 FCFA comes from subtracting 15% of the original price three times (800 000 − 3 × 120 000); the decrease is calculated on the value of the year, not on the original price.
C 417 605 FCFA is the value after 4 years (0.85⁴).$txt$, $txt$medium$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (41, $txt$The geometric sequence 6, 18, 54, … contains one term equal to 13 122. Which term number is it?$txt$, null::jsonb, $txt$1. First term a₁ = 6, ratio r = 18 ÷ 6 = 3, so aₙ = 6 × 3ⁿ⁻¹. 2. Set 6 × 3ⁿ⁻¹ = 13 122 → 3ⁿ⁻¹ = 13 122 ÷ 6 = 2 187. 3. Powers of 3: 3⁶ = 729, 3⁷ = 2 187, so n − 1 = 7 and n = 8. 4. Check: a₈ = 6 × 37 = 6 × 2 187 = 13 122 ✔ .

Why the other options are wrong:
B The 9th term is 6 × 3⁸ = 39 366, one multiplication too many.
C The 6th term is 6 × 3⁵ = 1 458.
D Reporting 7 comes from stopping at the exponent n − 1 = 7 and forgetting to add 1 for the position.$txt$, $txt$hard$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING MULTI-STEP$txt$),
  (42, $txt$In 2020, two neighbouring villages each have 12 000 people. Village A gains 500 people every year, while village B grows by 3% every year. Which statement correctly compares their populations in 2030?$txt$, null::jsonb, $txt$1. Village A is arithmetic: P = 12 000 + 10 × 500 = 17 000 people in 2030. 2. Village B is geometric: P = 12 000 × 1.03¹⁰ ≈ 12 000 × 1.3439 ≈ 16 127 people in 2030. 3. So in 2030 village A is still larger. Because B’s increase is proportional, its yearly gains grow: 3% passes 500 people once the population is above about 16 667, and B overtakes A after 23 years (about 23 683 against 23 500). 4. This shows why a fixed increase can win in the short run even when the other model grows multiplicatively.

Why the other options are wrong:
A This is a guess without calculation: percentage growth only overtakes a fixed growth after enough time.
B 3% of 12 000 is 360, not 500 — and from the second year the percentage applies to a larger population.
C Both villages started at 12 000, but the two models add different amounts over 10 years.$txt$, $txt$hard$txt$, $txt$Geometric Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$geometric-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$),
  (43, $txt$Kadi reads 4 pages on the first day, and on each following day she reads 3 more pages than the day before. How many pages does she read in total during the first 10 days?$txt$, null::jsonb, $txt$1. The daily page counts form an arithmetic sequence: a₁ = 4, d = 3, n = 10. 2. Last term: a₁₀ = 4 + (10 − 1) × 3 = 31. 3. Sum: S₁₀ = n ÷ 2 × (a₁ + a₁₀) = 10 ÷ 2 × (4 + 31) = 5 × 35 = 175 pages.

Why the other options are wrong:
B 310 comes from multiplying the number of days by the last term (10 × 31) instead of by the average of the first and last terms.
C 190 comes from a₁₀ = 34 (using n instead of n − 1) in 5 × (4 + 34).
D 350 comes from forgetting to halve: 10 × 35.$txt$, $txt$easy$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (44, $txt$What is the sum of the first 20 terms of the arithmetic sequence with first term 5 and common difference 4?$txt$, null::jsonb, $txt$1. a₁ = 5, d = 4, n = 20. Last term: a₂₀ = 5 + 19 × 4 = 81. 2. S₂₀ = 20 ÷ 2 × (5 + 81) = 10 × 86 = 860. 3. Using the other form: Sₙ = n ÷ 2 × [2a₁ + (n − 1)d] = 10 × [10 + 76] = 860 ✔ .

Why the other options are wrong:
B 900 comes from a₂₀ = 5 + 20 × 4 = 85 (the n versus n − 1 error) and then 10 × (5 + 85).
C 810 comes from 10 × 81: the first term was left out of the bracket.
D 1 620 comes from 20 × 81: the sum formula was used without dividing by 2.$txt$, $txt$easy$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC PROCEDURAL FLUENCY$txt$),
  (45, $txt$Which formula gives the sum of the first n terms of an arithmetic series?$txt$, null::jsonb, $txt$1. The sum of an arithmetic series is Sₙ = n ÷ 2 × (first term + last term). 2. Because the last term is aₙ = a₁ + (n − 1)d, this becomes Sₙ = n ÷ 2 × [2a₁ + (n − 1)d]. 3. Test with 3, 8, 13, … : n = 9, a₉ = 35, S₉ = 9 ÷ 2 × (3 + 35) = 171 and 9 ÷ 2 × [6 + 40] = 171 ✔ .

Why the other options are wrong:
A This is the formula for the nth term, not for a sum.
C This mixes the two formulas: the bracket should be a₁ + aₙ, that is 2a₁ + (n − 1)d, because an itself contains a₁.
D This forgets that the average of the first and last terms must be multiplied by n ÷ 2, not by n.$txt$, $txt$medium$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (46, $txt$In a tontine (a rotating savings group), 12 members pay their contribution one after another. The first member pays 12 000 FCFA and each following member pays 800 FCFA more than the member before. What is the total amount collected?$txt$, null::jsonb, $txt$1. Contributions form an arithmetic series: a₁ = 12 000, d = 800, n = 12. 2. Last contribution: a₁₂ = 12 000 + 11 × 800 = 20 800 FCFA. 3. Total: S₁₂ = 12 ÷ 2 × (12 000 + 20 800) = 6 × 32 800 = 196 800 FCFA.

Why the other options are wrong:
B 144 000 FCFA is 12 × 12 000, as if every member paid the same amount.
C 393 600 FCFA is 12 × 32 800: the bracket was multiplied by 12 instead of 12 ÷ 2.
D 201 600 FCFA comes from a₁₂ = 12 000 + 12 × 800 = 21 600 (the n versus n − 1 error).$txt$, $txt$medium$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (47, $txt$Adding the first odd numbers gives interesting totals: 1, 1 + 3, 1 + 3 + 5 and 1 + 3 + 5 + 7 equal 1, 4, 9 and 16. Which conjecture about the sum of the first n odd numbers is correct, and what is the sum of the first 25 odd numbers?
1 = 1 = 1²
1 + 3 = 4 = 2²
1 + 3 + 5 = 9 = 3²
1 + 3 + 5 + 7 = 16 = 4²$txt$, $txt${"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Adding the first odd numbers gives interesting totals: 1, 1 + 3, 1 + 3 + 5 and 1 + 3 + 5 + 7 equal 1, 4, 9 and 16. Which conjecture about the sum of the first n odd numbers is correct, and what is the sum of the first 25 odd numbers?"}]}, {"type": "table", "content": [{"type": "tableRow", "content": [{"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "odd numbers added"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "total"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "total written as a square"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1²"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1 + 3"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2²"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1 + 3 + 5"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "9"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "3²"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1 + 3 + 5 + 7"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "16"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4²"}]}]}]}]}]}$txt$::jsonb, $txt$1. The odd numbers are an arithmetic sequence with a₁ = 1 and d = 2, so aₙ = 2n − 1. 2. Sₙ = n ÷ 2 × (a₁ + aₙ) = n ÷ 2 × (1 + 2n − 1) = n ÷ 2 × 2n = n². 3. The totals 1, 4, 9, 16 are indeed 1², 2², 3², 4² ✔ , so for n = 25: 25² = 625.

Why the other options are wrong:
A n(n + 1) gives 650, which is double the correct total because the ÷ 2 of the sum formula was dropped.
C n(n + 1) ÷ 2 is the sum of the first n whole numbers (1 + 2 + 3 + …), not of the odd numbers; for n = 25 it gives 325.
D 2n − 1 is the 25th odd number itself (49), not the sum of all of them.$txt$, $txt$hard$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$5-6$txt$, $txt$CHALLENGING PATTERN INVESTIGATION$txt$),
  (48, $txt$Find the sum 7 + 11 + 15 + … + 59.$txt$, null::jsonb, $txt$1. Find the number of terms: 59 = 7 + 4(n − 1) → 4(n − 1) = 52 → n − 1 = 13 → n = 14. 2. S₁₄ = 14 ÷ 2 × (7 + 59) = 7 × 66 = 462. 3. Check by listing: 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59 — 14 terms adding to 462 ✔ .

Why the other options are wrong:
A 495 is 15 ÷ 2 × 66: one term too many were counted.
B 429 is 13 ÷ 2 × 66: only 13 terms were counted (the n − 1 confusion when solving for n).
D 924 is 14 × 66: the division by 2 was forgotten.$txt$, $txt$hard$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING MULTI-STEP$txt$),
  (49, $txt$A delivery driver drives 45 km on Monday. From Tuesday onwards she drives 6 km less than the day before, and she works from Monday to Sunday. How many kilometres does she drive during that week?$txt$, null::jsonb, $txt$1. The daily distances form an arithmetic sequence: a₁ = 45, d = −6, n = 7. 2. Last day: a₇ = 45 − 6 × 6 = 9 km (Sunday). 3. Total: S₇ = 7 ÷ 2 × (45 + 9) = 7 ÷ 2 × 54 = 189 km. 4. Check by adding: 45 + 39 + 33 + 27 + 21 + 15 + 9 = 189 ✔ .

Why the other options are wrong:
A 180 km is the total for only 6 days: 6 ÷ 2 × (45 + 15).
C 168 km comes from a₇ = 3, obtained by subtracting 6 seven times instead of six, then 7 ÷ 2 × (45 + 3).
D 378 km is 7 × 54: the sum formula was used without halving.$txt$, $txt$hard$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$),
  (50, $txt$The sum of the first n terms of an arithmetic series is given by Sₙ = 3n² + 5n. What are the first term and the common difference of this series?$txt$, null::jsonb, $txt$1. The first term is the sum of the first 1 term: a₁ = S₁ = 3(1)² + 5(1) = 8. 2. The second term is a₂ = S₂ − S₁ = (3 × 4 + 10) − 8 = 22 − 8 = 14. 3. Common difference: d = 14 − 8 = 6. 4. Check: the series 8 + 14 + 20 + … has S₃ = 3 ÷ 2 × [2(8) + 2(6)] = 42 and 3(9) + 5(3) = 42 ✔ .

Why the other options are wrong:
A The first term is right but the coefficient 3 was taken as the difference; in Sₙ = n ÷ 2[2a₁ + (n − 1)d] the coefficient of n² is d ÷ 2.
B The coefficients 3 and 5 of the formula were read straight out as the difference and the first term.
D 3 is really d ÷ 2 (the coefficient of n²) and 10 is the constant 2a₁ − d inside the bracket; neither of them is a term of the series.$txt$, $txt$hard$txt$, $txt$Arithmetic Series$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-series$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$5-6$txt$, $txt$CHALLENGING CONCEPTUAL REASONING / MULTI-STEP$txt$)
  )
  insert into public.questions
    (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags,
     status, review_status, config)
  select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.prompt_doc, s.explanation,
         1, s.difficulty, s.topic, s.tags, 'published', 'approved',
         jsonb_build_object('source', 'myp5-sequences-and-series-e-assessment', 'question_number', s.n,
                            'criterion', s.criterion, 'criterion_level', s.level,
                            'descriptor', s.descriptor)
    from seed s
   where not exists (
     select 1 from public.questions q
      where q.organization_id = '0a400000-0000-4000-8000-000000000001'
        and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'
        and (q.config ->> 'question_number')::int = s.n
   );
end $$;
