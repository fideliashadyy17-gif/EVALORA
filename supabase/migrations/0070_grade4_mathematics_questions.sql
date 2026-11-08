-- Examination of Grade 4 – Mathematics  (Oak International School)
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf"
-- (17 pages, supplied PDF): index page 1, MATHEMATICS paper pages 2-4, marking
-- scheme page 14. This step writes the 30 printed questions of that paper and
-- the 50 marks its marking scheme assigns to them.
--
-- Fidelity rules applied, question by question:
--   * every prompt is the printed wording. The paper prints the question on a
--     card and wraps the text to the card width, so a word broken across two
--     printed lines ("Divide by tens: 540 ÷ 60 =" / "16 =") is rejoined into one
--     line; nothing is added, reordered or dropped, and no typo is corrected;
--   * every printed sub-part of a Section B question is kept, in printed order,
--     on its own line, so a pupil answering on screen sees the same (a)/(b)/(c)
--     breakdown and answer slots the paper provides;
--   * answer options are the printed ones in printed order, labelled with the
--     printed letters A-D (or TRUE / FALSE where the card prints those). A card
--     that prints four options gets four; nothing is padded to fit the layout;
--   * every keyed answer is the marking scheme's own answer for that question
--     number. 30 of 30 are printed; nothing is inferred from the question. The
--     scheme's working is kept verbatim in `marking_scheme` so a teacher sees
--     the printed mark breakdown ("M1 ...; A1 ...") next to the answer;
--   * marks are the printed ones: Section A 1 mark each (20), Section B
--     3,3,3,3,2,3,2,2,4,5 (30), total 50 — the paper's own cover arithmetic
--     ("Total Marks: 50 Marks", "Sec A (20) ... Sec B (30)");
--   * Section A is auto-marked. Section B is written, boxed working, bar models
--     and diagrams, so it is stored as manual items; the platform must not
--     pretend to auto-mark a pupil's working;
--   * the diagrams are the printed ones. The PDF has no raster images at all,
--     every figure is vector artwork, so each question's own diagram was
--     rendered from its card (scripts/grade4-figures.py, 18 crops with a
--     manifest). The paper keys answers by pointing at box positions and bar
--     segments inside those diagrams, so the diagrams are content: the
--     illustration used by the marking scheme's "MARKED KEY DIAGRAMS" block is
--     the same one the pupil sees;
--   * questions the source numbers but never prints are NOT created. Language
--     Arts prints Q1-Q20 and Q21-Q30 with no gap; this paper prints 1-30.
--
-- Idempotent: a question whose source marker and number already exist is
-- skipped, so re-running never duplicates or overwrites authored content.

insert into public.questions
  (organization_id, type, prompt, prompt_doc, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', s.qtype, s.prompt,
       case when s.figure is null then null else
         jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', s.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', s.figure, 'alt', s.alt, 'width', 100))))
       end,
       s.points, s.difficulty, s.topic,
       array['grade4', 'ce2', 'second-marking-period', '2026-2027', 'mathematics']::text[],
       'published', s.review_status,
       jsonb_build_object('source', 'oak-grade4-2026-2027',
                          'subject', 'mathematics',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null,
                          'review_required', s.review_required,
                          'review_reason', s.review_reason) || s.extra
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 2-3) ───────────────────
  (1, 'single_choice', 1, 'A',
   $txt$What is the product of 6 × 400?$txt$,
   $txt$B (2,400). 1m for B.$txt$,
   'W1: Exploring & Box Multiplication; 4-Digit × 1-Digit', 'easy', 'Multiplication patterns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (2, 'single_choice', 1, 'A',
   $txt$In 3,245 × 3 using the box method, what is 200 × 3?$txt$,
   $txt$C (600). 1m for C.$txt$,
   'W1: Exploring & Box Multiplication; 4-Digit × 1-Digit', 'easy', 'Box method',
   null, null, false, null, 'approved', '{}'::jsonb),
  (3, 'single_choice', 1, 'A',
   $txt$Multiply: 2,134 × 4 =$txt$,
   $txt$A (8,536). 1m for A.$txt$,
   'W1: Exploring & Box Multiplication; 4-Digit × 1-Digit', 'easy', '4-digit × 1-digit',
   null, null, false, null, 'approved', '{}'::jsonb),
  (4, 'single_choice', 1, 'A',
   $txt$Use multiplication patterns to find 70 × 80:$txt$,
   $txt$D (5,600). 1m for D.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'easy', 'Multiplication patterns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (5, 'single_choice', 1, 'A',
   $txt$Calculate: 24 × 32 =$txt$,
   $txt$B (768). 1m for B.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'medium', '2-digit multipliers',
   null, null, false, null, 'approved', '{}'::jsonb),
  (6, 'single_choice', 1, 'A',
   $txt$In a bar model, 1 box = 36. What is the value of 4 equal boxes?$txt$,
   $txt$C (144). 1m for C.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'easy', 'Bar models',
   null, null, false, null, 'approved', '{}'::jsonb),
  (7, 'single_choice', 1, 'A',
   $txt$Divide: 4,800 ÷ 8 =$txt$,
   $txt$A (600). 1m for A.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'easy', 'Dividing 4-digit numbers',
   null, null, false, null, 'approved', '{}'::jsonb),
  (8, 'single_choice', 1, 'A',
   $txt$Divide by tens: 540 ÷ 60 =$txt$,
   $txt$B (9). 1m for B.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'easy', 'Dividing by tens',
   null, null, false, null, 'approved', '{}'::jsonb),
  (9, 'single_choice', 1, 'A',
   $txt$Divide by a 2-digit number: 96 ÷ 16 =$txt$,
   $txt$C (6). 1m for C.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'medium', '2-digit divisors',
   null, null, false, null, 'approved', '{}'::jsonb),
  (10, 'single_choice', 1, 'A',
   $txt$To find 272 ÷ 34, trying 9 gives 306 (too big). The correct quotient is:$txt$,
   $txt$B (8). 1m for B.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'medium', 'Adjusting quotients',
   null, null, false, null, 'approved', '{}'::jsonb),
  (11, 'true_false', 1, 'A',
   $txt$True or False: Any 4-digit number multiplied by 0 gives 0.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W1: Exploring & Box Multiplication; 4-Digit × 1-Digit', 'easy', 'Multiplying by zero',
   null, null, false, null, 'approved', '{}'::jsonb),
  (12, 'true_false', 1, 'A',
   $txt$True or False: To multiply a whole number by 100, place two zeros at the end.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'easy', 'Multiplication patterns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (13, 'true_false', 1, 'A',
   $txt$True or False: In a division problem, the remainder can be larger than the divisor.$txt$,
   $txt$FALSE (remainder < divisor). 1m for FALSE.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'easy', 'Division remainders',
   null, null, false, null, 'approved', '{}'::jsonb),
  (14, 'numeric', 1, 'A',
   $txt$Fill in the blank (Multiplication Pattern): Calculate: 135 × 100 = ____________$txt$,
   $txt$13,500. 1m for 13,500.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'easy', 'Multiplication patterns',
   null, null, false, null, 'approved',
   jsonb_build_object('numeric_answer', 13500, 'tolerance', 0)),
  (15, 'numeric', 1, 'A',
   $txt$Fill in the blank (Dividing by Tens): Calculate: 8,400 ÷ 70 = ____________$txt$,
   $txt$120. 1m for 120.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'medium', 'Dividing by tens',
   null, null, false, null, 'approved',
   jsonb_build_object('numeric_answer', 120, 'tolerance', 0)),
  (16, 'numeric', 1, 'A',
   $txt$Fill in the blank (2-Digit Divisor): Calculate: 1,440 ÷ 12 = ____________$txt$,
   $txt$120. 1m for 120.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'medium', '2-digit divisors',
   null, null, false, null, 'approved',
   jsonb_build_object('numeric_answer', 120, 'tolerance', 0)),
  (17, 'single_choice', 1, 'A',
   $txt$Odd One Out — Circle the product that is DIFFERENT: 30 × 40 | 20 × 60 | 12 × 100 | 50 × 30$txt$,
   $txt$50 x 30 (= 1,500; others 1,200 / 1,200 / 1,200). 1m for 50 x 30.$txt$,
   'W1/W2: Multiplication patterns', 'medium', 'Odd one out',
   null, null, false, null, 'approved', '{}'::jsonb),
  (18, 'ordering', 1, 'A',
   $txt$Order these quotients from SMALLEST to LARGEST: 80 ÷ 20 , 120 ÷ 20 , 60 ÷ 20$txt$,
   $txt$60÷20 (3), 80÷20 (4), 120÷20 (6). 1m for correct order.$txt$,
   'W3/W4: Dividing; Ordering quotients', 'medium', 'Ordering quotients',
   null, null, false, null, 'approved', '{}'::jsonb),
  (19, 'numeric', 1, 'A',
   $txt$Diagram: 5 equal units total 175. Find 1 unit: 1 unit = 175 ÷ 5 =$txt$,
   $txt$35 (175 ÷ 5 = 35). 1m for 35.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'medium', 'Division bar model',
   '/exam-figures/grade4/mathematics/q19.png',
   'Question 19: a bar model of five equal units marked "Total = 175", each unit marked "?".', false, null, 'approved',
   jsonb_build_object('numeric_answer', 35, 'tolerance', 0)),
  (20, 'matching', 1, 'A',
   $txt$Match each expression to its value (1,000 or 7): (i) 125 × 8 = ______ (ii) 175 ÷ 25 = ______$txt$,
   $txt$(i)->1,000; (ii)->7. 0.5m each.$txt$,
   'W1-4: Matching expressions to values', 'easy', 'Matching expressions to values',
   null, null, false, null, 'approved',
   jsonb_build_object('pairs', jsonb_build_array(
     jsonb_build_object('left', '125 × 8', 'right', '1,000'),
     jsonb_build_object('left', '175 ÷ 25', 'right', '7')))),

  -- ── Section B: 10 questions, 30 marks (pages 3-4), teacher-marked ──────
  (21, 'open_ended', 3, 'B',
   $txt$DIAGRAM 1: Complete the Box-Method grid to find 3,428 × 6:
3,000    400    20    8
× 6    ?    ?    ?    ?
Sum of boxes =
Final Answer: 3,428 × 6 =$txt$,
   $txt$Boxes: 18,000 | 2,400 | 120 | 48; Sum of boxes = 18,000 + 2,400 + 120 + 48 = 20,568; Q21 Key: 3,428 × 6 = 20,568. M2 for 4 correct partial products; 3m.$txt$,
   'W1: Exploring & Box Multiplication; 4-Digit × 1-Digit', 'medium', 'Box method',
   '/exam-figures/grade4/mathematics/q21.png',
   'Question 21: an empty box-method grid headed 3,000, 400, 20 and 8 across and × 6 down.', false, null, 'approved', '{}'::jsonb),
  (22, 'open_ended', 3, 'B',
   $txt$DIAGRAM 2: Use the Box-Method grid to multiply 46 × 35:
40    6
30    5
Add 4 boxes:
Product =
Final Answer: 46 × 35 =$txt$,
   $txt$Boxes: 1,200, 200, 180, 30; Final Answer: 46 × 35 = 1,610. M2 for 4 partial products; A1 for the product; 3m.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'medium', 'Box method',
   '/exam-figures/grade4/mathematics/q22.png',
   'Question 22: an empty two-by-two box-method grid headed 40 and 6 across and 30 and 5 down, with "Add 4 boxes:" and "Product =" answer lines.', false, null, 'approved', '{}'::jsonb),
  (23, 'open_ended', 3, 'B',
   $txt$Multiply 234 × 123 using partial products and find the total:
234 × 3 =
234 × 20 =
234 × 100 =
Add partials:
Final Product =$txt$,
   $txt$702 + 4,680 + 23,400 = 28,782. M2 for partial products (702; 4,680; 23,400); A1 for the total; 3m.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'hard', 'Partial products',
   null, null, false, null, 'approved', '{}'::jsonb),
  (24, 'open_ended', 3, 'B',
   $txt$DIAGRAM 3 (Bar Model): 245 Science books and 4× as many Storybooks:
Science    245
Story    = ?
Total (both):
(a) Storybooks =
(b) Total books =$txt$,
   $txt$(a) Storybooks = 245 x 4 = 980; (b) Total = 245 + 980 = 1,225. Q24 Key: Bar Model (245 × 4 = 980; Total = 1,225). M1 bar labels; A1 for 980; A1 for the total; 3m.$txt$,
   'W2: 2- & 3-Digit Multipliers; Patterns; Bar Models', 'medium', 'Bar models',
   '/exam-figures/grade4/mathematics/q24.png',
   'Question 24: a bar model with a Science row of 245 and a Story row of four empty segments marked "= ?", above "Total (both):".', false, null, 'approved', '{}'::jsonb),
  (25, 'open_ended', 2, 'B',
   $txt$Complete each multiplication pattern carefully:
(a) 45 × 10 =
(b) 45 × 100 =
(c) 40 × 60 =
(d) 300 × 70 =$txt$,
   $txt$(a) 450  (b) 4,500  (c) 2,400  (d) 21,000. 0.5m each correct answer; 2m.$txt$,
   'W1/W2: Multiplication patterns', 'medium', 'Multiplication patterns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (26, 'open_ended', 3, 'B',
   $txt$DIAGRAM 4: Divide 4,632 ÷ 6 using long division and check:
6 ) 4,632
Working & Remainder:
Quotient =
Check (× 6):$txt$,
   $txt$Quotient = 772; Check: 772 × 6 = 4,632. M1 long division steps; A1 quotient; A1 check; 3m.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'medium', 'Long division',
   '/exam-figures/grade4/mathematics/q26.png',
   'Question 26: a long-division bracket with 6 dividing 4,632 and a "Working & Remainder:" box.', false, null, 'approved', '{}'::jsonb),
  (27, 'open_ended', 2, 'B',
   $txt$Divide by tens (write quotient and any remainder):
(a) 3,600 ÷ 40 =
Answer (a):
(b) 740 ÷ 30 =
Answer (b):$txt$,
   $txt$(a) 90   (b) 24 R 20. 1m for 90; 1m for 24 R 20; 2m.$txt$,
   'W3: Dividing 4-Digit Numbers; Dividing by Tens', 'medium', 'Dividing by tens',
   null, null, false, null, 'approved', '{}'::jsonb),
  (28, 'open_ended', 2, 'B',
   $txt$Find the quotient and remainder of 587 ÷ 16:
Step 1 (58 ÷ 16):
Step 2 (107 ÷ 16):
Quotient =
Remainder =$txt$,
   $txt$Quotient = 36, Remainder = 11. M1 for 16x3=48, 107-96=11; A1 for quotient and remainder; 2m.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'hard', '2-digit divisors',
   null, null, false, null, 'approved', '{}'::jsonb),
  (29, 'open_ended', 4, 'B',
   $txt$Adjusting Quotients: For 272 ÷ 34, Tunde tries 9 (34 × 9 = 306):
(a) Why adjust 9?
(b) Try 8: 34 × 8 =
So 272 ÷ 34 =
(c) Solve 945 ÷ 35:
Working:
Answer 945 ÷ 35 =$txt$,
   $txt$(a) 34x9=306 > 272 (too big); (b) 34 × 8 = 272, so 272 ÷ 34 = 8; (c) 945 ÷ 35 = 27. B1 reason; A1 for 8; M1 working for (c); A1 for 27; 4m.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'hard', 'Adjusting quotients',
   null, null, false, null, 'approved', '{}'::jsonb),
  (30, 'open_ended', 5, 'B',
   $txt$DIAGRAM 5 (Bar Model): 1,500 oranges; 48 kept, rest in 12 crates:
Total = 1,500
(a) Oranges packed =
Answer (a):
(b) Oranges per crate =
Working:
Answer (b):$txt$,
   $txt$(a) Packed = 1,500 - 48 = 1,452; (b) 1,452 ÷ 12 = 121. M1 1,500-48; A1 1,452; M1 bar model / division; A1 121; 5m.$txt$,
   'W4: 2-Digit Divisors; Adjusting Quotients; Bar Models', 'hard', 'Bar models and division',
   '/exam-figures/grade4/mathematics/q30.png',
   'Question 30: a bar model marked "Total = 1,500" with seven empty segments and a final "+48" segment.', false, null, 'approved', '{}'::jsonb)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason, review_status, extra)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade4-2026-2027'
      and q.config ->> 'subject' = 'mathematics'
      and q.config ->> 'question_number' = s.n::text);
