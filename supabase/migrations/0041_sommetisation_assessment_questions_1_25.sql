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
--   * question order and option order stay fixed, so the printed A-D key
--     remains valid (randomize_questions and randomize_options are false).
--
-- The assessment is written in four steps so that no single migration carries
-- the whole paper: questions 1-25, questions 26-50, the 200 options, then the
-- paper and the examination. The last step refuses to create the examination
-- unless all 50 questions and 200 options are present.
--
-- This step writes questions 1–25 only. Idempotent: a question whose
-- source marker and number already exist is skipped.

insert into public.questions
  (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.prompt_doc, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved',
       jsonb_build_object('source', 'myp5-sequences-and-series-e-assessment',
                          'question_number', s.n,
                          'criterion', s.criterion,
                          'criterion_level', s.level,
                          'descriptor', s.descriptor)
  from (values
  (1, $txt$A sequence is defined by u₁ = 4 and uₙ₊₁ = uₙ + 3. What is the value of u₄?$txt$, null::jsonb, $txt$1. The recursive rule says: each term is the term before it plus 3, and the first term is 4. 2. u₁ = 4 → u₂ = 4 + 3 = 7 → u₃ = 7 + 3 = 10 → u₄ = 10 + 3 = 13. 3. So u₄ = 13.

Why the other options are wrong:
A 10 is u₃: the rule was applied only twice instead of three times.
C 16 is u₅: the rule was applied one time too many.
D 7 is u₂: two applications of the rule were skipped.$txt$, $txt$easy$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC PROCEDURAL FLUENCY$txt$),
  (2, $txt$Which explicit formula describes the sequence defined by u₁ = 5 and uₙ₊₁ = uₙ + 4?$txt$, null::jsonb, $txt$1. The rule adds 4 each time, so the difference is 4 and the nth term must contain 4n. 2. Starting value: uₙ = 5 + 4(n − 1) = 5 + 4n − 4 = 4n + 1. 3. Check: n = 1 gives 5 ✔ and n = 2 gives 9 ✔ (the sequence is 5, 9, 13, …).

Why the other options are wrong:
A n + 4 adds 1 each time instead of 4 — the difference is wrong.
B 5n + 4 swaps the first term and the difference: it gives 9, 14, 19, … (wrong difference and wrong start).
C 4n + 5 has the right difference but keeps 5 as the constant, so it gives 9 for n = 1: the first term was not corrected for.$txt$, $txt$easy$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC CONCEPTUAL REASONING$txt$),
  (3, $txt$Two traders in a market launch a price alert. Each of them passes it to 3 new people, and every one of those people passes it to 3 new people in the next hour, so the number of newly informed people is 2, 6, 18, 54, … A rule for this sequence is u₁ = 2 and uₙ = 3 × uₙ₋₁ for n ≥ 2. What is u₅?$txt$, null::jsonb, $txt$1. Multiply by 3 at each step, starting from 2. 2. u₁ = 2, u₂ = 6, u₃ = 18, u₄ = 54, u₅ = 162. 3. Equivalently uₙ = 2 × 3ⁿ⁻¹, so u₅ = 2 × 3⁴ = 2 × 81 = 162. In the context, 162 people are newly informed in the fifth round.

Why the other options are wrong:
A 54 is u₄: the rule was applied one time too few (n versus n − 1).
B 243 is 3⁵: the power of the ratio was used without multiplying by the starting value 2.
C 486 is u₆: one extra multiplication by 3.$txt$, $txt$easy$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (4, $txt$A student writes the explicit formula for the sequence 7, 11, 15, 19, … as uₙ = 7 + 4n. Which statement best describes the error?$txt$, null::jsonb, $txt$1. Test the formula at n = 1: 7 + 4(1) = 11, but the first term of the sequence is 7. 2. The formula therefore produces the sequence 11, 15, 19, 23, … — every term is one place too far. 3. The correct explicit rule is uₙ = 7 + 4(n − 1) = 4n + 3, which gives 7, 11, 15, 19 for n = 1, 2, 3, 4 ✔ .

Why the other options are wrong:
B The student never tested n = 1; the formula cannot be right because it gives 11 as the first term.
C The difference 4 is correct (11 − 7 = 4), so changing it to 3 only introduces a second error.
D This turns an additive rule into a multiplicative one and gives 28, 56, 84, …$txt$, $txt$medium$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (5, $txt$The explicit rule of a sequence is uₙ = 6n − 1. Which recursive definition produces exactly the same sequence?$txt$, null::jsonb, $txt$1. Write the first terms from the explicit rule: 6(1) − 1 = 5, 6(2) − 1 = 11, 6(3) − 1 = 17. 2. First term 5; each term is 6 more than the term before. 3. So the recursive definition is u₁ = 5, uₙ = uₙ₋₁ + 6.

Why the other options are wrong:
A Multiplying by 6 (or 3) describes a geometric rule, but the sequence grows by adding 6.
B The constant −1 is the value at n = 0, not the first term of the sequence.
C The coefficient 6 was used as the first term; this gives 6, 12, 18, … instead of 5, 11, 17.$txt$, $txt$medium$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$3-4$txt$, $txt$MEDIUM PROCEDURAL FLUENCY$txt$),
  (6, $txt$The figures are made with matchsticks: figure 1 uses 4 sticks, figure 2 uses 7 sticks and figure 3 uses 10 sticks. Each new figure adds one more square to the row. Which recursive rule gives the number of sticks Sₙ in figure n? figure 1 · 4 sticks figure 2 · 7 sticks figure 3 · 10 sticks …$txt$, null::jsonb, $txt$1. Figure 1 is one square: 4 sticks. 2. To add a square to the row, one side is shared with the previous square, so only 3 new sticks are needed: 7 − 4 = 3 and 10 − 7 = 3. 3. Recursive rule: S₁ = 4 and Sₙ = Sₙ₋₁ + 3 (explicit form: Sₙ = 3n + 1).

Why the other options are wrong:
A This treats the pattern as geometric (multiplying by 3): 4, 12, 36, …
C A new square needs 4 sticks only when it is not joined to another square; the shared side was not removed.
D The first term and the increase were swapped: this rule gives 3, 7, 11, …$txt$, $txt$medium$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$3-4$txt$, $txt$MEDIUM PATTERN INVESTIGATION$txt$),
  (7, $txt$A mobile data subscription costs 12 000 FCFA in the first month. From the second month onwards, the price increases by 1 500 FCFA every month. Which recursive rule gives the monthly price uₙ, in FCFA?$txt$, null::jsonb, $txt$1. Month 1 is the starting value: u₁ = 12 000. 2. Each month the price is the previous price plus 1 500: uₙ = uₙ₋₁ + 1 500. 3. Check: u₂ = 13 500, u₃ = 15 000 ✔ — the prices increase by a fixed amount, not by a fixed ratio.

Why the other options are wrong:
A This is an explicit rule, not a recursive one, and it gives 12 000 + 1 500(1) = 13 500 for month 1. The correct explicit rule is uₙ = 12 000 + 1 500(n − 1).
C Multiplying by 1 500 would give 18 000 000 FCFA in month 2 — a ratio was used where a difference belongs.
D The two amounts were exchanged: 1 500 is the increase, not the first term.$txt$, $txt$medium$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (8, $txt$A sequence is defined by u₁ = 3 and uₙ₊₁ = 2uₙ − 1. What is u₅?$txt$, null::jsonb, $txt$1. Apply the rule step by step, doubling first and then subtracting 1. 2. u₂ = 2(3) − 1 = 5; u₃ = 2(5) − 1 = 9; u₄ = 2(9) − 1 = 17; u₅ = 2(17) − 1 = 33. 3. So u₅ = 33. (Notice the closed form here is uₙ = 2ⁿ + 1: 2⁵ + 1 = 33 ✔ .)

Why the other options are wrong:
A 65 is u₆: one application of the rule too many.
B 31 is 25 − 1: the subtraction was applied in the wrong direction when the pattern was guessed.
D 17 is u₄: the rule was applied only three times instead of four.$txt$, $txt$hard$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING MULTI-STEP$txt$),
  (9, $txt$Two rules are given for the same kind of sequence: uₙ = 5n − 2 and v₁ = 3, vₙ₊₁ = vₙ + 5. Which statement is true?$txt$, null::jsonb, $txt$1. Turn the recursive rule into an explicit one: vₙ = 3 + 5(n − 1) = 3 + 5n − 5 = 5n − 2. 2. This is exactly the rule for uₙ. 3. Check with terms: u: 3, 8, 13, 18 … and v: 3, 8, 13, 18 … — identical.

Why the other options are wrong:
A This comes from expanding 3 + 5(n − 1) as 5n − 3; the constant is −2 for both sequences, so there is no gap of 2.
B A recursive rule is not a different sequence: both have first term 3 and difference 5.
D Parity of n is irrelevant — the two formulas are algebraically identical.$txt$, $txt$hard$txt$, $txt$Recursive and Explicit Formulas$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$recursive-and-explicit-formulas$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$5-6$txt$, $txt$CHALLENGING CONCEPTUAL REASONING$txt$),
  (10, $txt$A weather balloon begins to descend at a constant rate. The first reading of its height is 800 m and every reading after that is 150 m lower. The readings form a linear sequence. What is the height at the 6th reading?$txt$, null::jsonb, $txt$1. First term u₁ = 800, common difference d = −150. 2. uₙ = 800 − 150(n − 1), so u₆ = 800 − 150 × 5 = 800 − 750 = 50. 3. The 6th reading is at 50 m.

Why the other options are wrong:
B 200 m is the 5th reading: only four decreases were taken (n − 1 counted as 4).
C −100 m is the 7th reading: one decrease too many.
D 350 m is the 4th reading: three decreases instead of five.$txt$, $txt$easy$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (11, $txt$The table gives the first four terms of a linear sequence. Which rule gives its nth term?
n: 1, 2, 3, 4
uₙ: 3, 5, 7, 9$txt$, $txt${"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "The table gives the first four terms of a linear sequence. Which rule gives its nth term?"}]}, {"type": "table", "content": [{"type": "tableRow", "content": [{"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "n"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "1"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "2"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "3"}]}]}, {"type": "tableHeader", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "4"}]}]}]}, {"type": "tableRow", "content": [{"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "uₙ"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "3"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "5"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "7"}]}]}, {"type": "tableCell", "attrs": {"colspan": 1, "rowspan": 1}, "content": [{"type": "paragraph", "content": [{"type": "text", "text": "9"}]}]}]}]}]}$txt$::jsonb, $txt$1. From the table, the terms increase by 2 each time, so the rule contains 2n. 2. At n = 1 the term is 3, and 2(1) = 2, so 1 must be added: uₙ = 2n + 1. 3. Check every row: n = 1 → 3, n = 2 → 5, n = 3 → 7, n = 4 → 9 ✔ .

Why the other options are wrong:
B 3n gives 3, 6, 9, 12: here 3 (the first term) was used as the multiplier.
C n + 2 gives 3, 4, 5, 6: it only matches the first term because the difference 2 was used as the constant.
D 2n − 1 gives 1, 3, 5, 7: the difference is right but the whole sequence is shifted down by 2.$txt$, $txt$easy$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-B$txt$]::text[], $txt$B$txt$, $txt$1-2$txt$, $txt$BASIC PATTERN INVESTIGATION$txt$),
  (12, $txt$The terms of a linear sequence are plotted as points (n, uₙ) and all the points lie on the line u = 4n − 1. What is the first term of the sequence?$txt$, null::jsonb, $txt$1. A term of the sequence corresponds to n = 1, 2, 3, … The first term is the value of the line at n = 1. 2. u = 4(1) − 1 = 3. 3. The gradient 4 is the common difference, so the terms are 3, 7, 11, …

Why the other options are wrong:
A 4 is the gradient (the common difference), not a term.
C 7 is the second term u₂.
D −1 is the u-intercept, the value at n = 0, which is not a term of the sequence.$txt$, $txt$medium$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (13, $txt$A taxi charges a fixed pickup fee of 1 000 FCFA and then 500 FCFA for every kilometre travelled. The fares for trips of 1 km, 2 km, 3 km, … form a linear sequence. What is the fare for a trip of 9 km?$txt$, null::jsonb, $txt$1. Fare for n km: Cₙ = 1 000 + 500n (the fixed fee plus 500 FCFA per kilometre). 2. For n = 9: C₉ = 1 000 + 500 × 9 = 1 000 + 4 500 = 5 500. 3. As a sequence the fares are 1 500, 2 000, 2 500, … with first term 1 500 and difference 500, and u₉ = 1 500 + 500(9 − 1) = 5 500 ✔ .

Why the other options are wrong:
A 5 000 FCFA comes from treating the distance as 8 intervals (n − 1) instead of 9 kilometres.
C 6 000 FCFA is the fare for 10 km.
D 4 500 FCFA comes from forgetting the fixed pickup fee.$txt$, $txt$medium$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (14, $txt$A linear sequence has u₄ = 19 and u₉ = 44. Which pair gives the first term and the common difference?$txt$, null::jsonb, $txt$1. From position 4 to position 9 there are 9 − 4 = 5 steps, and the terms rise by 44 − 19 = 25. 2. Common difference d = 25 ÷ 5 = 5. 3. Go back from u₄ to u₁ (three steps): u₁ = 19 − 3 × 5 = 4. 4. Check: u₉ = 4 + 8 × 5 = 44 ✔ .

Why the other options are wrong:
A d = 25 is the total change over five positions; it was not divided by 5.
B u₁ = 19 takes u₄ as though it were the first term.
D u₁ = 14 comes from stepping back only one term from u₄ instead of three.$txt$, $txt$hard$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING MULTI-STEP$txt$),
  (15, $txt$A water tank is drained at a constant rate and its volume is recorded every 10 minutes. The first reading is 3 200 L and each following reading is 150 L lower. Which is the first reading below 1 500 L?$txt$, null::jsonb, $txt$1. Model: uₙ = 3 200 − 150(n − 1). 2. Solve uₙ < 1 500: 3 200 − 150(n − 1) < 1 500 → 150(n − 1) > 1 700 → n − 1 > 11.33 → n > 12.33. 3. The first whole position satisfying this is n = 13: u₁₃ = 3 200 − 150 × 12 = 1 400 L ✔ (while u₁₂ = 1 550 L is still above 1 500 L).

Why the other options are wrong:
A The 12th reading is 1 550 L, which is still above 1 500 L: 1 700 ÷ 150 = 11.33 was rounded down to 11 steps and one reading was added.
B The 11th reading is 1 700 L — the error is to take 11 steps (1 700 L of decrease) and stop there without checking the value.
C The 14th reading (1 250 L) is indeed below 1 500 L, but it is not the first one to be.$txt$, $txt$hard$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$),
  (16, $txt$Two linear sequences are uₙ = 4n + 3 and vₙ = 4n − 5. Which statement is correct?$txt$, null::jsonb, $txt$1. Both rules have the same coefficient of n (4), so both sequences increase by 4 per step: u: 7, 11, 15, 19 … and v: 3, 7, 11, 15 … 2. The difference between matching terms is (4n + 3) − (4n − 5) = 8, which does not depend on n. 3. Setting 4n + 3 = 4n − 5 gives 3 = −5, which is impossible: the two lines are parallel, so they never meet.

Why the other options are wrong:
A u₂ = 11 but v₂ = 3; the terms are not equal — the sequence v simply repeats values that u took earlier.
C The rate of increase is the coefficient of n, which is 4 for both sequences. The constant term does not affect speed.
D This comes from writing 3 − (−5) = 8 and calling the answer n. Solving 4n + 3 = 4n − 5 gives no solution at all.$txt$, $txt$hard$txt$, $txt$Linear Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$linear-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$5-6$txt$, $txt$CHALLENGING CONCEPTUAL REASONING$txt$),
  (17, $txt$A freezer stops working and its temperature rises at a constant rate. The readings, in °C, are −15, −9, −3, 3, … What is the common difference of this arithmetic sequence?$txt$, null::jsonb, $txt$1. The common difference is found by subtracting a term from the term that follows it. 2. −9 − (−15) = 6, −3 − (−9) = 6 and 3 − (−3) = 6. 3. So d = 6 °C: the temperature rises 6 °C every hour.

Why the other options are wrong:
A 12 °C is the change over two intervals (−3 − (−15)), not over one.
B −6 °C is a sign error: the readings increase, they do not decrease.
C 18 °C is the change over three intervals (3 − (−15)).$txt$, $txt$easy$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (18, $txt$On the first day of the season a fruit seller sells 7 baskets of mangoes. Every day after that he sells 4 baskets more than the day before. How many baskets does he sell on the 12th day?$txt$, null::jsonb, $txt$1. This is an arithmetic sequence with a₁ = 7 and d = 4. 2. aₙ = a₁ + (n − 1)d, so a₁₂ = 7 + (12 − 1) × 4 = 7 + 44 = 51. 3. He sells 51 baskets on the 12th day.

Why the other options are wrong:
A 43 is 7 + 4 × 9: the 10th day, two positions too early.
B 55 is 7 + 4 × 12: the 13th day, because n was used instead of n − 1.
D 48 is 4 × 12: the first day’s 7 baskets were left out and n was used instead of n − 1.$txt$, $txt$easy$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$1-2$txt$, $txt$BASIC REAL-LIFE APPLICATION$txt$),
  (19, $txt$The nth term of an arithmetic sequence is aₙ = 19 − 3n. What are the first term and the common difference?$txt$, null::jsonb, $txt$1. Substitute n = 1: a₁ = 19 − 3(1) = 16. 2. Substitute n = 2: a₂ = 19 − 6 = 13, so d = 13 − 16 = −3. 3. The sequence is 16, 13, 10, 7, … with a₁ = 16 and d = −3.

Why the other options are wrong:
A A positive difference would describe an increasing sequence; here the terms decrease by 3.
B 19 is the value at n = 0 (the constant of the linear rule), not the first term.
D 13 is the second term a₂, not the first.$txt$, $txt$easy$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$1-2$txt$, $txt$BASIC PROCEDURAL FLUENCY$txt$),
  (20, $txt$Which term of the arithmetic sequence 3, 7, 11, … is 127?$txt$, null::jsonb, $txt$1. General term: aₙ = 3 + 4(n − 1) = 4n − 1. 2. Set it equal to 127: 4n − 1 = 127 → 4n = 128 → n = 32. 3. Check: a₃₂ = 4(32) − 1 = 127 ✔ .

Why the other options are wrong:
B 124 is 127 − 3: the subtraction was done but the result was never divided by the difference 4.
C 31 comes from (127 − 3) ÷ 4 = 31, which counts the number of steps after the first term and forgets to add 1.
D 33 is one position too far (4(33) − 1 = 131).$txt$, $txt$medium$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$3-4$txt$, $txt$MEDIUM PROCEDURAL FLUENCY$txt$),
  (21, $txt$In a stand at a stadium, the first row has 38 seats. Every row after that has 5 more seats than the row before it. How many seats are in the 20th row?$txt$, null::jsonb, $txt$1. Arithmetic sequence with a₁ = 38 and d = 5. 2. The 20th row has a₂₀ = 38 + (20 − 1) × 5 = 38 + 95 = 133 seats.

Why the other options are wrong:
A 128 is 38 + 18 × 5: only 19 steps were counted (the 19th row).
B 138 is 38 + 20 × 5: n was used instead of n − 1, so one extra row of 5 seats was added.
D 100 is 20 × 5: the 38 seats of the first row were ignored.$txt$, $txt$medium$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION$txt$),
  (22, $txt$The value of a laptop decreases by the same amount every year. After 1 year it is worth 390 000 FCFA and after 3 years it is worth 330 000 FCFA. What is the yearly decrease, and what was the original price?$txt$, null::jsonb, $txt$1. Between year 1 and year 3 there are 2 yearly steps and the value falls by 390 000 − 330 000 = 60 000. 2. Yearly decrease: 60 000 ÷ 2 = 30 000 FCFA. 3. The original price is one year before the first valuation: 390 000 + 30 000 = 420 000 FCFA. 4. Check: after 3 years, 420 000 − 3 × 30 000 = 330 000 ✔ .

Why the other options are wrong:
A 20 000 FCFA comes from dividing 60 000 by 3 (the year number) instead of by the 2-year gap.
B 60 000 FCFA is the total fall over two years; it was not divided by 2.
C The decrease is right but 390 000 FCFA is the value after 1 year, not the original price.$txt$, $txt$medium$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$3-4$txt$, $txt$MEDIUM REAL-LIFE APPLICATION / MULTI-STEP$txt$),
  (23, $txt$A student claims that the sequence with nth term aₙ = n² − n + 4 is arithmetic. Which is the correct response?$txt$, null::jsonb, $txt$1. Generate the terms: a₁ = 1 − 1 + 4 = 4, a₂ = 4 − 2 + 4 = 6, a₃ = 9 − 3 + 4 = 10, a₄ = 16 − 4 + 4 = 16. 2. First differences: 6 − 4 = 2, 10 − 6 = 4, 16 − 10 = 6. 3. The differences are not constant (they increase by 2), so the sequence is not arithmetic — it is a quadratic sequence.

Why the other options are wrong:
A Checking only a₂ − a₁ = 2 is not enough — an arithmetic sequence must have the same difference everywhere.
B The value of the first term tells us nothing about whether a sequence is arithmetic.
D 1 is the coefficient of n in the formula; it is not a common difference of the sequence.$txt$, $txt$medium$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-C$txt$]::text[], $txt$C$txt$, $txt$3-4$txt$, $txt$MEDIUM CONCEPTUAL REASONING$txt$),
  (24, $txt$The three expressions k + 2, 3k − 1 and 7k + 1, in this order, are three consecutive terms of an arithmetic sequence. What is the value of k?$txt$, null::jsonb, $txt$1. In an arithmetic sequence the difference between consecutive terms is the same, so (3k − 1) − (k + 2) = (7k + 1) − (3k − 1). 2. Simplify: 2k − 3 = 4k + 2 → −3 − 2 = 4k − 2k → −5 = 2k → k = −2.5. 3. Check with k = −2.5: the terms are −0.5, −8.5, −16.5, and each difference is −8 ✔ .

Why the other options are wrong:
A 2.5 comes from losing the minus sign in −5 = 2k.
B −0.5 comes from solving 4k + 2 = 0, which sets a difference to zero instead of equating the two differences.
C −5 comes from stopping at −5 = 2k without dividing by 2.$txt$, $txt$hard$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-A$txt$]::text[], $txt$A$txt$, $txt$5-6$txt$, $txt$CHALLENGING MULTI-STEP$txt$),
  (25, $txt$The price of a plot of land increases by the same amount every year. It was 3 500 000 FCFA in 2018 and 4 700 000 FCFA in 2022. In which year will the price first exceed 6 000 000 FCFA?$txt$, null::jsonb, $txt$1. From 2018 to 2022 there are 4 yearly steps and an increase of 4 700 000 − 3 500 000 = 1 200 000. 2. Yearly increase: d = 1 200 000 ÷ 4 = 300 000 FCFA. 3. Price in year 2018 + t: 3 500 000 + 300 000t > 6 000 000 → 300 000t > 2 500 000 → t > 8.33. 4. The first whole number of years is t = 9, which is the year 2018 + 9 = 2027, when the price is 6 200 000 FCFA. (In 2026 the price is 5 900 000 FCFA, which does not exceed 6 000 000.)

Why the other options are wrong:
B In 2026 the price is 5 900 000 FCFA — the threshold was rounded down instead of exceeded.
C 2029 comes from counting the steps from 2017 or using t = 11.
D 2028 (6 500 000 FCFA) is above the threshold but it is not the first year.$txt$, $txt$hard$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$)
  ) as s(n, prompt, prompt_doc, explanation, difficulty, topic, tags, criterion, level, descriptor)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'
      and (q.config ->> 'question_number')::int = s.n
 );
