-- First Term 2026/27 · MYP 4 paper: print the matching bank as plain text.
--
-- Q15–Q18 ask the candidate to match a definition to a term in a six-cell bank
-- (P–U). The bank was emitted into a data-table diagram, whose cells render as
-- plain text: the LaTeX fraction for frequency density therefore appeared
-- literally, backslashes and dollar signs included. The
-- candidate-facing answer buttons carried the same notation.
--
-- The terms are now ordinary readable text, with the mathematical meaning
-- unchanged and every answer key (Q15 T, Q16 P, Q17 Q, Q18 R) and mark value
-- untouched. The source paper module uses the same wording. This migration is
-- forward-only and idempotent; the applied 20261117* uploads are not rewritten.

begin;

-- The table lives at content[1] of each prompt document, after the stem.
update questions q
   set prompt_doc = jsonb_set(
         q.prompt_doc,
         '{content,1,attrs,spec,rows,0}',
         '["Frequency density = Frequency ÷ Class width","Standard deviation σ = √(Σ(x − μ)² ÷ N)","Cumulative frequency curve","Mean = Σfx ÷ Σf","Stem-and-leaf diagram","Interquartile range = Q₃ − Q₁"]'::jsonb,
         false
       )
 where q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026'
   and q.prompt_doc #> '{content,1,attrs,spec,kind}' = '"table"'::jsonb;

-- The same six strings are the answer buttons. Keep them in step with the
-- printed bank so no screen shows the LaTeX form.
update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Frequency density = Frequency ÷ Class width"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'P'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Standard deviation σ = √(Σ(x − μ)² ÷ N)"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'Q'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Cumulative frequency curve"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'R'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Mean = Σfx ÷ Σf"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'S'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Stem-and-leaf diagram"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'T'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update question_options o
   set content_doc = '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Interquartile range = Q₃ − Q₁"}]}]}'::jsonb
  from questions q
 where o.question_id = q.id
   and o.label = 'U'
   and q.id in (
       'cb000000-0000-4000-8000-000000001015',
       'cb000000-0000-4000-8000-000000001016',
       'cb000000-0000-4000-8000-000000001017',
       'cb000000-0000-4000-8000-000000001018'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

-- Worked solutions shown after the paper is released.
update questions q
   set explanation = 'Frequency density = Frequency ÷ Class width.'
 where q.id in (
       'cb000000-0000-4000-8000-000000001016'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

update questions q
   set explanation = 'Population standard deviation σ = √(Σ(x − μ)² ÷ N).'
 where q.id in (
       'cb000000-0000-4000-8000-000000001017'
       )
   and q.config->>'source' = 'myp4-term1-summative-first-term-2026';

commit;
