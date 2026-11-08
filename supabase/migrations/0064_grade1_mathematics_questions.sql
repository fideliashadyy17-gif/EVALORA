-- Examination of Grade 1 – Mathematics  (Oak International School Benin)
--
-- Source document: "Grade 1 / CI — End of Second Marking Period Examination
-- 2026/2027, Examination Papers & Marking Scheme" (21 pages, supplied PDF).
-- This step writes the 30 printed questions of the MATHEMATICS paper, pages 2-5,
-- and the 40 marks its marking scheme (page 18) assigns to them.
--
-- Fidelity rules applied:
--   * every prompt is the printed wording; line breaks are joined, no word is
--     added, reordered or dropped. Wording that does not fit a screen sentence
--     is kept in full rather than shortened;
--   * every option is the printed option, in printed order, with the printed
--     label. Options follow the printed letters exactly, so a question with
--     three printed choices has three options, not four;
--   * every correct answer is the marking scheme's own answer for that question
--     number. 30 of 30 are printed; nothing is invented and nothing is inferred
--     from the question;
--   * marks are the printed ones: Section A 1 mark per question, Section B
--     2 marks per question, 40 in total. This is the document's own arithmetic
--     ("20 x 1m = 20m  •  10 x 2m = 20m", "Total: 40 Marks");
--   * Section A questions carry one marked option, so the platform auto-marks
--     them. Section B tasks are drawing, colouring, tracing, labelling, number
--     lines and matching, so they are written as manual items and the teacher
--     marks them against the printed scheme; the platform must not pretend to
--     auto-mark a drawing;
--   * the pictures are the printed ones: the source PDF has no raster images,
--     every illustration is vector artwork, and each question's own picture band
--     was rendered from its card (scripts/grade1-figures.py). The marking scheme
--     keys answers by picture letter, so the pictures are content, not
--     decoration;
--   * a question whose key the source leaves incomplete is recorded here as
--     review_required in `config`, with the reason. Nothing is guessed.
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
       array['grade1', 'ci', 'second-marking-period', '2026-2027', 'mathematics']::text[],
       'published', s.review_status,
       jsonb_build_object('source', 'oak-grade1-ci-2026-2027',
                          'subject', 'mathematics',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null,
                          'review_required', s.review_required,
                          'review_reason', s.review_reason)
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 2-4) ───────────────────
  (1, 'short_answer', 1, 'A',
   $txt$Count. Take away 0:  5  -  0  =$txt$,
   $txt$Answer: 5.  1 mark for writing 5.$txt$,
   'W1: Subtracting zero and single digits', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q01.png',
   'Question 1: count the cubes, then take away 0.', false, null, 'approved'),
  (2, 'single_choice', 1, 'A',
   $txt$Tick the right answer:  7  -  0  =$txt$,
   $txt$Answer: 7.  1 mark for ticking 7.$txt$,
   'W1: Subtracting zero and single digits', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q02.png',
   'Question 2: three printed choices, 0, 7 and 6.', false, null, 'approved'),
  (3, 'short_answer', 1, 'A',
   $txt$Count the crossed-out oranges:  6  -  2  =$txt$,
   $txt$Answer: 4.  1 mark for writing 4.$txt$,
   'W1: Subtracting zero and single digits', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q03.png',
   'Question 3: count the oranges that are crossed out.', false, null, 'approved'),
  (4, 'short_answer', 1, 'A',
   $txt$Count the crossed-out balls:  8  -  3  =$txt$,
   $txt$Answer: 5.  1 mark for writing 5.$txt$,
   'W1: Subtracting zero and single digits', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q04.png',
   'Question 4: count the balls that are crossed out.', false, null, 'approved'),
  (5, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  9 - 4 = 5$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W1: Subtracting zero and single digits', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q05.png',
   'Question 5: is 9 - 4 equal to 5?', false, null, 'approved'),
  (6, 'short_answer', 1, 'A',
   $txt$Count the carrots left:  12  -  4  =$txt$,
   $txt$Answer: 8.  1 mark for writing 8.$txt$,
   'W2: Subtract 1-digit from 2-digit', 'easy', 'Subtracting 1 digit from 2 digits',
   '/exam-figures/grade1-ci/mathematics/q06.png',
   'Question 6: count the carrots that are left.', false, null, 'approved'),
  (7, 'short_answer', 1, 'A',
   $txt$Count the tomatoes left:  14  -  5  =$txt$,
   $txt$Answer: 9.  1 mark for writing 9.$txt$,
   'W2: Subtract 1-digit from 2-digit', 'easy', 'Subtracting 1 digit from 2 digits',
   '/exam-figures/grade1-ci/mathematics/q07.png',
   'Question 7: count the tomatoes that are left.', false, null, 'approved'),
  (8, 'single_choice', 1, 'A',
   $txt$Tick the right answer:  15  - 5 =$txt$,
   $txt$Answer: 10.  1 mark for ticking 10.$txt$,
   'W2: Subtract 1-digit from 2-digit', 'easy', 'Subtracting 1 digit from 2 digits',
   '/exam-figures/grade1-ci/mathematics/q08.png',
   'Question 8: three printed choices, 10, 11 and 5.', false, null, 'approved'),
  (9, 'single_choice', 1, 'A',
   $txt$Tick the right answer:  17  - 6 =$txt$,
   $txt$Answer: 11.  1 mark for ticking 11.$txt$,
   'W2: Subtract 1-digit from 2-digit', 'easy', 'Subtracting 1 digit from 2 digits',
   '/exam-figures/grade1-ci/mathematics/q09.png',
   'Question 9: three printed choices, 10, 11 and 12.', false, null, 'approved'),
  (10, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  16 - 0 = 0$txt$,
   $txt$Answer: NO (sad face), because 16 - 0 = 16 and not 0.  1 mark for NO.$txt$,
   'W1/W2: Subtracting', 'easy', 'Subtracting 0 and single digits',
   '/exam-figures/grade1-ci/mathematics/q10.png',
   'Question 10: is 16 - 0 equal to 0?', false, null, 'approved'),
  (11, 'single_choice', 1, 'A',
   $txt$Circle the TRIANGLE (same shape):$txt$,
   $txt$Answer: B (triangle).  1 mark for circling B.$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q11.png',
   'Question 11: pictures A, B and C.', false, null, 'approved'),
  (12, 'single_choice', 1, 'A',
   $txt$Circle the STAR (same shape):$txt$,
   $txt$Answer: A (star).  1 mark for circling A.$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q12.png',
   'Question 12: pictures A, B and C.', false, null, 'approved'),
  (13, 'single_choice', 1, 'A',
   $txt$Circle the BIG SQUARE (same size):$txt$,
   $txt$Answer: B (big square).  1 mark for circling B.$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q13.png',
   'Question 13: pictures A (small), B (big) and C (big).', false, null, 'approved'),
  (14, 'single_choice', 1, 'A',
   $txt$Circle the SMALL CIRCLE (same size):$txt$,
   $txt$Answer: C (small circle).  1 mark for circling C.$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q14.png',
   'Question 14: pictures A (big), B (small) and C (small).', false, null, 'approved'),
  (15, 'true_false', 1, 'A',
   $txt$Same shape and size?  These 2 hearts match.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q15.png',
   'Question 15: two hearts to compare.', false, null, 'approved'),
  (16, 'single_choice', 1, 'A',
   $txt$Circle the STRAIGHT line:$txt$,
   $txt$Answer: B (straight line).  1 mark for circling B.$txt$,
   'W4: Lines — straight and curved', 'easy', 'Straight and curved lines',
   '/exam-figures/grade1-ci/mathematics/q16.png',
   'Question 16: pictures A, B and C.', false, null, 'approved'),
  (17, 'single_choice', 1, 'A',
   $txt$Circle the CURVED line:$txt$,
   $txt$Answer: C (curved line).  1 mark for circling C.$txt$,
   'W4: Lines — straight and curved', 'easy', 'Straight and curved lines',
   '/exam-figures/grade1-ci/mathematics/q17.png',
   'Question 17: pictures A, B and C.', false, null, 'approved'),
  (18, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  A circle has a curved line.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W4: Lines — straight and curved', 'easy', 'Straight and curved lines',
   '/exam-figures/grade1-ci/mathematics/q18.png',
   'Question 18: does a circle have a curved line?', false, null, 'approved'),
  (19, 'short_answer', 1, 'A',
   $txt$Write the missing word:  A square has 4 ______ lines.   (Word bank, Q19-Q20: straight, triangle, curved, zero)$txt$,
   $txt$Answer: straight.  1 mark for "straight".$txt$,
   'W4: Lines — straight and curved', 'easy', 'Straight and curved lines',
   '/exam-figures/grade1-ci/mathematics/q19.png',
   'Question 19: word bank shared with question 20.', false, null, 'approved'),
  (20, 'short_answer', 1, 'A',
   $txt$Write the missing word:  A 3-sided shape is a ______.   (Word bank, Q19-Q20: straight, triangle, curved, zero)$txt$,
   $txt$Answer: triangle.  1 mark for "triangle".$txt$,
   'W3: Shapes — same shape and size', 'easy', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q20.png',
   'Question 20: word bank shared with question 19.', false, null, 'approved'),

  -- ── Section B: 10 tasks, 2 marks each (pages 4-5), teacher-marked ──────
  (21, 'open_ended', 2, 'B',
   $txt$Cross out 4 bananas.  Write the answer:  9  -  4  =$txt$,
   $txt$Answer: 4 crossed out; 5.  Award 1 mark for crossing out 4 and 1 mark for the answer 5.$txt$,
   'W1: Subtraction by crossing out', 'medium', 'Subtraction by crossing out',
   '/exam-figures/grade1-ci/mathematics/q21.png',
   'Question 21: the pupil crosses out four bananas and writes the answer.', false, null, 'approved'),
  (22, 'open_ended', 2, 'B',
   $txt$Cross out 5 eggs. Write the answer:  13  -  5  =$txt$,
   $txt$Answer: 5 crossed out; 8.  Award 1 mark for crossing out 5 and 1 mark for the answer 8.$txt$,
   'W2: Subtraction by crossing out', 'medium', 'Subtraction by crossing out',
   '/exam-figures/grade1-ci/mathematics/q22.png',
   'Question 22: the pupil crosses out five eggs and writes the answer.', false, null, 'approved'),
  (23, 'open_ended', 2, 'B',
   $txt$Jump back on the line:  11 - 4 =$txt$,
   $txt$Answer: 7, with jumps 11 to 7 on the number line.  Award 1 mark for the jumps on the line and 1 mark for the answer 7.$txt$,
   'W1: Number line subtraction', 'medium', 'Subtracting on a number line',
   '/exam-figures/grade1-ci/mathematics/q23.png',
   'Question 23: number line 0 to 12.', false, null, 'approved'),
  (24, 'open_ended', 2, 'B',
   $txt$Jump back on the line:  18 - 6 =$txt$,
   $txt$Answer: 12, with jumps 18 to 12 on the number line.  Award 1 mark for the jumps on the line and 1 mark for the answer 12.$txt$,
   'W2: Number line subtraction', 'medium', 'Subtracting on a number line',
   '/exam-figures/grade1-ci/mathematics/q24.png',
   'Question 24: number line 8 to 20.', false, null, 'approved'),
  (25, 'open_ended', 2, 'B',
   $txt$15 birds sit on a tree. 6 fly away.  How many birds are left?     15  -  ______  =  ______$txt$,
   $txt$Answer: 15 - 6 = 9.  Award 1 mark for the number sentence and 1 mark for the answer 9.$txt$,
   'W2: Picture word problem', 'medium', 'Picture word problems',
   '/exam-figures/grade1-ci/mathematics/q25.png',
   'Question 25: word problem with a subtraction frame.', false, null, 'approved'),
  (26, 'open_ended', 2, 'B',
   $txt$16 mangoes are in a box. Bola eats 7.  How many are left?     16  -  ______  =  ______$txt$,
   $txt$Answer: 16 - 7 = 9.  Award 1 mark for the number sentence and 1 mark for the answer 9.$txt$,
   'W2: Picture word problem', 'medium', 'Picture word problems',
   '/exam-figures/grade1-ci/mathematics/q26.png',
   'Question 26: word problem with a subtraction frame.', false, null, 'approved'),
  (27, 'open_ended', 2, 'B',
   $txt$Draw a CIRCLE of the same size and name it:$txt$,
   $txt$Answer: a drawn circle plus the word "circle".  Award 1 mark for a neat circle of the same size and 1 mark for the word.$txt$,
   'W3: Draw and name a shape', 'medium', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q27.png',
   'Question 27: the pupil draws and names a circle.', false, null, 'approved'),
  (28, 'open_ended', 2, 'B',
   $txt$Colour the 2 shapes of the SAME shape & size:$txt$,
   $txt$Answer: shapes A and D coloured (the two big triangles).  Award 1 mark for each correct big triangle coloured.$txt$,
   'W3: Shapes — same shape and size', 'medium', 'Shapes: same shape and size',
   '/exam-figures/grade1-ci/mathematics/q28.png',
   'Question 28: shapes A, B, C and D.', false, null, 'approved'),
  (29, 'open_ended', 2, 'B',
   $txt$Trace the STRAIGHT & CURVED lines:   1. Straight:   2. Curved:$txt$,
   $txt$Answer: both lines neatly traced.  Award 1 mark for the straight line traced and 1 mark for the curved line traced.$txt$,
   'W4: Lines — straight and curved', 'medium', 'Straight and curved lines',
   '/exam-figures/grade1-ci/mathematics/q29.png',
   'Question 29: the pupil traces one straight and one curved line.', false, null, 'approved'),
  (30, 'open_ended', 2, 'B',
   $txt$Match each item on the left to the right:   14 - 0  •  Straight  •  Curved  •  Same size      and on the right: 14$txt$,
   $txt$The printed marking scheme reads "1->B (14), 2->D (straig..." and the rest is cut off at the page edge, but the fraction "0.5m each correct line" confirms four matchings worth 2 marks in total.  The four markable right-hand items visible in the printed card are 14, Straight, Curved and Same size; only the first pairing (1 -> 14) is legible in the source.  The remaining three pairings are NOT recorded here: the source does not print them.$txt$,
   'W1-W4: Matching', 'medium', 'Matching across the marking period',
   '/exam-figures/grade1-ci/mathematics/q30.png',
   'Question 30: four items on the left matched to four on the right. The source answer row is truncated at the page edge; only the first pairing is legible, so the key is flagged for teacher review rather than completed by inference.',
   true, 'The printed answer row for Q30 is cut off at the right page edge: only "1->B (14)" is readable. The remaining three pairings must be read from the printed paper and entered by the teacher.', 'reviewed')
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason, review_status)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
      and q.config ->> 'subject' = 'mathematics'
      and q.config ->> 'question_number' = s.n::text);
