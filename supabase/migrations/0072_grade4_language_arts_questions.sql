-- Examination of Grade 4 – Language Arts  (Oak International School)
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf"
-- (supplied PDF): LANGUAGE ART paper pages 8-10, marking scheme page 16.
--
-- The same fidelity rules as the other two papers apply. Points specific to this
-- paper:
--   * the two original reading passages are printed inside cards on page 8 and
--     every Section A question of the first eight refers to them. Both passages
--     are carried as figures (passage-1.png, passage-2.png) on the questions that
--     read from them, exactly as printed — the words are not retyped, so no word
--     of either passage can drift;
--   * the paper's own heading is "LANGUAGE ART" while the examination is titled
--     "Language Arts"; the printed heading is kept in `printed_subject_heading`
--     on the examination and every prompt keeps its printed wording;
--   * the marking scheme prints, for Q10, the model answer "D (were watered ->
--     were w" — the cell is cut off and the phrase does not match the question's
--     own verb choices ("A water / B waters / C was watering / D were
--     watering"). The printed key letter D is recorded and the question is
--     flagged: the source's own text is contradictory, and resolving it by
--     rewriting the answer would be inventing content;
--   * Q18's stem asks for the correct past continuous form of watch ("was
--     watching / were watching") while the scheme prints "was reading"; the
--     printed scheme is recorded and the question is flagged for the teacher;
--   * Q23 prints six answer slots (countable 2, uncountable 2, two is/are
--     sentences) against 2 marks; printed as it stands and flagged.
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
       array['grade4', 'ce2', 'second-marking-period', '2026-2027', 'language-arts']::text[],
       'published', s.review_status,
       jsonb_build_object('source', 'oak-grade4-2026-2027',
                          'subject', 'language-arts',
                          'question_number', s.n,
                          'section', s.section,
                          'printed_marks', s.points,
                          'marking_scheme', s.scheme,
                          'week_topic', s.week_topic,
                          'has_pictures', s.figure is not null,
                          'review_required', s.review_required,
                          'review_reason', s.review_reason) || s.extra
  from (values
  -- ── Section A: 20 questions, 1 mark each (pages 8-9) ───────────────────
  (1, 'single_choice', 1, 'A',
   $txt$In Passage 1, why did the children shift closer on the bench?$txt$,
   $txt$B (To make room for Mrs Bello). 1m for B.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'Comprehension: Passage 1',
   '/exam-figures/grade4/language-arts/passage-1.png',
   'Diagram 1: Sharing the Bench — the illustration printed above Passages 1 and 2.', false, null, 'approved', '{}'::jsonb),
  (2, 'single_choice', 1, 'A',
   $txt$What did Mrs Bello share with the children in Passage 1?$txt$,
   $txt$C (Sweet oranges from her basket). 1m for C.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'Comprehension: Passage 1',
   '/exam-figures/grade4/language-arts/passage-1.png',
   'Diagram 1: Sharing the Bench — the illustration printed above Passages 1 and 2.', false, null, 'approved', '{}'::jsonb),
  (3, 'single_choice', 1, 'A',
   $txt$Which of the following words is an UNCOUNTABLE noun?$txt$,
   $txt$D (Water). 1m for D.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'Countable and uncountable nouns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (4, 'single_choice', 1, 'A',
   $txt$Choose the correct verb: "The fresh milk in the jug ___ cold."$txt$,
   $txt$A (is). 1m for A.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'is or are',
   null, null, false, null, 'approved', '{}'::jsonb),
  (5, 'single_choice', 1, 'A',
   $txt$Which word is the closest SYNONYM for "crowded"?$txt$,
   $txt$B (Packed). 1m for B.$txt$,
   'W2: Synonyms, Word Association & Summary Writing', 'easy', 'Synonyms',
   null, null, false, null, 'approved', '{}'::jsonb),
  (6, 'single_choice', 1, 'A',
   $txt$What is a summary of a story?$txt$,
   $txt$A (A short version of the main ideas). 1m for A.$txt$,
   'W2: Synonyms, Word Association & Summary Writing', 'easy', 'Summary writing',
   null, null, false, null, 'approved', '{}'::jsonb),
  (7, 'single_choice', 1, 'A',
   $txt$In Passage 2, what happens when Zara touches the Mimosa leaf?$txt$,
   $txt$C (Its tiny leaflets fold inward). 1m for C.$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'easy', 'Comprehension: Passage 2',
   '/exam-figures/grade4/language-arts/passage-2.png',
   'Diagram 2: Mimosa Leaflets — the illustration printed beside Passage 2, "Open (Day)" and "Folded (Touched)".', false, null, 'approved', '{}'::jsonb),
  (8, 'single_choice', 1, 'A',
   $txt$Which word is the ANTONYM (opposite) of "open"?$txt$,
   $txt$B (Shrink / fold). 1m for B.$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'easy', 'Antonyms',
   null, null, false, null, 'approved', '{}'::jsonb),
  (9, 'single_choice', 1, 'A',
   $txt$Identify the ADVERB in: "The leaflets folded quietly at dusk."$txt$,
   $txt$C (quietly). 1m for C.$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'easy', 'Adverbs',
   null, null, false, null, 'approved', '{}'::jsonb),
  (10, 'single_choice', 1, 'A',
   $txt$Past Continuous: "While the pupils ___ the garden, the bell rang."$txt$,
   $txt$D (were watered -> were w[atering]…). The printed cell is cut off; key letter D. 1m for D.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'medium', 'Past continuous',
   null, null, true,
   'The printed marking scheme gives "D (were watered -> were w" — cut off at the cell edge, and the surviving words do not match this card''s own options ("A water / B waters / C was watering / D were watering"). The printed key letter D is recorded and the wording is flagged; the answer cannot be rewritten without inventing it.', 'reviewed', '{}'::jsonb),
  (11, 'true_false', 1, 'A',
   $txt$True or False (Uncountable Nouns): "Furniture" and "information" are uncountable nouns.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'Countable and uncountable nouns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (12, 'true_false', 1, 'A',
   $txt$True or False (Summary Writing): A good summary copies every sentence word-for-word.$txt$,
   $txt$FALSE (uses own words, ma[in ideas]). 1m for FALSE.$txt$,
   'W2: Synonyms, Word Association & Summary Writing', 'easy', 'Summary writing',
   null, null, false, null, 'approved', '{}'::jsonb),
  (13, 'true_false', 1, 'A',
   $txt$True or False (The Five Senses): The skin is the sense organ used for touch and feeling.$txt$,
   $txt$TRUE. 1m for TRUE.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'easy', 'The five senses',
   null, null, false, null, 'approved', '{}'::jsonb),
  (14, 'short_answer', 1, 'A',
   $txt$Fill in the blank with "is" or "are": The wooden benches in Oak Park ______ clean.$txt$,
   $txt$are. 1m for are.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'easy', 'is or are',
   null, null, false, null, 'approved', '{}'::jsonb),
  (15, 'short_answer', 1, 'A',
   $txt$Word Association — Complete the pair: Book is to Library as Bread is to ____________.$txt$,
   $txt$Bakery. 1m for Bakery.$txt$,
   'W2: Synonyms, Word Association & Summary Writing', 'easy', 'Word association',
   null, null, false, null, 'approved', '{}'::jsonb),
  (16, 'short_answer', 1, 'A',
   $txt$Personal Pronouns — Choose (us / we): Mrs Bello gave oranges to Tunde and me → to ______.$txt$,
   $txt$us (object pronoun). 1m for us.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'easy', 'Personal pronouns',
   null, null, false, null, 'approved', '{}'::jsonb),
  (17, 'single_choice', 1, 'A',
   $txt$Odd One Out — Circle the word that is NOT an adverb: gently | quickly | brightly | garden$txt$,
   $txt$garden (noun; others are adverbs). 1m for garden.$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'medium', 'Odd one out',
   null, null, false, null, 'approved', '{}'::jsonb),
  (18, 'single_choice', 1, 'A',
   $txt$Circle the correct Past Continuous verb form: Zara ( was watching / were watching ) the plant.$txt$,
   $txt$was reading. 1m for was reading.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'medium', 'Past continuous',
   null, null, true,
   'The printed marking scheme answers "was reading", which is the verb of a different sentence: this card asks the pupil to choose between "was watching" and "were watching". The printed scheme is recorded unchanged and flagged; the teacher must confirm the intended answer from the printed paper.', 'reviewed', '{}'::jsonb),
  (19, 'matching', 1, 'A',
   $txt$Match the sense organ to its sense (Smell / Taste): (i) Nose: ____________ (ii) Tongue: ____________$txt$,
   $txt$(i) Smell, (ii) Taste. 0.5m each.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'easy', 'The five senses',
   null, null, false, null, 'approved',
   jsonb_build_object('pairs', jsonb_build_array(
     jsonb_build_object('left', 'Nose', 'right', 'Smell'),
     jsonb_build_object('left', 'Tongue', 'right', 'Taste')))),
  (20, 'short_answer', 1, 'A',
   $txt$Neighbourhood Map Compass: N = North, E = East, S = South, and W = ______.$txt$,
   $txt$West. 1m for West.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'easy', 'The compass',
   '/exam-figures/grade4/language-arts/q30.png',
   'Diagram 4: My Neighbourhood Map — Oak Street, Oak School, Park & Bench, Library, Health Clinic and the N/E/S/W compass.', false, null, 'approved', '{}'::jsonb),

  -- ── Section B: 10 questions, 30 marks (pages 9-10), teacher-marked ─────
  (21, 'open_ended', 3, 'B',
   $txt$Passage 1 ("When a Park Bench Is Crowded") — Full sentences:
(a) Where was the bench?
Ans (a):
(b) What did the 3 friends do?
Ans (b):
(c) What lesson does it teach?
Ans (c):$txt$,
   $txt$(a) Under the shady mango… 1m per full-sentence answer; 3m. (The printed model answers are cut off at the cell edge.)$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'medium', 'Comprehension: Passage 1',
   '/exam-figures/grade4/language-arts/passage-1.png',
   'Diagram 1: Sharing the Bench — the illustration printed above Passages 1 and 2.', true,
   'The marking scheme model answers for this question are cut off at the cell edge ("(a) Under the shady mango…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (22, 'open_ended', 3, 'B',
   $txt$Passage 2 ("The Sleeping Plant") — Answer in full sentences:
(a) Where does Mimosa grow?
Ans (a):
(b) Why do its leaves fold?
Ans (b):
(c) When do they open again?
Ans (c):$txt$,
   $txt$(a) In the school botanic… 1m per full-sentence answer; 3m. (The printed model answers are cut off at the cell edge.)$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'medium', 'Comprehension: Passage 2',
   '/exam-figures/grade4/language-arts/passage-2.png',
   'Diagram 2: Mimosa Leaflets — the illustration printed beside Passage 2, "Open (Day)" and "Folded (Touched)".', true,
   'The marking scheme model answers for this question are cut off at the cell edge ("(a) In the school botanic…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (23, 'open_ended', 2, 'B',
   $txt$Sort (bench, water, coin, milk) and fill in "is" or "are":
Countable (2):
Uncountable (2):
(i) The sand ___ hot:
(ii) The trees ___ tall:$txt$,
   $txt$Countable: bench, coin; Uncountable: water, milk; (i) is (ii) are. 1m sorting; 0.5m each is/are; 2m.$txt$,
   'W1: Park Bench Passage; Countable/Uncountable; is/are', 'medium', 'Countable and uncountable nouns',
   null, null, true,
   'The card prints six answer slots (two countable, two uncountable, two is/are sentences) against a printed tariff of 2 marks, and its two is/are sentences do not use the four sorting words. Both the slots and the marks are kept as printed; the scheme resolves them as "1m sorting; 0.5m each is/are".', 'reviewed', '{}'::jsonb),
  (24, 'open_ended', 3, 'B',
   $txt$Vocabulary — Synonyms, Antonyms & Word Association:
(a) Synonym of "cheerful":
(b) Antonym of "ancient":
(c) Antonym of "gentle":
(d) Stethoscope is associated with:$txt$,
   $txt$(a) happy / joyful; (b) m[odern]; (c) …; (d) … 1m each correct item; 3m. (The printed model answers are cut off at the cell edge.)$txt$,
   'W2/W3: Synonyms, antonyms and word association', 'medium', 'Synonyms and antonyms',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge ("(a) happy / joyful; (b) m…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (25, 'open_ended', 2, 'B',
   $txt$Adverbs: Identify the adverb in 1–2 and form adverbs in 3–4:
1. "Kofi smiled politely." →
2. "They played outside." →
3. gentle + ly =
4. happy + ly =$txt$,
   $txt$(a) neatly, outside; (b) … 1m identifying adverbs; 1m forming…; 2m.$txt$,
   'W3: The Sleeping Plant; Antonyms; Adverbs', 'medium', 'Adverbs',
   null, null, true,
   'The marking scheme model answers are cut off at the cell edge and the readable part ("(a) neatly, outside") does not match this card''s own words ("politely", "outside" is shared). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (26, 'open_ended', 3, 'B',
   $txt$Personal Pronouns: Replace the nouns with (She, him, They, us):
(a) Maya helped Kofi:
(b) The boys called Tolu & me:
(c) Subject pronoun in (a):
(d) Object pronoun in (a):$txt$,
   $txt$(a) She gave him a pen; (…) 1m per part; 3m. (The printed model answers are cut off at the cell edge.)$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'medium', 'Personal pronouns',
   null, null, true,
   'The marking scheme model answer is cut off at the cell edge ("(a) She gave him a pen; (…") and its wording ("a pen") is not the sentence this card prints ("Maya helped Kofi"). The readable text is kept and the question is flagged.', 'reviewed', '{}'::jsonb),
  (27, 'open_ended', 2, 'B',
   $txt$Rewrite each verb in the Past Continuous Tense (was/were + -ing):
(a) I (draw) a map:
Answer (a):
(b) The girls (read) quietly:
Answer (b):$txt$,
   $txt$(a) was sketching; (b) we[re reading]. 1m for was sketching; 1m for were …; 2m.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'medium', 'Past continuous',
   null, null, true,
   'The marking scheme prints "was sketching" for a card that gives the verb "draw", and the cell is cut off. The printed scheme is recorded unchanged and flagged; the teacher must confirm the intended answer.', 'reviewed', '{}'::jsonb),
  (28, 'open_ended', 3, 'B',
   $txt$Summary Writing: Write a 3-sentence summary of Passage 1 in your own words:
1.
2.
3.$txt$,
   $txt$Three children sat on a f… 1m beginning/problem; 1m action; 1m…; 3m.$txt$,
   'W2: Synonyms, Word Association & Summary Writing', 'hard', 'Summary writing',
   '/exam-figures/grade4/language-arts/passage-1.png',
   'Diagram 1: Sharing the Bench — the illustration printed above Passages 1 and 2.', true,
   'The marking scheme model answer is cut off at the cell edge ("Three children sat on a f…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb),
  (29, 'open_ended', 4, 'B',
   $txt$DIAGRAM 3 (The Five Senses): Name the 5 sense organs & write 1 sentence:
1. Sight
Organ: ___
2. Hearing
Organ: ___
3. Smell
Organ: ___
4. Taste
Organ: ___
5. Touch
Organ: ___
1. Sight & 2. Hearing:
3. Smell & 4. Taste:
5. Touch organ:
Sensory sentence:$txt$,
   $txt$1 = Eyes, 2 = Ears, 3 = Nose, 4 = Tongue, 5 = Skin. 2.5m for 5 organs; 1.5m for descri[ptions]; 4m.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'medium', 'The five senses',
   '/exam-figures/grade4/language-arts/q29.png',
   'Question 29: five numbered sense cards (1. Sight, 2. Hearing, 3. Smell, 4. Taste, 5. Touch), each with its symbol and an "Organ: ___" line.', false, null, 'approved', '{}'::jsonb),
  (30, 'open_ended', 5, 'B',
   $txt$DIAGRAM 4 (Project — My Neighbourhood Map): Study the map and answer (a)–(d):
OAK STREET
OAK STREET
OAK SCHOOL
PARK & BENCH
LIBRARY
HEALTH CLINIC
N
E
S
W
(a) East-West street:
(b) Park is ___ of School:
(c) South-West building:
(d) Walk School→Clinic:$txt$,
   $txt$(a) Oak Street; (b) North[?]; (c) …; (d) … 3m for (a)-(c); 2m for clear direc[tions]; 5m.$txt$,
   'W4: Personal Pronouns; Past Continuous; 5 Senses; Map', 'hard', 'Reading a map',
   '/exam-figures/grade4/language-arts/q30.png',
   'Diagram 4: My Neighbourhood Map — Oak Street, Oak School, Park & Bench, Library, Health Clinic and the N/E/S/W compass.', true,
   'The marking scheme model answers are cut off at the cell edge ("(a) Oak Street; (b) North…"). The readable text is kept and the question is flagged; the teacher marks from the printed scheme.', 'reviewed', '{}'::jsonb)
  ) as s(n, qtype, points, section, prompt, scheme, week_topic, difficulty, topic, figure, alt, review_required, review_reason, review_status, extra)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'oak-grade4-2026-2027'
      and q.config ->> 'subject' = 'language-arts'
      and q.config ->> 'question_number' = s.n::text);
