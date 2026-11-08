-- Examination of Grade 1 – Language Arts  (Oak International School Benin)
--
-- Source document: "Grade 1 / CI — End of Second Marking Period Examination
-- 2026/2027, Examination Papers & Marking Scheme" (21 pages, supplied PDF).
-- This step writes the 30 printed questions of the LANGUAGE ART paper, pages
-- 10-13, and the 40 marks its marking scheme (page 20) assigns to them.
-- The examination title reads "Language Arts" (the owner's spelling); the paper
-- itself is headed "LANGUAGE ART", and both are recorded in `config`.
--
-- Fidelity rules applied:
--   * every prompt is the printed wording; line breaks are joined, no word is
--     added, reordered or dropped;
--   * the two printed reading passages (STORY 1: OUR TIFFIN BREAK, and STORY 2:
--     WONDERFUL WORKERS) are reproduced in full in the prompts of the questions
--     they serve, because a pupil cannot answer a story question without the
--     story;
--   * every option is the printed option, in printed order, with the printed
--     label, so a question with three printed choices has three options;
--   * every correct answer is the marking scheme's own answer for that question
--     number. 30 of 30 are printed;
--   * marks are the printed ones: Section A 1 mark per question, Section B
--     2 marks per question, 40 in total;
--   * Section B tasks are manual items the teacher marks against the printed
--     scheme;
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
       array['grade1', 'ci', 'second-marking-period', '2026-2027', 'language-arts']::text[],
       'published', 'approved',
       jsonb_build_object('source', 'oak-grade1-ci-2026-2027',
                          'subject', 'language-arts',
                          'printed_subject_heading', 'LANGUAGE ART',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null)
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 10-12) ─────────────────
  (1, 'single_choice', 1, 'A',
   $txt$STORY 1: OUR TIFFIN BREAK — The school bell rings at ten. Kemi and Tolu open their tiffin boxes. Kemi has sweet bread and a red apple. They share happily.   Q1: What is in Kemi's tiffin box?$txt$,
   $txt$Answer: bread and apple.  1 mark for ticking "bread and apple".$txt$,
   'W1/W2: Tiffin Break', 'easy', 'Reading comprehension',
   '/exam-figures/grade1-ci/language-arts/q01.png', 'Question 1: Story 1 panel with the pictures of a loaf of bread and a red apple.', false, null),
  (2, 'true_false', 1, 'A',
   $txt$From the story, tick YES or NO:  Kemi and Tolu share happily.   (STORY 1: OUR TIFFIN BREAK — The school bell rings at ten. Kemi and Tolu open their tiffin boxes. Kemi has sweet bread and a red apple. They share happily.)$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W1/W2: Tiffin Break', 'easy', 'Reading comprehension',
   '/exam-figures/grade1-ci/language-arts/q02.png', 'Question 2: the picture of a girl printed beside the YES and NO boxes.', false, null),
  (3, 'single_choice', 1, 'A',
   $txt$Circle the picture with "ee" (tr-ee):$txt$,
   $txt$Answer: A (tree).  1 mark for circling A.$txt$,
   'W1: Phonics "ee"', 'easy', 'Phonics: ee and ea',
   '/exam-figures/grade1-ci/language-arts/q03.png', 'Question 3: pictures A, B and C.', false, null),
  (4, 'single_choice', 1, 'A',
   $txt$Circle the picture with "ea" (l-ea-f):$txt$,
   $txt$Answer: B (leaf).  1 mark for circling B.$txt$,
   'W1: Phonics "ea"', 'easy', 'Phonics: ee and ea',
   '/exam-figures/grade1-ci/language-arts/q04.png', 'Question 4: pictures A, B and C.', false, null),
  (5, 'single_choice', 1, 'A',
   $txt$Kemi ______ a red apple.$txt$,
   $txt$Answer: has.  1 mark for ticking "has".$txt$,
   'W1: Use of has and have', 'easy', 'Grammar: has and have',
   '/exam-figures/grade1-ci/language-arts/q05.png', 'Question 5: the picture of a red apple printed beside the answer lines.', false, null),
  (6, 'single_choice', 1, 'A',
   $txt$I ______ a yellow banana.$txt$,
   $txt$Answer: have.  1 mark for ticking "have".$txt$,
   'W1: Use of has and have', 'easy', 'Grammar: has and have',
   '/exam-figures/grade1-ci/language-arts/q06.png', 'Question 6: the picture of a yellow banana printed beside the answer lines.', false, null),
  (7, 'single_choice', 1, 'A',
   $txt$Complete the word: f i __ __$txt$,
   $txt$Answer: sh (fish).  1 mark for ticking "sh".$txt$,
   'W2: Formation of words', 'easy', 'Phonics: word formation',
   '/exam-figures/grade1-ci/language-arts/q07.png', 'Question 7: the picture of a fish printed beside the answer lines.', false, null),
  (8, 'single_choice', 1, 'A',
   $txt$Circle the picture for MANGO:$txt$,
   $txt$Answer: B (mango).  1 mark for circling B.$txt$,
   'W2: Picture words', 'easy', 'Picture words',
   '/exam-figures/grade1-ci/language-arts/q08.png', 'Question 8: pictures A, B and C.', false, null),
  (9, 'single_choice', 1, 'A',
   $txt$Who bakes warm bread?   (STORY 2: WONDERFUL WORKERS — Wonderful workers help our town every day. Mr Ola is a baker who bakes warm bread. Dr Ada is a kind doctor who helps sick children get well.)$txt$,
   $txt$Answer: Mr Ola the baker.  1 mark for ticking "Mr Ola (baker)".$txt$,
   'W3/W4: Wonderful Workers', 'easy', 'Reading comprehension',
   '/exam-figures/grade1-ci/language-arts/q09.png', 'Question 9: the picture of the baker printed beside the answer lines.', false, null),
  (10, 'true_false', 1, 'A',
   $txt$From the story, tick YES or NO:  Dr Ada helps sick children.   (STORY 2: WONDERFUL WORKERS — Wonderful workers help our town every day. Mr Ola is a baker who bakes warm bread. Dr Ada is a kind doctor who helps sick children get well.)$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W3/W4: Wonderful Workers', 'easy', 'Reading comprehension',
   '/exam-figures/grade1-ci/language-arts/q10.png', 'Question 10: the picture of the doctor printed beside the YES and NO boxes.', false, null),
  (11, 'single_choice', 1, 'A',
   $txt$Circle the picture with "oa" (g-oa-t):$txt$,
   $txt$Answer: A (goat).  1 mark for circling A.$txt$,
   'W3: Phonics "oa"', 'easy', 'Phonics: oa, o-e and ol',
   '/exam-figures/grade1-ci/language-arts/q11.png', 'Question 11: pictures A, B and C.', false, null),
  (12, 'single_choice', 1, 'A',
   $txt$Tick the word with "o-e" (as in home):$txt$,
   $txt$Answer: rope.  1 mark for ticking "rope".$txt$,
   'W3: Phonics "o-e"', 'easy', 'Phonics: oa, o-e and ol',
   null, null, false, null),
  (13, 'single_choice', 1, 'A',
   $txt$Tick the word with "ol":$txt$,
   $txt$Answer: gold.  1 mark for ticking "gold".$txt$,
   'W3: Phonics "ol"', 'easy', 'Phonics: oa, o-e and ol',
   null, null, false, null),
  (14, 'single_choice', 1, 'A',
   $txt$Short form (contraction) of "can not":$txt$,
   $txt$Answer: can't.  1 mark for ticking "can't".$txt$,
   'W3: Contractions', 'easy', 'Contractions',
   null, null, false, null),
  (15, 'true_false', 1, 'A',
   $txt$Tick YES or NO:  is not = isn't$txt$,
   $txt$Answer: YES.  1 mark for YES.$txt$,
   'W3: Contractions', 'easy', 'Contractions',
   null, null, false, null),
  (16, 'single_choice', 1, 'A',
   $txt$______ is your class teacher?$txt$,
   $txt$Answer: Who.  1 mark for ticking "Who".$txt$,
   'W4: Use of Who and What', 'easy', 'Question words: who and what',
   '/exam-figures/grade1-ci/language-arts/q16.png', 'Question 16: the picture of the class teacher printed beside the answer lines.', false, null),
  (17, 'single_choice', 1, 'A',
   $txt$______ is inside the box?$txt$,
   $txt$Answer: What.  1 mark for ticking "What".$txt$,
   'W4: Use of Who and What', 'easy', 'Question words: who and what',
   '/exam-figures/grade1-ci/language-arts/q17.png', 'Question 17: the picture of a loaf of bread printed beside the answer lines.', false, null),
  (18, 'single_choice', 1, 'A',
   $txt$Circle the DOCTOR:$txt$,
   $txt$Answer: B (doctor).  1 mark for circling B.$txt$,
   'W4: Occupations', 'easy', 'Jobs and workers',
   '/exam-figures/grade1-ci/language-arts/q18.png', 'Question 18: pictures A, B and C.', false, null),
  (19, 'short_answer', 1, 'A',
   $txt$Write the missing word:  We ______ books in our bag.   (Word bank, Q19-Q20: have, teacher, has, doctor)$txt$,
   $txt$Answer: have.  1 mark for "have".$txt$,
   'W1: Use of has / have', 'easy', 'Grammar: has and have',
   '/exam-figures/grade1-ci/language-arts/q19.png', 'Question 19: the picture of a book printed beside the answer line.', false, null),
  (20, 'short_answer', 1, 'A',
   $txt$Write the missing word:  A ______ teaches pupils.   (Word bank, Q19-Q20: have, teacher, has, doctor)$txt$,
   $txt$Answer: teacher.  1 mark for "teacher".$txt$,
   'W4: Occupations', 'easy', 'Jobs and workers',
   '/exam-figures/grade1-ci/language-arts/q20.png', 'Question 20: the picture of the teacher printed beside the answer line.', false, null),

  -- ── Section B: 10 tasks, 2 marks each (pages 12-13), teacher-marked ────
  (21, 'open_ended', 2, 'B',
   $txt$Write the word (tree, leaf):   1. ______   2. ______$txt$,
   $txt$Answer: 1 = tree, 2 = leaf.  Award 1 mark for tree and 1 mark for leaf.$txt$,
   'W1/W2: Write words for pictures', 'medium', 'Picture words',
   '/exam-figures/grade1-ci/language-arts/q21.png', 'Question 21: two pictures to name from the box tree, leaf.', false, null),
  (22, 'open_ended', 2, 'B',
   $txt$Fill in oa or ol to make words:   1. g + ______ + t = ______   2. g + ______ + d = ______$txt$,
   $txt$Answer: 1 = goat (oa), 2 = gold (ol).  Award 1 mark for goat/oa and 1 mark for gold/ol.$txt$,
   'W3: Phonics oa / ol', 'medium', 'Phonics: oa, o-e and ol',
   '/exam-figures/grade1-ci/language-arts/q22.png', 'Question 22: the goat and the star printed beside 1. g+oa+t and 2. g+ol+d.', false, null),
  (23, 'open_ended', 2, 'B',
   $txt$Fill in has or have :   1. A bird  ______  two wings.   Ans: ______   2. They  ______  sweet oranges.   Ans: ______$txt$,
   $txt$Answer: 1 = has, 2 = have.  Award 1 mark for has and 1 mark for have.$txt$,
   'W1: Grammar: has and have', 'medium', 'Grammar: has and have',
   null, null, false, null),
  (24, 'open_ended', 2, 'B',
   $txt$Write from box: isn't • don't   1. is not  = ______   2. do not  = ______$txt$,
   $txt$Answer: 1 = isn't, 2 = don't.  Award 1 mark for isn't and 1 mark for don't.$txt$,
   'W3: Grammar: contractions', 'medium', 'Contractions',
   null, null, false, null),
  (25, 'open_ended', 2, 'B',
   $txt$Fill in Who or What :   1. ______ bakes bread?   Ans: ______   2. ______ is on the table?   Ans: ______$txt$,
   $txt$Answer: 1 = Who, 2 = What.  Award 1 mark for Who and 1 mark for What.$txt$,
   'W4: Grammar: Who and What', 'medium', 'Question words: who and what',
   null, null, false, null),
  (26, 'open_ended', 2, 'B',
   $txt$Match each worker to their work:   Doctor • Teacher • Baker • Farmer     and: Teaches pupils • Helps the sick • Grows food • Bakes bread$txt$,
   $txt$Answer: Doctor -> Helps the sick, Teacher -> Teaches pupils, Baker -> Bakes bread, Farmer -> Grows food.  Award 0.5 mark for each correct line.$txt$,
   'W3/W4: Match workers to their work', 'medium', 'Jobs and workers',
   '/exam-figures/grade1-ci/language-arts/q26.png', 'Question 26: four workers on the left, four kinds of work on the right.', false, null),
  (27, 'open_ended', 2, 'B',
   $txt$Write the job from box (farmer, baker):   1. ______   2. ______$txt$,
   $txt$Answer: 1 = farmer, 2 = baker.  Award 1 mark for farmer and 1 mark for baker.$txt$,
   'W4: Name occupations', 'medium', 'Jobs and workers',
   '/exam-figures/grade1-ci/language-arts/q27.png', 'Question 27: two pictures of workers to name from the box farmer, baker.', false, null),
  (28, 'open_ended', 2, 'B',
   $txt$Make a sentence about the picture:   Words: The girl / has / an apple.$txt$,
   $txt$Answer: The girl has an apple.  Award 2 marks for a sensible sentence (1 mark partial).$txt$,
   'W2: Make a sentence', 'medium', 'Sentence building',
   '/exam-figures/grade1-ci/language-arts/q28.png', 'Question 28: picture with the words The girl / has / an apple.', false, null),
  (29, 'open_ended', 2, 'B',
   $txt$Story (Part 1) — Box: seed • water     Bola plants a (1) ______   She gives it (2) ______$txt$,
   $txt$Answer: 1 = seed, 2 = water.  Award 1 mark for seed and 1 mark for water.$txt$,
   'W4: Picture story', 'medium', 'Picture story',
   '/exam-figures/grade1-ci/language-arts/q29.png', 'Question 29: picture story, first part.', false, null),
  (30, 'open_ended', 2, 'B',
   $txt$Story (Part 2) — Box: flower • garden     A pink (3) ______ grows:   in her nice (4) ______$txt$,
   $txt$Answer: 3 = flower, 4 = garden.  Award 1 mark for flower and 1 mark for garden.$txt$,
   'W4: Picture story', 'medium', 'Picture story',
   '/exam-figures/grade1-ci/language-arts/q30.png', 'Question 30: picture story, second part.', false, null)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade1-ci-2026-2027'
      and q.config ->> 'subject' = 'language-arts'
      and q.config ->> 'question_number' = s.n::text);
