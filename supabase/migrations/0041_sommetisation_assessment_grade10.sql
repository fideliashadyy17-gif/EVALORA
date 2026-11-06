-- Sommetisation Assessment — Grade 10 (Oak International School)
--
-- Source document: "MYP 5 Mathematics — Sequences & Series E-Assessment"
-- (34 pages, supplied PDF). The assessment title follows the owner's naming,
-- not the document's own cover title; that difference is recorded, not hidden.
--
-- What this migration writes, and nothing else:
--   * 50 single-choice questions with exactly the four options printed in the
--     paper and one keyed correct option each (grade 10 / MYP 5 class bank);
--   * the worked solution and the "why the other options are wrong" notes from
--     the document's marking scheme, stored as the question explanation;
--   * one quiz holding all 50 questions in printed order;
--   * one open examination that any holder of the link + access code may take
--     without an account, with results released immediately after submission.
--
-- Fidelity rules applied:
--   * answers are the document's own key (50/50 cross-checked against the
--     marking scheme; no mismatch, no missing key);
--   * every item is 1 mark because the document states "1 mark each" — no mark
--     values are invented, and no question is reworded;
--   * the paper's superscripts that the PDF text layer flattened are restored
--     from the marking scheme itself (Q37 "a_n = 2 x 3^n", Q39 "L_n = 2^n"
--     versus the distractor "L_n = 2n"); the ambiguous Q39 duplicate is
--     resolved by the document's own explanation, not by guesswork;
--   * question order is fixed and option order is fixed, so the printed A–D
--     key stays valid: randomize_questions and randomize_options are false.
--
-- Idempotent: if the assessment already exists in this workspace the block
-- returns without touching anything (no destructive re-seed of attempts).

do $$
declare
  v_org   uuid := '0a400000-0000-4000-8000-000000000001';  -- Oak International School
  v_class uuid := '0a400000-0000-4000-8000-000000000110';  -- Grade 10 — MYP 5
  v_existing uuid;
  v_quiz  uuid;
  v_exam  uuid;
  v_questions int;
  v_options int;
begin
  select id into v_existing
    from public.exams
   where organization_id = v_org and title = Sommetisation Assessment — Grade 10
   limit 1;
  if v_existing is not null then
    raise notice 'Sommetisation Assessment already exists (%), nothing to do.', v_existing;
    return;
  end if;

  if not exists (select 1 from public.classes where id = v_class and organization_id = v_org) then
    raise exception 'Grade 10 — MYP 5 class not found in Oak International School; the assessment cannot be attached.';
  end if;

  ---------------------------------------------------------------------------
  -- 50 questions + 200 options
  ---------------------------------------------------------------------------
  with seed(n, prompt, prompt_doc, explanation, difficulty, topic, tags, criterion, level, descriptor) as (
    values
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
D 2028 (6 500 000 FCFA) is above the threshold but it is not the first year.$txt$, $txt$hard$txt$, $txt$Arithmetic Sequences$txt$, array[$txt$myp5$txt$, $txt$sequences-and-series$txt$, $txt$e-assessment$txt$, $txt$arithmetic-sequences$txt$, $txt$criterion-D$txt$]::text[], $txt$D$txt$, $txt$5-6$txt$, $txt$CHALLENGING REAL-LIFE APPLICATION / MULTI-STEP$txt$),
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
  ),
  inserted as (
    insert into public.questions
      (organization_id, type, prompt, prompt_doc, explanation, points, difficulty, topic, tags,
       status, review_status, config)
    select v_org, 'single_choice', s.prompt, s.prompt_doc, s.explanation, 1, s.difficulty, s.topic, s.tags,
           'published', 'approved',
           jsonb_build_object('source', 'myp5-sequences-and-series-e-assessment'',
                              'question_number', s.n,
                              'criterion', s.criterion,
                              'criterion_level', s.level,
                              'descriptor', s.descriptor)
      from seed s
    returning id, (config ->> 'question_number')::int as n
  ),
  opts(n, label, position, is_correct, body) as (
    values
  (1, $txt$A$txt$, 1, false, $txt$10$txt$),
  (1, $txt$B$txt$, 2, true, $txt$13$txt$),
  (1, $txt$C$txt$, 3, false, $txt$16$txt$),
  (1, $txt$D$txt$, 4, false, $txt$7$txt$),
  (2, $txt$A$txt$, 1, false, $txt$uₙ = n + 4$txt$),
  (2, $txt$B$txt$, 2, false, $txt$uₙ = 5n + 4$txt$),
  (2, $txt$C$txt$, 3, false, $txt$uₙ = 4n + 5$txt$),
  (2, $txt$D$txt$, 4, true, $txt$uₙ = 4n + 1$txt$),
  (3, $txt$A$txt$, 1, false, $txt$54$txt$),
  (3, $txt$B$txt$, 2, false, $txt$243$txt$),
  (3, $txt$C$txt$, 3, false, $txt$486$txt$),
  (3, $txt$D$txt$, 4, true, $txt$162$txt$),
  (4, $txt$A$txt$, 1, true, $txt$The formula is shifted by one term: it gives 11 when n = 1, so it should be uₙ = 7 + 4(n − 1)$txt$),
  (4, $txt$B$txt$, 2, false, $txt$There is no error: the formula gives 7, 11, 15, 19, …$txt$),
  (4, $txt$C$txt$, 3, false, $txt$The difference is wrong; the formula should be uₙ = 7 + 3n$txt$),
  (4, $txt$D$txt$, 4, false, $txt$The 4 should be multiplied by the first term: uₙ = 7 × 4n$txt$),
  (5, $txt$A$txt$, 1, false, $txt$u₁ = 5, uₙ = 3 × uₙ₋₁$txt$),
  (5, $txt$B$txt$, 2, false, $txt$u₁ = −1, uₙ = uₙ₋₁ + 6$txt$),
  (5, $txt$C$txt$, 3, false, $txt$u₁ = 6, uₙ = uₙ₋₁ + 6$txt$),
  (5, $txt$D$txt$, 4, true, $txt$u₁ = 5, uₙ = uₙ₋₁ + 6$txt$),
  (6, $txt$A$txt$, 1, false, $txt$S₁ = 4, Sₙ = 3 × Sₙ₋₁$txt$),
  (6, $txt$B$txt$, 2, true, $txt$S₁ = 4, Sₙ = Sₙ₋₁ + 3$txt$),
  (6, $txt$C$txt$, 3, false, $txt$S₁ = 4, Sₙ = Sₙ₋₁ + 4$txt$),
  (6, $txt$D$txt$, 4, false, $txt$S₁ = 3, Sₙ = Sₙ₋₁ + 4$txt$),
  (7, $txt$A$txt$, 1, false, $txt$uₙ = 12 000 + 1 500n for n ≥ 1$txt$),
  (7, $txt$B$txt$, 2, true, $txt$u₁ = 12 000, uₙ = uₙ₋₁ + 1 500$txt$),
  (7, $txt$C$txt$, 3, false, $txt$u₁ = 12 000, uₙ = 1 500 × uₙ₋₁$txt$),
  (7, $txt$D$txt$, 4, false, $txt$u₁ = 1 500, uₙ = uₙ₋₁ + 12 000$txt$),
  (8, $txt$A$txt$, 1, false, $txt$65$txt$),
  (8, $txt$B$txt$, 2, false, $txt$31$txt$),
  (8, $txt$C$txt$, 3, true, $txt$33$txt$),
  (8, $txt$D$txt$, 4, false, $txt$17$txt$),
  (9, $txt$A$txt$, 1, false, $txt$Every term of v is 2 more than the matching term of u$txt$),
  (9, $txt$B$txt$, 2, false, $txt$The two sequences have the same first term but grow at different rates$txt$),
  (9, $txt$C$txt$, 3, true, $txt$The two rules generate the same sequence: uₙ = vₙ for every n ≥ 1$txt$),
  (9, $txt$D$txt$, 4, false, $txt$uₙ and vₙ are equal only when n is even$txt$),
  (10, $txt$A$txt$, 1, true, $txt$50 m$txt$),
  (10, $txt$B$txt$, 2, false, $txt$200 m$txt$),
  (10, $txt$C$txt$, 3, false, $txt$−100 m$txt$),
  (10, $txt$D$txt$, 4, false, $txt$350 m$txt$),
  (11, $txt$A$txt$, 1, true, $txt$uₙ = 2n + 1$txt$),
  (11, $txt$B$txt$, 2, false, $txt$uₙ = 3n$txt$),
  (11, $txt$C$txt$, 3, false, $txt$uₙ = n + 2$txt$),
  (11, $txt$D$txt$, 4, false, $txt$uₙ = 2n − 1$txt$),
  (12, $txt$A$txt$, 1, false, $txt$4$txt$),
  (12, $txt$B$txt$, 2, true, $txt$3$txt$),
  (12, $txt$C$txt$, 3, false, $txt$7$txt$),
  (12, $txt$D$txt$, 4, false, $txt$−1$txt$),
  (13, $txt$A$txt$, 1, false, $txt$5 000 FCFA$txt$),
  (13, $txt$B$txt$, 2, true, $txt$5 500 FCFA$txt$),
  (13, $txt$C$txt$, 3, false, $txt$6 000 FCFA$txt$),
  (13, $txt$D$txt$, 4, false, $txt$4 500 FCFA$txt$),
  (14, $txt$A$txt$, 1, false, $txt$u₁ = 4, d = 25$txt$),
  (14, $txt$B$txt$, 2, false, $txt$u₁ = 19, d = 5$txt$),
  (14, $txt$C$txt$, 3, true, $txt$u₁ = 4, d = 5$txt$),
  (14, $txt$D$txt$, 4, false, $txt$u₁ = 14, d = 5$txt$),
  (15, $txt$A$txt$, 1, false, $txt$the 12th reading$txt$),
  (15, $txt$B$txt$, 2, false, $txt$the 11th reading$txt$),
  (15, $txt$C$txt$, 3, false, $txt$the 14th reading$txt$),
  (15, $txt$D$txt$, 4, true, $txt$the 13th reading$txt$),
  (16, $txt$A$txt$, 1, false, $txt$u₂ = v₂, so the two sequences are equal from the second term onwards$txt$),
  (16, $txt$B$txt$, 2, true, $txt$Both increase by 4 each step and their terms always differ by 8, so no term of one sequence equals a term of the other$txt$),
  (16, $txt$C$txt$, 3, false, $txt$Sequence v increases faster than sequence u$txt$),
  (16, $txt$D$txt$, 4, false, $txt$The sequences have equal terms when n = 8$txt$),
  (17, $txt$A$txt$, 1, false, $txt$12 °C$txt$),
  (17, $txt$B$txt$, 2, false, $txt$−6 °C$txt$),
  (17, $txt$C$txt$, 3, false, $txt$18 °C$txt$),
  (17, $txt$D$txt$, 4, true, $txt$6 °C$txt$),
  (18, $txt$A$txt$, 1, false, $txt$43$txt$),
  (18, $txt$B$txt$, 2, false, $txt$55$txt$),
  (18, $txt$C$txt$, 3, true, $txt$51$txt$),
  (18, $txt$D$txt$, 4, false, $txt$48$txt$),
  (19, $txt$A$txt$, 1, false, $txt$a₁ = 16, d = 3$txt$),
  (19, $txt$B$txt$, 2, false, $txt$a₁ = 19, d = −3$txt$),
  (19, $txt$C$txt$, 3, true, $txt$a₁ = 16, d = −3$txt$),
  (19, $txt$D$txt$, 4, false, $txt$a₁ = 13, d = −3$txt$),
  (20, $txt$A$txt$, 1, true, $txt$the 32nd$txt$),
  (20, $txt$B$txt$, 2, false, $txt$the 124th$txt$),
  (20, $txt$C$txt$, 3, false, $txt$the 31st$txt$),
  (20, $txt$D$txt$, 4, false, $txt$the 33rd$txt$),
  (21, $txt$A$txt$, 1, false, $txt$128$txt$),
  (21, $txt$B$txt$, 2, false, $txt$138$txt$),
  (21, $txt$C$txt$, 3, true, $txt$133$txt$),
  (21, $txt$D$txt$, 4, false, $txt$100$txt$),
  (22, $txt$A$txt$, 1, false, $txt$20 000 FCFA and 450 000 FCFA$txt$),
  (22, $txt$B$txt$, 2, false, $txt$60 000 FCFA and 390 000 FCFA$txt$),
  (22, $txt$C$txt$, 3, false, $txt$30 000 FCFA and 390 000 FCFA$txt$),
  (22, $txt$D$txt$, 4, true, $txt$30 000 FCFA and 420 000 FCFA$txt$),
  (23, $txt$A$txt$, 1, false, $txt$It is arithmetic with common difference 2$txt$),
  (23, $txt$B$txt$, 2, false, $txt$It is not arithmetic because the first term is 4$txt$),
  (23, $txt$C$txt$, 3, true, $txt$It is not arithmetic: the differences are 2, 4, 6, …, which are not constant$txt$),
  (23, $txt$D$txt$, 4, false, $txt$It is arithmetic with common difference 1$txt$),
  (24, $txt$A$txt$, 1, false, $txt$2.5$txt$),
  (24, $txt$B$txt$, 2, false, $txt$−0.5$txt$),
  (24, $txt$C$txt$, 3, false, $txt$−5$txt$),
  (24, $txt$D$txt$, 4, true, $txt$−2.5$txt$),
  (25, $txt$A$txt$, 1, true, $txt$2027$txt$),
  (25, $txt$B$txt$, 2, false, $txt$2026$txt$),
  (25, $txt$C$txt$, 3, false, $txt$2029$txt$),
  (25, $txt$D$txt$, 4, false, $txt$2028$txt$),
  (26, $txt$A$txt$, 1, false, $txt$20$txt$),
  (26, $txt$B$txt$, 2, true, $txt$25$txt$),
  (26, $txt$C$txt$, 3, false, $txt$36$txt$),
  (26, $txt$D$txt$, 4, false, $txt$24$txt$),
  (27, $txt$A$txt$, 1, false, $txt$The ratio between consecutive terms is constant$txt$),
  (27, $txt$B$txt$, 2, false, $txt$Its first differences are constant$txt$),
  (27, $txt$C$txt$, 3, true, $txt$Its second differences are constant and not equal to zero$txt$),
  (27, $txt$D$txt$, 4, false, $txt$Its terms keep getting larger and larger$txt$),
  (28, $txt$A$txt$, 1, false, $txt$Dₙ = n(n + 1) ÷ 2$txt$),
  (28, $txt$B$txt$, 2, false, $txt$Dₙ = n² + 1$txt$),
  (28, $txt$C$txt$, 3, false, $txt$Dₙ = 2n²$txt$),
  (28, $txt$D$txt$, 4, true, $txt$Dₙ = n² + n$txt$),
  (29, $txt$A$txt$, 1, false, $txt$1$txt$),
  (29, $txt$B$txt$, 2, false, $txt$3$txt$),
  (29, $txt$C$txt$, 3, true, $txt$2$txt$),
  (29, $txt$D$txt$, 4, false, $txt$5$txt$),
  (30, $txt$A$txt$, 1, false, $txt$Its first differences are 4, 4, 4, 4$txt$),
  (30, $txt$B$txt$, 2, false, $txt$Its first differences are 1, 2, 4, 8$txt$),
  (30, $txt$C$txt$, 3, false, $txt$The ratio between consecutive terms is always 2$txt$),
  (30, $txt$D$txt$, 4, true, $txt$Its first differences are 3, 5, 7, 9$txt$),
  (31, $txt$A$txt$, 1, false, $txt$n² + 6n − 1$txt$),
  (31, $txt$B$txt$, 2, false, $txt$n² + 3n + 3$txt$),
  (31, $txt$C$txt$, 3, true, $txt$n² + 3n − 1$txt$),
  (31, $txt$D$txt$, 4, false, $txt$2n² + 3n − 1$txt$),
  (32, $txt$A$txt$, 1, false, $txt$t = 2 s$txt$),
  (32, $txt$B$txt$, 2, true, $txt$t = 4 s$txt$),
  (32, $txt$C$txt$, 3, false, $txt$t = 5 s$txt$),
  (32, $txt$D$txt$, 4, false, $txt$t = 3 s$txt$),
  (33, $txt$A$txt$, 1, false, $txt$The correct rule is Hₙ = n(n + 1) ÷ 2, because the pattern always grows to the next number$txt$),
  (33, $txt$B$txt$, 2, true, $txt$The correct rule is Hₙ = n(n − 1) ÷ 2, because each of the n traders shakes hands with n − 1 others and every pair is counted twice$txt$),
  (33, $txt$C$txt$, 3, false, $txt$The rule n² − n is correct because the second differences are 2$txt$),
  (33, $txt$D$txt$, 4, false, $txt$The correct rule is Hₙ = n², because each trader meets n others$txt$),
  (34, $txt$A$txt$, 1, true, $txt$4$txt$),
  (34, $txt$B$txt$, 2, false, $txt$5$txt$),
  (34, $txt$C$txt$, 3, false, $txt$16$txt$),
  (34, $txt$D$txt$, 4, false, $txt$15$txt$),
  (35, $txt$A$txt$, 1, true, $txt$96$txt$),
  (35, $txt$B$txt$, 2, false, $txt$64$txt$),
  (35, $txt$C$txt$, 3, false, $txt$48$txt$),
  (35, $txt$D$txt$, 4, false, $txt$192$txt$),
  (36, $txt$A$txt$, 1, false, $txt$Distance run each day, in km: 4, 8, 12, 16$txt$),
  (36, $txt$B$txt$, 2, false, $txt$Areas of square plots, in m²: 2, 8, 18, 32$txt$),
  (36, $txt$C$txt$, 3, false, $txt$Price of a bag of rice over four weeks, in FCFA: 5 000, 5 000, 6 000, 6 000$txt$),
  (36, $txt$D$txt$, 4, true, $txt$Heights of a bouncing ball, in cm: 100, 50, 25, 12.5$txt$),
  (37, $txt$A$txt$, 1, true, $txt$The rule gives 6 as the first term; the exponent should be n − 1 so that a₁ = 2$txt$),
  (37, $txt$B$txt$, 2, false, $txt$The rule should be aₙ = 3 × 2ⁿ, because the first term is 2$txt$),
  (37, $txt$C$txt$, 3, false, $txt$The rule should divide by 3 instead of multiplying by 3$txt$),
  (37, $txt$D$txt$, 4, false, $txt$Nothing is wrong: the rule gives the terms of the sequence$txt$),
  (38, $txt$A$txt$, 1, false, $txt$4 000$txt$),
  (38, $txt$B$txt$, 2, true, $txt$8 000$txt$),
  (38, $txt$C$txt$, 3, false, $txt$1 500$txt$),
  (38, $txt$D$txt$, 4, false, $txt$16 000$txt$),
  (39, $txt$A$txt$, 1, false, $txt$Lₙ = 2ⁿ⁻¹$txt$),
  (39, $txt$B$txt$, 2, false, $txt$Lₙ = 2n$txt$),
  (39, $txt$C$txt$, 3, true, $txt$Lₙ = 2ⁿ$txt$),
  (39, $txt$D$txt$, 4, false, $txt$Lₙ = n²$txt$),
  (40, $txt$A$txt$, 1, false, $txt$578 000 FCFA$txt$),
  (40, $txt$B$txt$, 2, false, $txt$440 000 FCFA$txt$),
  (40, $txt$C$txt$, 3, false, $txt$417 605 FCFA$txt$),
  (40, $txt$D$txt$, 4, true, $txt$491 300 FCFA$txt$),
  (41, $txt$A$txt$, 1, true, $txt$the 8th term$txt$),
  (41, $txt$B$txt$, 2, false, $txt$the 9th term$txt$),
  (41, $txt$C$txt$, 3, false, $txt$the 6th term$txt$),
  (41, $txt$D$txt$, 4, false, $txt$the 7th term$txt$),
  (42, $txt$A$txt$, 1, false, $txt$Village B, because a percentage growth always gives more than a fixed growth$txt$),
  (42, $txt$B$txt$, 2, false, $txt$Village B, because 3% of 12 000 is 500 people$txt$),
  (42, $txt$C$txt$, 3, false, $txt$The two villages have the same population, because they both started from 12 000 people$txt$),
  (42, $txt$D$txt$, 4, true, $txt$Village A, with 17 000 people against about 16 127 for village B — but B grows proportionally, so it overtakes A later$txt$),
  (43, $txt$A$txt$, 1, true, $txt$175$txt$),
  (43, $txt$B$txt$, 2, false, $txt$310$txt$),
  (43, $txt$C$txt$, 3, false, $txt$190$txt$),
  (43, $txt$D$txt$, 4, false, $txt$350$txt$),
  (44, $txt$A$txt$, 1, true, $txt$860$txt$),
  (44, $txt$B$txt$, 2, false, $txt$900$txt$),
  (44, $txt$C$txt$, 3, false, $txt$810$txt$),
  (44, $txt$D$txt$, 4, false, $txt$1 620$txt$),
  (45, $txt$A$txt$, 1, false, $txt$Sₙ = a₁ + (n − 1)d$txt$),
  (45, $txt$B$txt$, 2, true, $txt$Sₙ = n ÷ 2 × [2a₁ + (n − 1)d]$txt$),
  (45, $txt$C$txt$, 3, false, $txt$Sₙ = n ÷ 2 × [a₁ + (n − 1)d]$txt$),
  (45, $txt$D$txt$, 4, false, $txt$Sₙ = n × (a₁ + aₙ)$txt$),
  (46, $txt$A$txt$, 1, true, $txt$196 800 FCFA$txt$),
  (46, $txt$B$txt$, 2, false, $txt$144 000 FCFA$txt$),
  (46, $txt$C$txt$, 3, false, $txt$393 600 FCFA$txt$),
  (46, $txt$D$txt$, 4, false, $txt$201 600 FCFA$txt$),
  (47, $txt$A$txt$, 1, false, $txt$The sum is n(n + 1), so the total is 650$txt$),
  (47, $txt$B$txt$, 2, true, $txt$The sum is n², so the first 25 odd numbers add up to 625$txt$),
  (47, $txt$C$txt$, 3, false, $txt$The sum is n(n + 1) ÷ 2, so the total is 325$txt$),
  (47, $txt$D$txt$, 4, false, $txt$The sum is 2n − 1, so the total is 49$txt$),
  (48, $txt$A$txt$, 1, false, $txt$495$txt$),
  (48, $txt$B$txt$, 2, false, $txt$429$txt$),
  (48, $txt$C$txt$, 3, true, $txt$462$txt$),
  (48, $txt$D$txt$, 4, false, $txt$924$txt$),
  (49, $txt$A$txt$, 1, false, $txt$180 km$txt$),
  (49, $txt$B$txt$, 2, true, $txt$189 km$txt$),
  (49, $txt$C$txt$, 3, false, $txt$168 km$txt$),
  (49, $txt$D$txt$, 4, false, $txt$378 km$txt$),
  (50, $txt$A$txt$, 1, false, $txt$a₁ = 8, d = 3$txt$),
  (50, $txt$B$txt$, 2, false, $txt$a₁ = 5, d = 3$txt$),
  (50, $txt$C$txt$, 3, true, $txt$a₁ = 8, d = 6$txt$),
  (50, $txt$D$txt$, 4, false, $txt$a₁ = 3, d = 10$txt$)
  )
  insert into public.question_options (question_id, label, is_correct, position)
  select i.id, o.label, o.is_correct, o.position
    from inserted i
    join opts o on o.n = i.n;

  select count(*), coalesce(sum((select count(*) from public.question_options o where o.question_id = q.id)), 0)
    into v_questions, v_options
    from public.questions q
   where q.organization_id = v_org and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment';

  if v_questions <> 50 or v_options <> 200 then
    raise exception 'Assessment seed is incomplete (% questions, % options); expected 50 and 200.', v_questions, v_options;
  end if;

  ---------------------------------------------------------------------------
  -- Quiz + paper (printed order, 1 mark each)
  ---------------------------------------------------------------------------
  insert into public.quizzes (organization_id, title, description, status, settings)
  values (
    v_org,
    'Sommetisation Assessment — Grade 10',
    'Fifty single-choice questions on recursive and explicit formulas, linear, arithmetic, quadratic and geometric sequences, and arithmetic series. 1 mark each, 60 minutes, calculator allowed.',
    'published',
    jsonb_build_object('randomize_questions', false, 'randomize_options', false)
  )
  returning id into v_quiz;

  insert into public.quiz_questions (quiz_id, question_id, position, points)
  select v_quiz, q.id, (q.config ->> 'question_number')::int, 1
    from public.questions q
   where q.organization_id = v_org
     and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'
   order by (q.config ->> 'question_number')::int;

  ---------------------------------------------------------------------------
  -- Examination: open, link + access code, results released on submission
  ---------------------------------------------------------------------------
  insert into public.exams
    (organization_id, quiz_id, class_id, title, description, instructions, duration_minutes,
     status, access_code, shared_link_enabled, settings)
  values (
    v_org,
    v_quiz,
    v_class,
    'Sommetisation Assessment — Grade 10',
    'MYP 5 Mathematics — Sequences & Series. 50 questions, 1 mark each, 50 marks in total.',
    'Answer all 50 questions. Each question has one correct answer out of four. You have 60 minutes and may use a calculator. Enter your first name and last name exactly as they appear on your class list. Your score and the worked answer for every question are shown as soon as you submit.',
    60,
    'open',
    'MYP5-SEQ-2026',
    true,
    jsonb_build_object(
      'proctoring', false,
      'require_screen_share', false,
      'randomize_questions', false,
      'randomize_options', false,
      'pass_mark_percent', 50,
      'results_published', true,
      'access_mode', 'shared_link',
      'attempt_policy', 'single_resume',
      'identity_fields', '[]'::jsonb
    )
  )
  returning id into v_exam;

  raise notice 'Sommetisation Assessment created: exam %, quiz %, 50 questions, access code %.', v_exam, v_quiz, 'MYP5-SEQ-2026';
end $$;
