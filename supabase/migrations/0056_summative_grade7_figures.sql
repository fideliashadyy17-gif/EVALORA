-- Summative Assessment — Grade 7 (Oak International School)
--
-- Source document: "MYP 2 Mathematics — Ratio, Rate, Proportion & Sets
-- E-Assessment" (36 pages, supplied PDF): fifty multiple-choice questions in six
-- chapters (ratio 9, rate 8, proportion 8, proportional reasoning 8, word
-- problems 8, sets and Venn diagrams 9), 45 minutes, calculator not required.
--
-- Fidelity rules applied:
--   * every prompt, every option and every explanation is the document's own
--     text; nothing is reworded and no distractor is invented;
--   * the printed answer key (page 22) and the detailed solutions (pages 23–36)
--     were parsed separately and cross-checked: 50/50 keys agree and, for all
--     fifty questions, the lettered solution text is the lettered option text;
--   * every item is 1 mark because the document prints "1 mark each"; the mark
--     total (50) is the document's own;
--   * the twenty-three figure questions (bar charts, tables, double number
--     lines, a map, a shop sign and the Venn diagrams) are rendered from their
--     own band of the page at 220 dpi into public/exam-figures/grade7/, because
--     the data lives in the drawing and the text layer does not carry it;
--   * question order and option order stay fixed, so the printed A–D key
--     remains valid (randomize_questions and randomize_options are false).
--
-- Difficulty is a reading of the printed level band: level 1–2 easy, 3–4
-- medium, 5–6 hard. The printed criterion and level are kept in `config`, never
-- replaced by that reading.
--
-- The paper is written in four steps so that no single migration carries the
-- whole assessment: questions 1–25, questions 26–50, the 200 options, then the
-- paper and the examination. The last step refuses to create the examination
-- unless all 50 questions and 200 options are present.

-- This step gives the twenty-three figure questions their drawing. The prompt
-- text is read from the row itself, never re-typed, and the image is the band
-- of the printed page that holds this question's own data at 220 dpi.
-- Idempotent: a question that already carries a figure is skipped.

update public.questions q
   set prompt_doc = case (q.config ->> 'question_number')::int
  when 2 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q02.png',
               'alt', 'Figure for question 2', 'width', 100))))
  when 4 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q04.png',
               'alt', 'Figure for question 4', 'width', 100))))
  when 6 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q06.png',
               'alt', 'Figure for question 6', 'width', 100))))
  when 11 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q11.png',
               'alt', 'Figure for question 11', 'width', 100))))
  when 14 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q14.png',
               'alt', 'Figure for question 14', 'width', 100))))
  when 19 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q19.png',
               'alt', 'Figure for question 19', 'width', 100))))
  when 21 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q21.png',
               'alt', 'Figure for question 21', 'width', 100))))
  when 22 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q22.png',
               'alt', 'Figure for question 22', 'width', 100))))
  when 23 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q23.png',
               'alt', 'Figure for question 23', 'width', 100))))
  when 24 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q24.png',
               'alt', 'Figure for question 24', 'width', 100))))
  when 27 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q27.png',
               'alt', 'Figure for question 27', 'width', 100))))
  when 29 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q29.png',
               'alt', 'Figure for question 29', 'width', 100))))
  when 36 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q36.png',
               'alt', 'Figure for question 36', 'width', 100))))
  when 41 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q41.png',
               'alt', 'Figure for question 41', 'width', 100))))
  when 42 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q42.png',
               'alt', 'Figure for question 42', 'width', 100))))
  when 43 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q43.png',
               'alt', 'Figure for question 43', 'width', 100))))
  when 44 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q44.png',
               'alt', 'Figure for question 44', 'width', 100))))
  when 45 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q45.png',
               'alt', 'Figure for question 45', 'width', 100))))
  when 46 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q46.png',
               'alt', 'Figure for question 46', 'width', 100))))
  when 47 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q47.png',
               'alt', 'Figure for question 47', 'width', 100))))
  when 48 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q48.png',
               'alt', 'Figure for question 48', 'width', 100))))
  when 49 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q49.png',
               'alt', 'Figure for question 49', 'width', 100))))
  when 50 then jsonb_build_object(
           'type', 'doc',
           'content', jsonb_build_array(
             jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
               jsonb_build_object('type', 'text', 'text', q.prompt))),
             jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
               'src', '/exam-figures/grade7/q50.png',
               'alt', 'Figure for question 50', 'width', 100))))
     end
 where q.organization_id = '0a400000-0000-4000-8000-000000000001'
   and q.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment'
   and (q.config ->> 'question_number')::int in (2, 4, 6, 11, 14, 19, 21, 22, 23, 24, 27, 29, 36, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50)
   and coalesce(q.prompt_doc::text, '') not like '%"image"%';
