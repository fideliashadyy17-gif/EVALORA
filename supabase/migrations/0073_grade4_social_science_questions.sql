-- Examination of Grade 4 – Social Science  (Oak International School)
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf"
-- (supplied PDF): SOCIAL SCIENCE paper pages 11-13, marking scheme page 17.
--
-- The same fidelity rules as the other three papers apply. Points specific to
-- this paper:
--   * the paper is built on printed data — a tally chart (Q22), a Venn diagram
--     (Q23), a bar graph (Q25) and a country table (Q26). Each is carried as the
--     figure it is printed as, so the pupil reads the same numbers the marking
--     scheme answers from (Green Leaf Shop 12, Supermarket 5, total 40; North 8,
--     South 3, East 6, West 9; Country A 95%/24/90%, B 82%/32/65%, C 64%/48/30%);
--   * the Venn diagram card prints no figure caption of its own, so the picture
--     Venn picture is attached to Q23, the question that reads it. Q24 is a
--     team-task question with no diagram in the source, so it carries none;
--   * Q3 prints four options (Pillow / Bicycle / Majority / Umbrella) while the
--     scheme answers "C (Compare / Majority)". The printed options are kept as
--     printed and the key is recorded as the scheme's own letter C; the mismatch
--     between the scheme's wording ("Compare") and the printed option text
--     ("Majority") is flagged rather than resolved by editing an option;
--   * Q13 prints "A group task works best when every member shares the work" and
--     the scheme keys FALSE with the guide "everyone contribut[es]". A statement
--     about every member sharing the work reads as true, so the printed key is
--     recorded and the contradiction is flagged for the teacher;
--   * the Section B model answers are cut off at the cell edge throughout; the
--     readable part is transcribed and every affected question is flagged.
--
-- Idempotent: a question whose source marker and number already exist is skipped.

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
       array['grade4', 'ce2', 'second-marking-period', '2026-2027', 'social-science']::text[],
       'published', s.review_status,
       jsonb_build_object('source', 'oak-grade4-2026-2027',
                          'subject', 'social-science',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null,
                          'review_required', s.review_required,
                          'review_reason', s.review_reason) || s.extra
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 11-12) ─────────────────
  (1, 'single_choice', 1, 'A',
   $txt$What is the FIRST step when starting a social science research project?$txt$,
   $txt$A (Choose a clear researc[h question]). 1m for A.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Starting research',
   null, null, false, null, 'approved', '{}'::jsonb),
  (2, 'single_choice', 1, 'A',
   $txt$Breaking information or data into parts to find patterns is called:$txt$,
   $txt$B (Analysis). 1m for B.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'What analysis is',
   null, null, false, null, 'approved', '{}'::jsonb),
  (3, 'single_choice', 1, 'A',
   $txt$Which of these words is an ANALYSIS word used when comparing data?$txt$,
   $txt$C (Compare / Majority). 1m for C.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Analysis words',
   null, null, true,
   'The card prints four options — Pillow, Bicycle, Majority, Umbrella — and the marking scheme answers "C (Compare / Majority)". The printed key letter C is recorded against the printed option "Majority"; the scheme''s extra word "Compare" is not one of the printed options, so the mismatch is flagged rather than repaired.', 'reviewed', '{}'::jsonb),
  (4, 'single_choice', 1, 'A',
   $txt$Examining a challenge using real facts and listening to all sides is:$txt$,
   $txt$A (Fair thinking). 1m for A.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Fair thinking',
   null, null, false, null, 'approved', '{}'::jsonb),
  (5, 'single_choice', 1, 'A',
   $txt$In a tally chart, four upright strokes with one diagonal slash represent:$txt$,
   $txt$B (5). 1m for B.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Tally charts',
   null, null, false, null, 'approved', '{}'::jsonb),
  (6, 'single_choice', 1, 'A',
   $txt$In a group task, the pupil who writes down the group's ideas is the:$txt$,
   $txt$C (Recorder / Scribe). 1m for C.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'easy', 'Group roles',
   null, null, false, null, 'approved', '{}'::jsonb),
  (7, 'single_choice', 1, 'A',
   $txt$If a large neighbourhood has NO vegetable shop nearby, residents have:$txt$,
   $txt$D (Poor / Low access). 1m for D.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'easy', 'Access to services',
   null, null, false, null, 'approved', '{}'::jsonb),
  (8, 'single_choice', 1, 'A',
   $txt$When people keep community drains clean, the effect on others is:$txt$,
   $txt$A (Healthy & happy commun[ity] / Less flooding & fewer sicknesses). 1m for A.$txt$,
   'W3: Using Charts in Analysis; Actions & Effects', 'easy', 'Actions and effects',
   null, null, false, null, 'approved', '{}'::jsonb),
  (9, 'single_choice', 1, 'A',
   $txt$Judging how well a programme or school works using evidence is called:$txt$,
   $txt$B (Evaluation). 1m for B.$txt$,
   'W4: What is Evaluation? Schools Abroad; Sources', 'easy', 'What evaluation is',
   null, null, false, null, 'approved', '{}'::jsonb),
  (10, 'single_choice', 1, 'A',
   $txt$Which of these is a reliable SOURCE OF EVALUATION for a school?$txt$,
   $txt$C (Inspection report & pu[pil results] / Inspection & test reports). 1m for C.$txt$,
   'W4: What is Evaluation? Schools Abroad; Sources', 'easy', 'Sources of evaluation',
   null, null, false, null, 'approved', '{}'::jsonb),
  (11, 'true_false', 1, 'A',
   $txt$True or False (Fair Thinking): Blaming someone without checking facts is fair thinking.$txt$,
   $txt$FALSE (unfair / biased th[inking]). 1m for FALSE.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Fair thinking',
   null, null, false, null, 'approved', '{}'::jsonb),
  (12, 'true_false', 1, 'A',
   $txt$True or False (Venn Diagrams): The overlapping centre of a Venn diagram shows shared items.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Venn diagrams',
   null, null, false, null, 'approved', '{}'::jsonb),
  (13, 'true_false', 1, 'A',
   $txt$True or False (Group Tasks): A group task works best when every member shares the work.$txt$,
   $txt$FALSE (everyone contribut[es] / shares the work). 1m for FALSE.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'medium', 'Group tasks',
   null, null, true,
   'The printed statement says a group task works best when every member shares the work, which reads as TRUE, while the marking scheme keys FALSE with the guide "everyone contribut[es]". The printed key is recorded and the contradiction is flagged; the teacher decides which the school intends.', 'reviewed', '{}'::jsonb),
  (14, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Tally Marks): 3 tally bundles of five plus 2 single strokes = ______.$txt$,
   $txt$17 (15 + 2). 1m for 17.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'easy', 'Tally charts',
   null, null, false, null, 'approved', '{}'::jsonb),
  (15, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Country Data): Comparing literacy and population of nations uses ______ data.$txt$,
   $txt$country. 1m for country.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'easy', 'Country data',
   null, null, false, null, 'approved', '{}'::jsonb),
  (16, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Evaluation Sources): Surveys, test scores, and visits are ______ of evaluation.$txt$,
   $txt$source / tool. 1m for source/tool.$txt$,
   'W4: What is Evaluation? Schools Abroad; Sources', 'easy', 'Sources of evaluation',
   null, null, false, null, 'approved', '{}'::jsonb),
  (17, 'single_choice', 1, 'A',
   $txt$Odd One Out — Circle the word NOT used for data analysis: compare | majority | least | pillow$txt$,
   $txt$pillow (not an analysis w[ord]). 1m for pillow.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'medium', 'Odd one out',
   null, null, false, null, 'approved', '{}'::jsonb),
  (18, 'ordering', 1, 'A',
   $txt$Order these 3 inquiry steps from FIRST (1) to LAST (3): Evaluate results , Collect data , Analyse data$txt$,
   $txt$1. Collect data -> 2. Ana[lyse data] -> 3. Evaluate results. 1m for correct order.$txt$,
   'W1-4: Ordering inquiry steps', 'medium', 'Inquiry steps',
   null, null, false, null, 'approved', '{}'::jsonb),
  (19, 'single_choice', 1, 'A',
   $txt$Circle the action that has a POSITIVE effect on others: Littering the park | Planting shade trees | Wasting water$txt$,
   $txt$Planting shade trees / Cl[ean…]. 1m for Planting shade trees.$txt$,
   'W3: Using Charts in Analysis; Actions & Effects', 'easy', 'Actions and effects',
   null, null, false, null, 'approved', '{}'::jsonb),
  (20, 'matching', 1, 'A',
   $txt$Match each description to its chart (Bar Graph / Venn): (i) Overlapping circles: ____ (ii) Bars of height: ____$txt$,
   $txt$(i) Venn diagram, (ii) Ba[r graph]. 0.5m each.$txt$,
   'W1/W3: Charts and graphs', 'easy', 'Charts and graphs',
   null, null, false, null, 'approved',
   jsonb_build_object('pairs', jsonb_build_array(
     jsonb_build_object('left', 'Overlapping circles', 'right', 'Venn'),
     jsonb_build_object('left', 'Bars of height', 'right', 'Bar Graph')))),

  -- ── Section B: 10 questions, 30 marks (pages 12-13), teacher-marked ────
  (21, 'open_ended', 2, 'B',
   $txt$(a) Define analysis & 2 analysis words. (b) Fair vs unfair thinking:
(a) Analysis is:
2 Analysis words:
(b) Fair thinking:
Unfair thinking:
Example:$txt$,
   $txt$(a) Breaking data into pa[rt]s… 1m analysis + words; 1m fair vs un[fair]; 2m.$txt$,
   'W1: Research; Analysis Words; Fair Thinking; Charts', 'medium', 'Analysis and fair thinking',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Breaking data into pa…", "1m analysis + words; 1m fair vs un…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (22, 'open_ended', 3, 'B',
   $txt$DIAGRAM 1 (Tally Chart): Survey of 40 families on vegetable shops:
Vegetable Source    Tally Marks    Number
Central Market                   15
Green Leaf Shop                  ____
Street Stall                     8
Supermarket                      ____
(a) Green Leaf & Supermkt:
(b) Total families =
(c) Most used source:$txt$,
   $txt$(a) Green Leaf Shop = 12, Supermarket = 5; (b) Total = 40; (c) Central Market. 1m for 12 & 5; 1m for Total = 40; 1m for the most used source; 3m.$txt$,
   'W1/W2: Tally charts; Veg shop access', 'medium', 'Reading a tally chart',
   '/exam-figures/grade4/social-science/q22.png',
   'Question 22: a tally chart of vegetable sources — Central Market 15, Green Leaf Shop, Street Stall 8, Supermarket — with tally marks and blanks for two numbers.', false, null, 'approved', '{}'::jsonb),
  (23, 'open_ended', 3, 'B',
   $txt$DIAGRAM 2 (Venn Diagram): Compare vegetables in Shop A & Shop B:
Shop A Only
Both
Shop B Only
• Carrots
• Lettuce
• Tomatoes
• Onions
• Yam
• Pepper
(a) Sold in Shop A only:
(b) Sold in BOTH shops:
(c) Total veg types:$txt$,
   $txt$(a) Carrots & Lettuce; (b) Tomatoes & Onions; (c) 6. 1m each correct answer (a)-(c); 3m.$txt$,
   'W1/W3: Venn diagrams; Comparing data', 'medium', 'Reading a Venn diagram',
   '/exam-figures/grade4/social-science/q23.png',
   'Question 23: a Venn diagram of two shops — "Shop A Only" (Carrots, Lettuce), "Both" (Tomatoes, Onions) and "Shop B Only" (Yam, Pepper).', false, null, 'approved', '{}'::jsonb),
  (24, 'open_ended', 2, 'B',
   $txt$Group Task: State 2 good team behaviours and 2 group roles:
(a) Behaviour 1:
Behaviour 2:
(b) Group Role 1:
Group Role 2:$txt$,
   $txt$(a) Listen respectfully, … 1m for 2 behaviours; 1m for 2 grou[p roles]; 2m.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'medium', 'Group tasks',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Listen respectfully, …", "1m for 2 grou…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (25, 'open_ended', 3, 'B',
   $txt$DIAGRAM 3 (Bar Graph): Fresh vegetable shops in 4 community zones:
0 2 4 6 8 10
8 North
3 South
6 East
9 West
(a) Lowest access zone:
(b) West minus South =
(c) How to help South:$txt$,
   $txt$(a) South Zone (3 shops); (b) 6; (c) … 1m for South (3); 1m for 6; 1m for …; 3m.$txt$,
   'W2/W3: Bar graphs; Analysis', 'medium', 'Reading a bar graph',
   '/exam-figures/grade4/social-science/q25.png',
   'Question 25: a bar graph of vegetable shops in four zones — North 8, South 3, East 6, West 9 — on a 0 to 10 scale.', false, null, 'approved', '{}'::jsonb),
  (26, 'open_ended', 3, 'B',
   $txt$DIAGRAM 4 (Country Data): Analyse education data for Countries A–C:
Country    Literacy    Pupils/Class    Library %
Country A    95%    24    90%
Country B    82%    32    65%
Country C    64%    48    30%
(a) Highest literacy:
(b) Most crowded class:
(c) Help for Country C:$txt$,
   $txt$(a) Country A (95%); (b) Country C (48); (c) … 1m per part (a)-(c); 3m.$txt$,
   'W2/W4: Country data; Evaluation', 'medium', 'Reading a data table',
   '/exam-figures/grade4/social-science/q26.png',
   'Question 26: a country data table — literacy, pupils per class and library percentage for Countries A, B and C.', false, null, 'approved', '{}'::jsonb),
  (27, 'open_ended', 2, 'B',
   $txt$State TWO community issues and suggest ONE solution for each:
Issue 1:
Solution 1:
Issue 2:
Solution 2:$txt$,
   $txt$1. Blocked drains/litter … 1m for 2 issues; 1m for matching s[olutions]; 2m.$txt$,
   'W2: Group Tasks; Veg Shop Access; Community & Country', 'medium', 'Community issues and solutions',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("1. Blocked drains/litter …", "1m for matching s…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (28, 'open_ended', 3, 'B',
   $txt$Actions & Effects: Why people act + 1 positive and 1 negative example:
(a) Why people act:
(b) Positive action:
(c) Its effect on others:
(d) Negative action & effect:$txt$,
   $txt$People act to meet needs/… 1m why people act; 1m positive act[ion]; 1m …; 3m.$txt$,
   'W3: Using Charts in Analysis; Actions & Effects', 'medium', 'Actions and effects',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("People act to meet needs/…", "1m positive act…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (29, 'open_ended', 4, 'B',
   $txt$Evaluation: (a) Define evaluation. (b) How do we evaluate schools abroad?
(a) Evaluation is:
How it differs:
(b) Criterion 1:
Criterion 2:
Criterion 3:
Why compare schools?$txt$,
   $txt$(a) Judging quality/succe[ss]… 1.5m definition; 1m difference; 1.[5m criteria]; 4m.$txt$,
   'W4: What is Evaluation? Schools Abroad; Sources', 'hard', 'Evaluation and comparison',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Judging quality/succe…", "1.5m definition; 1m difference; 1.…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (30, 'open_ended', 5, 'B',
   $txt$Sources of Evaluation: Name 3 school evaluation sources & 2 improvements:
Source 1:
Source 2:
Source 3:
(b) Why >=2 sources?
(c) Improvement 1:
Improvement 2:$txt$,
   $txt$(a) Test results, classro[om observations]…; (b) …; (c) … 2m for 3 sources; 1.5m reason for …; 5m.$txt$,
   'W4: What is Evaluation? Schools Abroad; Sources', 'hard', 'Sources of evaluation',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Test results, classro…", "2m for 3 sources; 1.5m reason for …"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason, review_status, extra)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade4-2026-2027'
      and q.config ->> 'subject' = 'social-science'
      and q.config ->> 'question_number' = s.n::text);
