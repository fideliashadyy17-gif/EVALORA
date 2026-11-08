-- Examination of Grade 4 – Science  (Oak International School)
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf"
-- (supplied PDF): SCIENCE paper pages 5-7, marking scheme page 15.
--
-- The same fidelity rules as the Mathematics file apply: printed wording only,
-- printed options in printed order, printed marks, and the marking scheme's own
-- answer for every question. Two source defects are recorded rather than
-- repaired:
--   * Q23 ("Complete the comparison of Solids, Liquids, and Gases") prints six
--     answer lines (shape/vol + example for each of three states) against a
--     printed tariff of 3 marks — one mark per state. The printed lines and the
--     printed marks are both kept as they stand; the mark scheme itself resolves
--     it ("1m per row (Solid, Liquid, Gas)"), so the question is not altered;
--   * the Section B model answers in the marking scheme are cut off at the cell
--     edge for every long answer ("(a) Protection from weath", "X = Solid, Y =
--     Liquid, Z"). The readable part is transcribed verbatim and the question is
--     flagged review_required, because completing those sentences would be
--     inventing the school's own model answers.
--
-- Section B is labelling, classification charts, particle boxes and written
-- explanations, so those items are manual and the teacher marks them against
-- the printed scheme.
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
       array['grade4', 'ce2', 'second-marking-period', '2026-2027', 'science']::text[],
       'published', s.review_status,
       jsonb_build_object('source', 'oak-grade4-2026-2027',
                          'subject', 'science',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null,
                          'review_required', s.review_required,
                          'review_reason', s.review_reason) || s.extra
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 5-6) ───────────────────
  (1, 'single_choice', 1, 'A',
   $txt$Which type of clothing keeps us cool in hot sunny weather?$txt$,
   $txt$B (Light cotton clothes). 1m for B.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'easy', 'Clothes for weather',
   null, null, false, null, 'approved', '{}'::jsonb),
  (2, 'single_choice', 1, 'A',
   $txt$Which of the following is a natural fibre obtained from an animal?$txt$,
   $txt$C (Wool). 1m for C.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'easy', 'Natural fibres',
   null, null, false, null, 'approved', '{}'::jsonb),
  (3, 'single_choice', 1, 'A',
   $txt$Which of these fibres is synthetic (man-made in factories)?$txt$,
   $txt$D (Nylon). 1m for D.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'easy', 'Synthetic fibres',
   null, null, false, null, 'approved', '{}'::jsonb),
  (4, 'single_choice', 1, 'A',
   $txt$Why do we press washed and dried clothes with a warm iron?$txt$,
   $txt$A (To remove wrinkles & kill germs). 1m for A.$txt$,
   'W2: Care of Clothes; Solids, Liquids & Gases', 'easy', 'Care of clothes',
   null, null, false, null, 'approved', '{}'::jsonb),
  (5, 'single_choice', 1, 'A',
   $txt$Which state of matter has a definite shape and a definite volume?$txt$,
   $txt$A (Solid). 1m for A.$txt$,
   'W2: Care of Clothes; Solids, Liquids & Gases', 'easy', 'States of matter',
   null, null, false, null, 'approved', '{}'::jsonb),
  (6, 'single_choice', 1, 'A',
   $txt$In which state of matter are particles far apart and moving freely?$txt$,
   $txt$C (Gas). 1m for C.$txt$,
   'W2: Care of Clothes; Solids, Liquids & Gases', 'easy', 'States of matter',
   null, null, false, null, 'approved', '{}'::jsonb),
  (7, 'single_choice', 1, 'A',
   $txt$The change of liquid water into water vapour upon heating is called:$txt$,
   $txt$B (Evaporation). 1m for B.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Change of state',
   null, null, false, null, 'approved', '{}'::jsonb),
  (8, 'single_choice', 1, 'A',
   $txt$When a spoon of sugar dissolves in water, the sugar is the:$txt$,
   $txt$A (Solute). 1m for A.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Solute and solvent',
   null, null, false, null, 'approved', '{}'::jsonb),
  (9, 'single_choice', 1, 'A',
   $txt$Which method is best for separating insoluble sand from water?$txt$,
   $txt$C (Filtration). 1m for C.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Separation methods',
   null, null, false, null, 'approved', '{}'::jsonb),
  (10, 'single_choice', 1, 'A',
   $txt$Which type of soil is rich in humus and best for growing crops?$txt$,
   $txt$B (Loamy soil). 1m for B.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'easy', 'Types of soil',
   null, null, false, null, 'approved', '{}'::jsonb),
  (11, 'true_false', 1, 'A',
   $txt$True or False: Cotton is a natural plant fibre obtained from cotton bolls.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'easy', 'Natural fibres',
   null, null, false, null, 'approved', '{}'::jsonb),
  (12, 'true_false', 1, 'A',
   $txt$True or False: Liquids have a fixed shape and cannot flow from one vessel to another.$txt$,
   $txt$FALSE (liquids take the shape of their container and flow). 1m for FALSE.$txt$,
   'W2: Care of Clothes; Solids, Liquids & Gases', 'easy', 'States of matter',
   null, null, false, null, 'approved', '{}'::jsonb),
  (13, 'true_false', 1, 'A',
   $txt$True or False: Sand is soluble in water because it dissolves completely.$txt$,
   $txt$FALSE (sand is insoluble). 1m for FALSE.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Solutions',
   null, null, false, null, 'approved', '{}'::jsonb),
  (14, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Change of State): When steam cools into liquid water drops, the process is ______.$txt$,
   $txt$condensation. 1m for condensation.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Change of state',
   null, null, false, null, 'approved', '{}'::jsonb),
  (15, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Solutions): Because water dissolves many substances, it is called the universal ______.$txt$,
   $txt$solvent. 1m for solvent.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Solute and solvent',
   null, null, false, null, 'approved', '{}'::jsonb),
  (16, 'short_answer', 1, 'A',
   $txt$Fill in the blank (Soil Composition): Dark decayed plant and animal matter in soil is called ______.$txt$,
   $txt$humus. 1m for humus.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'easy', 'Soil composition',
   null, null, false, null, 'approved', '{}'::jsonb),
  (17, 'single_choice', 1, 'A',
   $txt$Odd One Out — Circle the fibre that does NOT belong: Cotton | Wool | Silk | Polyester$txt$,
   $txt$Polyester (synthetic; others are natural). 1m for Polyester.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'medium', 'Odd one out',
   null, null, false, null, 'approved', '{}'::jsonb),
  (18, 'ordering', 1, 'A',
   $txt$Order the 4 soil profile layers from TOP to BOTTOM: Bedrock , Topsoil , Subsoil , Parent rock$txt$,
   $txt$Topsoil -> Subsoil -> Parent rock -> Bedrock. 1m for correct order.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'medium', 'Soil profile',
   null, null, false, null, 'approved', '{}'::jsonb),
  (19, 'multiple_select', 1, 'A',
   $txt$Circle the TWO main natural agents of soil erosion: Sunlight | Wind | Running Water | Moonlight$txt$,
   $txt$Wind and Running Water. 1m for Wind & Water.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'medium', 'Soil erosion',
   null, null, false, null, 'approved', '{}'::jsonb),
  (20, 'matching', 1, 'A',
   $txt$Match each separation task to its method (Evaporation / Magnet): (i) Salt from seawater: ____ (ii) Iron from sand: ____$txt$,
   $txt$(i) Evaporation, (ii) Magnet. 0.5m each.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'easy', 'Separation methods',
   null, null, false, null, 'approved',
   jsonb_build_object('pairs', jsonb_build_array(
     jsonb_build_object('left', 'Salt from seawater', 'right', 'Evaporation'),
     jsonb_build_object('left', 'Iron from sand', 'right', 'Magnet')))),

  -- ── Section B: 10 questions, 30 marks (pages 6-7), teacher-marked ──────
  (21, 'open_ended', 2, 'B',
   $txt$State 2 reasons we wear clothes and 2 ways to care for clothes:
Reason 1:
Reason 2:
Care 1:
Care 2:
Storage tip:$txt$,
   $txt$(a) Protection from weath[er]… (the printed cell is cut off at the page edge; the readable text is "Protection from weath" and "1m for 2 reasons; 1m for 2 care me…"). Award 1 mark for 2 reasons and 1 mark for 2 care methods.$txt$,
   'W1/W2: Need for clothes; Care of clothes', 'medium', 'Clothes and their care',
   null, null, true,
   'The marking scheme cell is cut off at the right edge: the model answer reads only "Protection from weath" and the mark guide "1m for 2 reasons; 1m for 2 care me". The full model answer must be read from the printed scheme by the teacher.', 'reviewed', '{}'::jsonb),
  (22, 'open_ended', 3, 'B',
   $txt$DIAGRAM 1: Complete the Textile Fibres classification chart:
TEXTILE FIBRES
1. Natural Fibres
2. Synthetic Fibres
Plant e.g.
Animal e.g.
Examples (2):
Plant fibre:
Animal fibre:
2 Synthetic fibres:$txt$,
   $txt$Plant: Cotton/Linen; Animal: Wool/Silk; Synthetic examples: Nylon, Polyester. 1m plant fibre; 1m animal fibre; 1m two synthetic fibres; 3m.$txt$,
   'W1: Clothes We Wear — Need, Fibres & Fabrics', 'medium', 'Textile fibres',
   '/exam-figures/grade4/science/q22.png',
   'Question 22: a Textile Fibres chart, branching into 1. Natural Fibres (Plant e.g., Animal e.g.) and 2. Synthetic Fibres (Examples (2):).', false, null, 'approved', '{}'::jsonb),
  (23, 'open_ended', 3, 'B',
   $txt$Complete the comparison of Solids, Liquids, and Gases:
Solid shape/vol:
Solid example:
Liquid shape/vol:
Liquid example:
Gas shape/vol:
Gas example:$txt$,
   $txt$Solid: Fixed shape & vol…; Liquid: …; Gas: … (the printed model answers are cut off at the cell edge). 1m per row (Solid, Liquid, Gas), 3m.$txt$,
   'W2: Care of Clothes; Solids, Liquids & Gases', 'medium', 'States of matter',
   null, null, true,
   'The paper prints six answer lines against a printed tariff of 3 marks, and the marking scheme resolves it as "1m per row (Solid, Liquid, Gas)". The printed lines and printed marks are kept unchanged; the model answers are cut off at the cell edge, so the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (24, 'open_ended', 3, 'B',
   $txt$DIAGRAM 2: Study the particle boxes X, Y, Z and arrows 1 & 2:
Box X
Box Y
Box Z
Arrow 1
Arrow 2
States X, Y, Z:
Arrow 1 (X→Y):
Arrow 2 (Y→Z):$txt$,
   $txt$Q24 Key: X=Solid, Y=Liquid, Z=Gas; Arrow 1 = Melting, Arrow 2 = Evaporation. X = Solid, Y = Liquid, Z = … (cell cut off). 1.5m for X, Y, Z; 1.5m for Melting…, 3m.$txt$,
   'W2/W3: Change of states; particle model', 'medium', 'Particle model and change of state',
   '/exam-figures/grade4/science/q24.png',
   'Question 24: three particle boxes X, Y and Z joined by "Arrow 1" and "Arrow 2".', false, null, 'approved', '{}'::jsonb),
  (25, 'open_ended', 2, 'B',
   $txt$Define Solute, Solvent, and Solution using sugar and water:
Solute:
Solvent:
Solution:
Example:$txt$,
   $txt$Solute: solid dissolved (…); Solvent: …; Solution: … 1m definitions; 1m correct example; 2m. (The printed model answers are cut off at the cell edge.)$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'medium', 'Solute, solvent and solution',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("Solute: solid dissolved (…"). The readable text is kept; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (26, 'open_ended', 3, 'B',
   $txt$DIAGRAM 3: Study the Solution & Filtration setups below:
P: Salt (solid)
Q: Water (liquid)
R: Salt water
S: Sand on filter
T: Clear water
(a) Name P & Q:
(b) Trap S is called:
(c) Get salt from R:$txt$,
   $txt$P = Solute (salt), Q = Solvent (water), R = solution, S = residue, T = filtrate; (c) evaporation. 2m for labels/filtration; 1m for e…; 3m.$txt$,
   'W3: Change of States; Solute/Solvent/Solution; Separation', 'medium', 'Solution and filtration',
   '/exam-figures/grade4/science/q26.png',
   'Question 26: two filtration setups, one labelled P: Salt (solid), Q: Water (liquid), R: Salt water and the other S: Sand on filter, T: Clear water.', false, null, 'approved', '{}'::jsonb),
  (27, 'open_ended', 2, 'B',
   $txt$(a) How is soil formed? (b) What is humus and why is it useful?
(a) Formation:
Process name:
(b) Humus is:
Importance:$txt$,
   $txt$(a) Weathering (breaking …); (b) … 1m weathering of rocks; 1m humus d…; 2m.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'medium', 'Soil formation and humus',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Weathering (breaking …", "1m humus d…"). The readable text is kept; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (28, 'open_ended', 3, 'B',
   $txt$Name the 3 main types of soil and state why loamy soil is best:
1. Coarse soil:
2. Sticky soil:
3. Best farm soil:
Why loamy is best:$txt$,
   $txt$Sandy, Clayey, Loamy; Loa… 1.5m for 3 soil types; 1.5m for wh…; 3m.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'medium', 'Types of soil',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("Sandy, Clayey, Loamy; Loa…", "1.5m for wh…"). The readable text is kept; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (29, 'open_ended', 4, 'B',
   $txt$DIAGRAM 4: Label the 4 Soil Profile layers (A–D) and answer (e):
Layer A:
Layer B:
Layer C:
Layer D:
(e) Best root layer:
Reason:$txt$,
   $txt$Q29 Key: A = Topsoil (Rich in Humus), B = Subsoil (Minerals), C = Weathered / Parent Rock, D = Bedrock (Solid Rock). 3m for 4 layers (A-D); 1m for why …; 4m.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'medium', 'Soil profile',
   '/exam-figures/grade4/science/q29.png',
   'Question 29: a four-layer soil profile diagram labelled Layer A to Layer D, with matching "Layer A:" to "Layer D:" answer lines.', false, null, 'approved', '{}'::jsonb),
  (30, 'open_ended', 5, 'B',
   $txt$Soil Erosion & Conservation: Define erosion, 2 agents, 2 causes & 2 care methods:
(a) Definition:
2 Natural agents:
(b) Human cause 1:
Human cause 2:
(c) Conservation 1:
Conservation 2:$txt$,
   $txt$(a) Washing/blowing away … ; 2m definition + agents; 1.5m human c…; 5m.$txt$,
   'W4: Soil — Formation, Types, Profile, Erosion & Care', 'hard', 'Soil erosion and conservation',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Washing/blowing away …", "1.5m human c…"). The readable text is kept; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason, review_status, extra)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade4-2026-2027'
      and q.config ->> 'subject' = 'science'
      and q.config ->> 'question_number' = s.n::text);
