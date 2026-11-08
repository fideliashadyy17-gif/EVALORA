-- Examination of Grade 1 – Social Science  (Oak International School Benin)
--
-- Source document: "Grade 1 / CI — End of Second Marking Period Examination
-- 2026/2027, Examination Papers & Marking Scheme" (21 pages, supplied PDF).
-- This step writes the 30 printed questions of the SOCIAL SCIENCE paper, pages
-- 14-17, and the 40 marks its marking scheme (page 21) assigns to them.
--
-- Fidelity rules applied:
--   * every prompt is the printed wording; line breaks are joined, no word is
--     added, reordered or dropped;
--   * every option is the printed option, in printed order, with the printed
--     label, so a question with three printed choices has three options;
--   * every correct answer is the marking scheme's own answer for that question
--     number. 30 of 30 are printed;
--   * marks are the printed ones: Section A 1 mark per question, Section B
--     2 marks per question, 40 in total;
--   * Section B tasks (naming, drawing, sorting, matching, listing) are manual
--     items the teacher marks against the printed scheme;
--   * the pictures are the printed vector artwork, rendered from each question's
--     own card (scripts/grade1-figures.py). Several printed cards carry a stray
--     "?" decoration next to the prompt; it is part of the printed page and is
--     not reproduced as an answer option, because no marking-scheme row treats
--     it as one.
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
       array['grade1', 'ci', 'second-marking-period', '2026-2027', 'social-science']::text[],
       'published', 'approved',
       jsonb_build_object('source', 'oak-grade1-ci-2026-2027',
                          'subject', 'social-science',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null)
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 14-16) ─────────────────
  (1, 'single_choice', 1, 'A',
   $txt$Circle the picture of a GARDEN:$txt$,
   $txt$Answer: A (flower garden).  1 mark for circling A.$txt$,
   'W1: What is a garden?', 'easy', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q01.png', 'Question 1: pictures A, B and C.', false, null),
  (2, 'single_choice', 1, 'A',
   $txt$Circle what we PLANT in a garden:$txt$,
   $txt$Answer: A (seedling/plant).  1 mark for circling A.$txt$,
   'W1: What is a garden?', 'easy', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q02.png', 'Question 2: pictures A, B and C.', false, null),
  (3, 'single_choice', 1, 'A',
   $txt$Circle the tool that WATERS plants:$txt$,
   $txt$Answer: B (watering can).  1 mark for circling B.$txt$,
   'W1: What is a garden?', 'easy', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q03.png', 'Question 3: pictures A, B and C.', false, null),
  (4, 'single_choice', 1, 'A',
   $txt$In a garden, we grow:$txt$,
   $txt$Answer: plants & flowers.  1 mark for ticking "plants and flowers".$txt$,
   'W1: What is a garden?', 'easy', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q04.png', 'Question 4: three printed choices.', false, null),
  (5, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  A garden makes our school pretty.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W1: What is a garden?', 'easy', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q05.png', 'Question 5: statement about a garden.', false, null),
  (6, 'single_choice', 1, 'A',
   $txt$Circle the FLOWER garden:$txt$,
   $txt$Answer: A (flower garden).  1 mark for circling A.$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q06.png', 'Question 6: pictures A, B and C.', false, null),
  (7, 'single_choice', 1, 'A',
   $txt$Circle the VEGETABLE garden:$txt$,
   $txt$Answer: B (vegetable garden).  1 mark for circling B.$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q07.png', 'Question 7: pictures A, B and C.', false, null),
  (8, 'single_choice', 1, 'A',
   $txt$Circle the FRUIT garden:$txt$,
   $txt$Answer: C (fruit garden).  1 mark for circling C.$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q08.png', 'Question 8: pictures A, B and C.', false, null),
  (9, 'single_choice', 1, 'A',
   $txt$Tomatoes and carrots grow in a:$txt$,
   $txt$Answer: vegetable garden.  1 mark for ticking "veg garden".$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q09.png', 'Question 9: three printed choices.', false, null),
  (10, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  We can grow flowers in pots.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q10.png', 'Question 10: statement about growing flowers in pots.', false, null),
  (11, 'single_choice', 1, 'A',
   $txt$What must we find out first?$txt$,
   $txt$Answer: What plants need.  1 mark for ticking "What plants need".$txt$,
   'W3: What did we need to find out?', 'easy', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q11.png', 'Question 11: three printed choices.', false, null),
  (12, 'single_choice', 1, 'A',
   $txt$Plants need WATER. Circle it:$txt$,
   $txt$Answer: A (watering can).  1 mark for circling A.$txt$,
   'W3: What did we need to find out?', 'easy', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q12.png', 'Question 12: pictures A, B and C.', false, null),
  (13, 'single_choice', 1, 'A',
   $txt$Where does a garden grow best?$txt$,
   $txt$Answer: Sunny place with good soil.  1 mark for ticking "Sunny good soil".$txt$,
   'W3: What did we need to find out?', 'easy', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q13.png', 'Question 13: three printed choices.', false, null),
  (14, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  We ask questions to find out.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W3: What did we need to find out?', 'easy', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q14.png', 'Question 14: the picture of a pupil raising a hand with a question mark beside the YES and NO boxes.', false, null),
  (15, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  Plants grow with NO water.$txt$,
   $txt$Answer: NO.  1 mark for NO.$txt$,
   'W3: What did we need to find out?', 'easy', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q15.png', 'Question 15: the picture of a seedling in soil beside the YES and NO boxes.', false, null),
  (16, 'single_choice', 1, 'A',
   $txt$Who knows how to care for a garden?$txt$,
   $txt$Answer: B (gardener).  1 mark for circling B.$txt$,
   'W4: Sources of information', 'easy', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q16.png', 'Question 16: pictures A, B and C.', false, null),
  (17, 'single_choice', 1, 'A',
   $txt$Circle what we READ for information:$txt$,
   $txt$Answer: A (book).  1 mark for circling A.$txt$,
   'W4: Sources of information', 'easy', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q17.png', 'Question 17: pictures A, B and C.', false, null),
  (18, 'single_choice', 1, 'A',
   $txt$Who can we ask in our classroom?$txt$,
   $txt$Answer: Our teacher.  1 mark for ticking "Our teacher".$txt$,
   'W4: Sources of information', 'easy', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q18.png', 'Question 18: three printed choices.', false, null),
  (19, 'short_answer', 1, 'A',
   $txt$Write the missing word:  A ______ garden has roses.   (Word bank, Q19-Q20: flower, book, water, hoe)$txt$,
   $txt$Answer: flower.  1 mark for "flower".$txt$,
   'W2: Kinds of garden (flower, vegetable)', 'easy', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q19.png', 'Question 19: word bank shared with question 20.', false, null),
  (20, 'short_answer', 1, 'A',
   $txt$Write the missing word:  We read a ______ about plants.   (Word bank, Q19-Q20: flower, book, water, hoe)$txt$,
   $txt$Answer: book.  1 mark for "book".$txt$,
   'W4: Sources of information', 'easy', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q20.png', 'Question 20: word bank shared with question 19.', false, null),

  -- ── Section B: 10 tasks, 2 marks each (pages 16-17), teacher-marked ────
  (21, 'open_ended', 2, 'B',
   $txt$Write the 2 things found in a GARDEN:   (flower, cup, tree, phone)   1. ______   2. ______$txt$,
   $txt$Answer: 1 = flower, 2 = tree.  Award 1 mark for flower and 1 mark for tree.$txt$,
   'W1: What is in a garden?', 'medium', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q21.png', 'Question 21: a word box with flower, cup, tree and phone.', false, null),
  (22, 'open_ended', 2, 'B',
   $txt$Draw a FLOWER for a garden and name it:   It is a: ______$txt$,
   $txt$Answer: a flower drawing plus the word "flower".  Award 1 mark for a neat drawing and 1 mark for the word "flower".$txt$,
   'W1: Draw and name a garden flower', 'medium', 'What is a garden?',
   '/exam-figures/grade1-ci/social-science/q22.png', 'Question 22: a drawing frame and a line for the name.', false, null),
  (23, 'open_ended', 2, 'B',
   $txt$Name each garden (flower, vegetable):   1. ______   2. ______$txt$,
   $txt$Answer: 1 = flower, 2 = vegetable.  Award 1 mark for flower and 1 mark for vegetable.$txt$,
   'W2: Name kinds of garden', 'medium', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q23.png', 'Question 23: two garden pictures to name from the box flower, vegetable.', false, null),
  (24, 'open_ended', 2, 'B',
   $txt$Sort from box (rose, tomato) into gardens:   Flower garden: ______   Veg garden: ______$txt$,
   $txt$Answer: Flower = rose; Veg = tomato.  Award 1 mark for rose and 1 mark for tomato.$txt$,
   'W2: Sort garden plants', 'medium', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q24.png', 'Question 24: the pictures of a rose and a tomato printed beside Flower garden and Veg garden.', false, null),
  (25, 'open_ended', 2, 'B',
   $txt$Match each garden to what grows there:   Flower • Veg plot • Fruit • Pot plants     and: Tomatoes • Pretty roses • Small pots • Mangoes$txt$,
   $txt$Answer: Flower -> Pretty roses, Veg plot -> Tomatoes, Fruit -> Mangoes, Pot plants -> Small pots.  Award 0.5 mark for each correct line.$txt$,
   'W2: Match kinds of garden', 'medium', 'Kinds of garden',
   '/exam-figures/grade1-ci/social-science/q25.png', 'Question 25: four kinds of garden on the left, four things that grow on the right.', false, null),
  (26, 'open_ended', 2, 'B',
   $txt$Write 2 things plants need (water, soil):   Plants need:   1. ______   2. ______$txt$,
   $txt$Answer: 1 = water, 2 = soil.  Award 1 mark for water and 1 mark for soil.$txt$,
   'W3: What we need to find out', 'medium', 'Finding out what plants need',
   '/exam-figures/grade1-ci/social-science/q26.png', 'Question 26: the picture of a watering can printed beside Plants need.', false, null),
  (27, 'open_ended', 2, 'B',
   $txt$Tick 2 GOOD questions about a garden:   What plants grow well? • How do we fly a plane? • Do plants need water?$txt$,
   $txt$Answer: tick 1 and 3 ("What plants grow well?" and "Do plants need water?").  Award 1 mark for each correct tick.$txt$,
   'W3: Questions we ask', 'medium', 'Finding out what plants need',
   null, null, false, null),
  (28, 'open_ended', 2, 'B',
   $txt$Name each source of info (teacher, book):   1. ______   2. ______$txt$,
   $txt$Answer: 1 = teacher, 2 = book.  Award 1 mark for teacher and 1 mark for book.$txt$,
   'W4: Identify sources of information', 'medium', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q28.png', 'Question 28: two pictures of information sources to name from the box teacher, book.', false, null),
  (29, 'open_ended', 2, 'B',
   $txt$Match each source of information:   Gardener • Book • Teacher • Seeds     and: We read it • Grows plants • Sowing guide • Helps in class$txt$,
   $txt$Answer: Gardener -> Grows plants, Book -> We read it, Teacher -> Helps in class, Seeds -> Sowing guide.  Award 0.5 mark for each correct line.$txt$,
   'W4: Match sources of information', 'medium', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q29.png', 'Question 29: four sources on the left, four descriptions on the right.', false, null),
  (30, 'open_ended', 2, 'B',
   $txt$Fill in from box: gardener • garden   1. Ask a ______   2. Our school ______$txt$,
   $txt$Answer: 1 = gardener, 2 = garden.  Award 1 mark for gardener and 1 mark for garden.$txt$,
   'W1/W4: Complete sentences', 'medium', 'Sources of information',
   '/exam-figures/grade1-ci/social-science/q30.png', 'Question 30: the picture of a gardener printed beside the two answer lines.', false, null)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
      and q.config ->> 'subject' = 'social-science'
      and q.config ->> 'question_number' = s.n::text);
