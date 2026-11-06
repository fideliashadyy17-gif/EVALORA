-- Summative Assessment — Grade 10 (Oak International School)
--
-- The Grade 10 paper states its figures in the question text but the seed could
-- not carry the drawings: the PDF holds no raster images, so the two figure
-- questions showed a caption with nothing under it. Both figures are now
-- rendered from the page they are printed on (220 dpi, cropped to the question's
-- own band, caption included) and stored as repository assets under
-- public/exam-figures/grade10/.
--
--   Q6  — matchstick figures: 1, 2 and 3 squares, captioned "figure 1 · 4 sticks",
--         "figure 2 · 7 sticks", "figure 3 · 10 sticks".
--   Q28 — dot arrays: 1x2, 2x3 and 3x4, captioned "figure 1", "figure 2", "figure 3".
--
-- The prompt text is read from the row itself, never re-typed. Idempotent: a
-- question that already carries a figure is skipped.

with fig(n, src) as (
  values
  (6, $txt$/exam-figures/grade10/q06.png$txt$),
  (28, $txt$/exam-figures/grade10/q28.png$txt$)
)
update public.questions q
   set prompt_doc = jsonb_build_object(
         'type', 'doc',
         'content', jsonb_build_array(
           jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
             jsonb_build_object('type', 'text', 'text', q.prompt))),
           jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
             'src', f.src, 'alt', 'Figure for question ' || f.n, 'width', 100))
         )
       ),
       config = q.config || jsonb_build_object('figure', f.src)
  from fig f
 where q.organization_id = '0a400000-0000-4000-8000-000000000001'
   and q.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'
   and (q.config ->> 'question_number')::int = f.n
   and coalesce(q.prompt_doc::text, '') not like '%"image"%';
