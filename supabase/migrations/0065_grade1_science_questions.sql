-- Examination of Grade 1 – Science  (Oak International School Benin)
--
-- Source document: "Grade 1 / CI — End of Second Marking Period Examination
-- 2026/2027, Examination Papers & Marking Scheme" (21 pages, supplied PDF).
-- This step writes the 30 printed questions of the SCIENCE paper, pages 6-9, and
-- the 40 marks its marking scheme (page 19) assigns to them.
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
--   * Section B tasks (labelling, drawing, sorting, matching) are manual items
--     the teacher marks against the printed scheme;
--   * Q21 and Q22 share one printed plant diagram and the scheme splits the four
--     labels between them (1 = flower, 2 = leaf; 3 = stem, 4 = root), so each
--     question carries the shared figure and its own two labels;
--   * the pictures are the printed vector artwork, rendered from each question's
--     own card (scripts/grade1-figures.py).
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
       array['grade1', 'ci', 'second-marking-period', '2026-2027', 'science']::text[],
       'published', 'approved',
       jsonb_build_object('source', 'oak-grade1-ci-2026-2027',
                          'subject', 'science',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null)
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 6-8) ───────────────────
  (1, 'single_choice', 1, 'A',
   $txt$Circle the FLOWER:$txt$,
   $txt$Answer: B (flower).  1 mark for circling B.$txt$,
   'W1: Plant life — types and plant parts', 'easy', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q01.png', 'Question 1: pictures A, B and C.', false, null),
  (2, 'single_choice', 1, 'A',
   $txt$Circle the LEAF:$txt$,
   $txt$Answer: A (leaf).  1 mark for circling A.$txt$,
   'W1: Plant life — types and plant parts', 'easy', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q02.png', 'Question 2: pictures A, B and C.', false, null),
  (3, 'single_choice', 1, 'A',
   $txt$Circle the big tall TREE:$txt$,
   $txt$Answer: C (tree).  1 mark for circling C.$txt$,
   'W1: Plant life — types and plant parts', 'easy', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q03.png', 'Question 3: pictures A, B and C.', false, null),
  (4, 'single_choice', 1, 'A',
   $txt$Which part grows under soil?$txt$,
   $txt$Answer: root.  1 mark for ticking root.$txt$,
   'W1: Plant life — types and plant parts', 'easy', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q04.png', 'Question 4: a plant with root, flower and leaf to choose from.', false, null),
  (5, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  Most plant leaves are green.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W1: Plant life — types and plant parts', 'easy', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q05.png', 'Question 5: a leaf beside the statement.', false, null),
  (6, 'single_choice', 1, 'A',
   $txt$Circle the FOOD from a plant:$txt$,
   $txt$Answer: A (mango).  1 mark for circling A.$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q06.png', 'Question 6: pictures A, B and C.', false, null),
  (7, 'single_choice', 1, 'A',
   $txt$Circle the VEGETABLE we eat:$txt$,
   $txt$Answer: B (carrot).  1 mark for circling B.$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q07.png', 'Question 7: pictures A, B and C.', false, null),
  (8, 'single_choice', 1, 'A',
   $txt$Tick the sweet fruit from a plant:$txt$,
   $txt$Answer: banana.  1 mark for ticking banana.$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q08.png', 'Question 8: three printed choices, banana, stone and cup.', false, null),
  (9, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  Plants give us fruits to eat.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q09.png', 'Question 9: statement about fruit.', false, null),
  (10, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  An egg grows on a tree.$txt$,
   $txt$Answer: NO.  1 mark for NO.$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q10.png', 'Question 10: statement about an egg and a tree.', false, null),
  (11, 'single_choice', 1, 'A',
   $txt$Circle the animal with WINGS:$txt$,
   $txt$Answer: B (bird).  1 mark for circling B.$txt$,
   'W3: Animal life — types of animals', 'easy', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q11.png', 'Question 11: pictures A, B and C.', false, null),
  (12, 'single_choice', 1, 'A',
   $txt$Circle the FARM animal:$txt$,
   $txt$Answer: A (cow).  1 mark for circling A.$txt$,
   'W3: Animal life — types of animals', 'easy', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q12.png', 'Question 12: pictures A, B and C.', false, null),
  (13, 'single_choice', 1, 'A',
   $txt$Circle the big WILD animal:$txt$,
   $txt$Answer: C (elephant).  1 mark for circling C.$txt$,
   'W3: Animal life — types of animals', 'easy', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q13.png', 'Question 13: pictures A, B and C.', false, null),
  (14, 'single_choice', 1, 'A',
   $txt$Which animal swims with fins?$txt$,
   $txt$Answer: fish.  1 mark for ticking fish.$txt$,
   'W3: Animal life — types of animals', 'easy', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q14.png', 'Question 14: three printed choices, fish, goat and hen.', false, null),
  (15, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  A butterfly has wings to fly.$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W3: Animal life — types of animals', 'easy', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q15.png', 'Question 15: statement about a butterfly.', false, null),
  (16, 'single_choice', 1, 'A',
   $txt$Where does a FISH live?$txt$,
   $txt$Answer: B (water).  1 mark for circling B.$txt$,
   'W4: Animal life — animal homes', 'easy', 'Animal homes',
   '/exam-figures/grade1-ci/science/q16.png', 'Question 16: pictures A, B and C.', false, null),
  (17, 'single_choice', 1, 'A',
   $txt$Where does a BIRD live?$txt$,
   $txt$Answer: A (nest in tree).  1 mark for circling A.$txt$,
   'W4: Animal life — animal homes', 'easy', 'Animal homes',
   '/exam-figures/grade1-ci/science/q17.png', 'Question 17: pictures A, B and C.', false, null),
  (18, 'single_choice', 1, 'A',
   $txt$A rabbit lives in a hole called a:$txt$,
   $txt$Answer: burrow.  1 mark for ticking burrow.$txt$,
   'W4: Animal life — animal homes', 'easy', 'Animal homes',
   '/exam-figures/grade1-ci/science/q18.png', 'Question 18: three printed choices, burrow, nest and pond.', false, null),
  (19, 'short_answer', 1, 'A',
   $txt$Write the missing word:  Plants give us good ______ to eat.   (Word bank, Q19-Q20: food, farm, root, water)$txt$,
   $txt$Answer: food.  1 mark for "food".$txt$,
   'W2: Plant life — plants give us food', 'easy', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q19.png', 'Question 19: word bank shared with question 20.', false, null),
  (20, 'short_answer', 1, 'A',
   $txt$Write the missing word:  A cow lives on a ______.   (Word bank, Q19-Q20: food, farm, root, water)$txt$,
   $txt$Answer: farm.  1 mark for "farm".$txt$,
   'W4: Animal life — animal homes', 'easy', 'Animal homes',
   '/exam-figures/grade1-ci/science/q20.png', 'Question 20: word bank shared with question 19.', false, null),

  -- ── Section B: 10 tasks, 2 marks each (pages 8-9), teacher-marked ──────
  (21, 'open_ended', 2, 'B',
   $txt$21 & 22 Label the 4 plant parts (flower, leaf, stem, root):  Q21 (2 marks):  1. ______  2. ______$txt$,
   $txt$Answer: 1 = flower, 2 = leaf.  Award 1 mark for flower and 1 mark for leaf.$txt$,
   'W1: Parts of a plant', 'medium', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q21.png', 'Shared plant diagram with four label lines; this question carries labels 1 and 2.', false, null),
  (22, 'open_ended', 2, 'B',
   $txt$21 & 22 Label the 4 plant parts (flower, leaf, stem, root):  Q22 (2 marks):  3. ______  4. ______$txt$,
   $txt$Answer: 3 = stem, 4 = root.  Award 1 mark for stem and 1 mark for root.$txt$,
   'W1: Parts of a plant', 'medium', 'Plant life: types and parts',
   '/exam-figures/grade1-ci/science/q22.png', 'Shared plant diagram with four label lines; this question carries labels 3 and 4.', false, null),
  (23, 'open_ended', 2, 'B',
   $txt$Draw a PLANT and write what it gives us:$txt$,
   $txt$Answer: a plant drawing plus food or fruit.  Award 1 mark for a recognisable plant and 1 mark for food/fruit.$txt$,
   'W1/W2: Draw a plant and what it gives', 'medium', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q23.png', 'Question 23: a drawing frame and a line for what the plant gives us.', false, null),
  (24, 'open_ended', 2, 'B',
   $txt$Write the 2 FOODS we get from plants:     1. ______   2. ______$txt$,
   $txt$Answer: apple and carrot (from the box apple, ball, carrot, cup).  Award 1 mark for each correct plant food.$txt$,
   'W2: Identify plant foods', 'medium', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q24.png', 'Question 24: a word box with apple, ball, carrot and cup.', false, null),
  (25, 'open_ended', 2, 'B',
   $txt$Sort from box (fish, cow, frog, goat):  2 WATER animals:  1. ______   2. ______$txt$,
   $txt$Answer: fish, frog.  Award 1 mark for fish and 1 mark for frog (any order).$txt$,
   'W4: Sort animals by where they live', 'medium', 'Animal homes',
   '/exam-figures/grade1-ci/science/q25.png', 'Question 25: a word box with fish, cow, frog and goat.', false, null),
  (26, 'open_ended', 2, 'B',
   $txt$Sort from box (fish, cow, frog, goat):  2 FARM animals:  1. ______   2. ______$txt$,
   $txt$Answer: cow, goat.  Award 1 mark for cow and 1 mark for goat (any order).$txt$,
   'W4: Sort animals by where they live', 'medium', 'Animal homes',
   '/exam-figures/grade1-ci/science/q26.png', 'Question 26: a word box with fish, cow, frog and goat.', false, null),
  (27, 'open_ended', 2, 'B',
   $txt$Match each animal to its group:   Bird • Fish • Lion • Hen     and: Swims well • Has wings • Farm bird • Wild animal$txt$,
   $txt$Answer: Bird -> Has wings, Fish -> Swims well, Lion -> Wild animal, Hen -> Farm bird.  Award 0.5 mark for each correct line.$txt$,
   'W3: Match types of animals', 'medium', 'Animal life: types of animals',
   '/exam-figures/grade1-ci/science/q27.png', 'Question 27: four animals on the left, four groups on the right.', false, null),
  (28, 'open_ended', 2, 'B',
   $txt$Match each animal to its HOME:   Bird • Rabbit • Fish • Cow     and: Burrow • Nest • Farm • Water$txt$,
   $txt$Answer: Bird -> Nest, Rabbit -> Burrow, Fish -> Water, Cow -> Farm.  Award 0.5 mark for each correct line.$txt$,
   'W4: Match animals and homes', 'medium', 'Animal homes',
   '/exam-figures/grade1-ci/science/q28.png', 'Question 28: four animals on the left, four homes on the right.', false, null),
  (29, 'open_ended', 2, 'B',
   $txt$Look at the picture and complete:   Box: fruit / stone     A fruit tree gives us ______$txt$,
   $txt$Answer: mango / fruit / food.  Award 2 marks for a sensible word or short sentence.$txt$,
   'W2: Write about a fruit tree', 'medium', 'Plants give us food',
   '/exam-figures/grade1-ci/science/q29.png', 'Question 29: picture and a completion box.', false, null),
  (30, 'open_ended', 2, 'B',
   $txt$Look at the picture and complete:   Box: fish • water     A ______ lives in ______$txt$,
   $txt$Answer: A fish lives in water.  Award 1 mark for "fish" and 1 mark for "water".$txt$,
   'W3/W4: Write about an animal and its home', 'medium', 'Animal homes',
   '/exam-figures/grade1-ci/science/q30.png', 'Question 30: picture and a completion box.', false, null)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
      and q.config ->> 'subject' = 'science'
      and q.config ->> 'question_number' = s.n::text);
