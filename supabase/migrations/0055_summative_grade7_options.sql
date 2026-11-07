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

-- This step writes the four options of every question, in printed order, with
-- exactly one keyed correct option each. Each option carries the structured
-- content document as well as the plain label, because the student runner
-- renders an option from `content_doc` and falls back to the label — a lesson
-- learned on the Grade 10 paper, where the seed wrote only the label and the
-- options appeared as bare letters. Idempotent: a question that already has
-- options is skipped.

with opts(n, label, position, is_correct, body) as (
  values
  (1, $txt$A$txt$, 1, true, $txt$2 : 3$txt$),
  (1, $txt$B$txt$, 2, false, $txt$6 : 9$txt$),
  (1, $txt$C$txt$, 3, false, $txt$2 : 5$txt$),
  (1, $txt$D$txt$, 4, false, $txt$3 : 2$txt$),
  (2, $txt$A$txt$, 1, false, $txt$3 : 5$txt$),
  (2, $txt$B$txt$, 2, true, $txt$2 : 5$txt$),
  (2, $txt$C$txt$, 3, false, $txt$2 : 3$txt$),
  (2, $txt$D$txt$, 4, false, $txt$4 : 10$txt$),
  (3, $txt$A$txt$, 1, false, $txt$8 blue units and 3 white units$txt$),
  (3, $txt$B$txt$, 2, false, $txt$12 blue units and 8 white units$txt$),
  (3, $txt$C$txt$, 3, false, $txt$6 blue units and 7 white units$txt$),
  (3, $txt$D$txt$, 4, true, $txt$8 blue units and 12 white units$txt$),
  (4, $txt$A$txt$, 1, true, $txt$20$txt$),
  (4, $txt$B$txt$, 2, false, $txt$10$txt$),
  (4, $txt$C$txt$, 3, false, $txt$14$txt$),
  (4, $txt$D$txt$, 4, false, $txt$12$txt$),
  (5, $txt$A$txt$, 1, true, $txt$30 cones$txt$),
  (5, $txt$B$txt$, 2, false, $txt$18 cones$txt$),
  (5, $txt$C$txt$, 3, false, $txt$6 cones$txt$),
  (5, $txt$D$txt$, 4, false, $txt$24 cones$txt$),
  (6, $txt$A$txt$, 1, false, $txt$8 seedlings$txt$),
  (6, $txt$B$txt$, 2, false, $txt$24 seedlings$txt$),
  (6, $txt$C$txt$, 3, false, $txt$48 seedlings$txt$),
  (6, $txt$D$txt$, 4, true, $txt$32 seedlings$txt$),
  (7, $txt$A$txt$, 1, false, $txt$2/3 of the batch; 100 mL$txt$),
  (7, $txt$B$txt$, 2, true, $txt$2/5 of the batch; 60 mL$txt$),
  (7, $txt$C$txt$, 3, false, $txt$3/5 of the batch; 90 mL$txt$),
  (7, $txt$D$txt$, 4, false, $txt$2/5 of the batch; 50 mL$txt$),
  (8, $txt$A$txt$, 1, false, $txt$You cannot compare because the team totals differ.$txt$),
  (8, $txt$B$txt$, 2, false, $txt$Both teams; each has more girls than boys.$txt$),
  (8, $txt$C$txt$, 3, true, $txt$Team Q; 4 : 5 is greater than 2 : 3.$txt$),
  (8, $txt$D$txt$, 4, false, $txt$Team P; it has fewer students in all.$txt$),
  (9, $txt$A$txt$, 1, false, $txt$49 baskets$txt$),
  (9, $txt$B$txt$, 2, false, $txt$28 baskets$txt$),
  (9, $txt$C$txt$, 3, false, $txt$336 baskets$txt$),
  (9, $txt$D$txt$, 4, true, $txt$84 baskets$txt$),
  (10, $txt$A$txt$, 1, false, $txt$45 km$txt$),
  (10, $txt$B$txt$, 2, false, $txt$180 km/h$txt$),
  (10, $txt$C$txt$, 3, true, $txt$45 km/h$txt$),
  (10, $txt$D$txt$, 4, false, $txt$92 km/h$txt$),
  (11, $txt$A$txt$, 1, false, $txt$1,600 FCFA per kg$txt$),
  (11, $txt$B$txt$, 2, false, $txt$2,000 FCFA per kg$txt$),
  (11, $txt$C$txt$, 3, false, $txt$800 FCFA per kg$txt$),
  (11, $txt$D$txt$, 4, true, $txt$400 FCFA per kg$txt$),
  (12, $txt$A$txt$, 1, false, $txt$30 min$txt$),
  (12, $txt$B$txt$, 2, false, $txt$10 min$txt$),
  (12, $txt$C$txt$, 3, true, $txt$5 min$txt$),
  (12, $txt$D$txt$, 4, false, $txt$6 min$txt$),
  (13, $txt$A$txt$, 1, true, $txt$30 km/h$txt$),
  (13, $txt$B$txt$, 2, false, $txt$45 km/h$txt$),
  (13, $txt$C$txt$, 3, false, $txt$0.5 km/h$txt$),
  (13, $txt$D$txt$, 4, false, $txt$15 km/h$txt$),
  (14, $txt$A$txt$, 1, false, $txt$168 L$txt$),
  (14, $txt$B$txt$, 2, true, $txt$42 L$txt$),
  (14, $txt$C$txt$, 3, false, $txt$34 L$txt$),
  (14, $txt$D$txt$, 4, false, $txt$7 L$txt$),
  (15, $txt$A$txt$, 1, false, $txt$2 kg bag; 500 FCFA cheaper in total$txt$),
  (15, $txt$B$txt$, 2, true, $txt$3 kg bag; 50 FCFA per kg less$txt$),
  (15, $txt$C$txt$, 3, false, $txt$3 kg bag; 500 FCFA per kg less$txt$),
  (15, $txt$D$txt$, 4, false, $txt$Both bags; 600 FCFA per kg$txt$),
  (16, $txt$A$txt$, 1, false, $txt$300 km/h$txt$),
  (16, $txt$B$txt$, 2, false, $txt$0.3 km/h$txt$),
  (16, $txt$C$txt$, 3, true, $txt$18 km/h$txt$),
  (16, $txt$D$txt$, 4, false, $txt$9 km/h$txt$),
  (17, $txt$A$txt$, 1, false, $txt$Bus faster; it travels a greater distance.$txt$),
  (17, $txt$B$txt$, 2, true, $txt$Same speed; 36 km/h each.$txt$),
  (17, $txt$C$txt$, 3, false, $txt$Same speed; 0.6 km/h each.$txt$),
  (17, $txt$D$txt$, 4, false, $txt$Zémidjan faster; it takes less time.$txt$),
  (18, $txt$A$txt$, 1, false, $txt$400 FCFA$txt$),
  (18, $txt$B$txt$, 2, false, $txt$203 FCFA$txt$),
  (18, $txt$C$txt$, 3, false, $txt$200 FCFA$txt$),
  (18, $txt$D$txt$, 4, true, $txt$600 FCFA$txt$),
  (19, $txt$A$txt$, 1, true, $txt$20 kg$txt$),
  (19, $txt$B$txt$, 2, false, $txt$15 kg$txt$),
  (19, $txt$C$txt$, 3, false, $txt$4 kg$txt$),
  (19, $txt$D$txt$, 4, false, $txt$40 kg$txt$),
  (20, $txt$A$txt$, 1, false, $txt$40 m$txt$),
  (20, $txt$B$txt$, 2, false, $txt$0.04 m$txt$),
  (20, $txt$C$txt$, 3, true, $txt$4 m$txt$),
  (20, $txt$D$txt$, 4, false, $txt$400 m$txt$),
  (21, $txt$A$txt$, 1, true, $txt$7 L$txt$),
  (21, $txt$B$txt$, 2, false, $txt$4 L$txt$),
  (21, $txt$C$txt$, 3, false, $txt$70 L$txt$),
  (21, $txt$D$txt$, 4, false, $txt$10 L$txt$),
  (22, $txt$A$txt$, 1, false, $txt$20 km$txt$),
  (22, $txt$B$txt$, 2, false, $txt$200 km$txt$),
  (22, $txt$C$txt$, 3, true, $txt$2 km$txt$),
  (22, $txt$D$txt$, 4, false, $txt$0.2 km$txt$),
  (23, $txt$A$txt$, 1, true, $txt$No; 6 notebooks should cost 2,100 FCFA at the earlier rate.$txt$),
  (23, $txt$B$txt$, 2, false, $txt$Yes; the first two rows agree.$txt$),
  (23, $txt$C$txt$, 3, false, $txt$No; a proportional table must repeat the same total price.$txt$),
  (23, $txt$D$txt$, 4, false, $txt$Yes; the cost rises when the number of notebooks rises.$txt$),
  (24, $txt$A$txt$, 1, false, $txt$96 m²$txt$),
  (24, $txt$B$txt$, 2, true, $txt$40 m$txt$),
  (24, $txt$C$txt$, 3, false, $txt$20 m$txt$),
  (24, $txt$D$txt$, 4, false, $txt$4,000 m$txt$),
  (25, $txt$A$txt$, 1, false, $txt$50 bags$txt$),
  (25, $txt$B$txt$, 2, true, $txt$8 bags$txt$),
  (25, $txt$C$txt$, 3, false, $txt$6 bags$txt$),
  (25, $txt$D$txt$, 4, false, $txt$10 bags$txt$),
  (26, $txt$A$txt$, 1, false, $txt$10 eggs$txt$),
  (26, $txt$B$txt$, 2, false, $txt$2 eggs$txt$),
  (26, $txt$C$txt$, 3, true, $txt$4 eggs$txt$),
  (26, $txt$D$txt$, 4, false, $txt$8 eggs$txt$),
  (27, $txt$A$txt$, 1, false, $txt$1,200 g$txt$),
  (27, $txt$B$txt$, 2, false, $txt$600 g$txt$),
  (27, $txt$C$txt$, 3, false, $txt$450 g$txt$),
  (27, $txt$D$txt$, 4, true, $txt$900 g$txt$),
  (28, $txt$A$txt$, 1, false, $txt$The 4 GB pack is better; it costs 250 FCFA per GB.$txt$),
  (28, $txt$B$txt$, 2, false, $txt$The 6 GB pack is better; it contains more data.$txt$),
  (28, $txt$C$txt$, 3, false, $txt$The 4 GB pack is better; its total price is lower.$txt$),
  (28, $txt$D$txt$, 4, true, $txt$Same value; each costs 500 FCFA per GB.$txt$),
  (29, $txt$A$txt$, 1, false, $txt$9 trees$txt$),
  (29, $txt$B$txt$, 2, false, $txt$27 trees$txt$),
  (29, $txt$C$txt$, 3, true, $txt$15 trees$txt$),
  (29, $txt$D$txt$, 4, false, $txt$11 trees$txt$),
  (30, $txt$A$txt$, 1, false, $txt$16 students$txt$),
  (30, $txt$B$txt$, 2, true, $txt$8 students$txt$),
  (30, $txt$C$txt$, 3, false, $txt$24 students$txt$),
  (30, $txt$D$txt$, 4, false, $txt$25 students$txt$),
  (31, $txt$A$txt$, 1, true, $txt$2,200 FCFA$txt$),
  (31, $txt$B$txt$, 2, false, $txt$1,800 FCFA$txt$),
  (31, $txt$C$txt$, 3, false, $txt$200 FCFA$txt$),
  (31, $txt$D$txt$, 4, false, $txt$2,010 FCFA$txt$),
  (32, $txt$A$txt$, 1, true, $txt$No; 2 kg costs 900 FCFA, not twice the 700 FCFA cost of 1 kg.$txt$),
  (32, $txt$B$txt$, 2, false, $txt$No; proportional costs must be identical for all masses.$txt$),
  (32, $txt$C$txt$, 3, false, $txt$Yes; the same delivery fee is charged each time.$txt$),
  (32, $txt$D$txt$, 4, false, $txt$Yes; the total cost goes up when the mass goes up.$txt$),
  (33, $txt$A$txt$, 1, false, $txt$8.5 cups rice and 5.5 cups beans$txt$),
  (33, $txt$B$txt$, 2, false, $txt$9 cups rice and 6 cups beans$txt$),
  (33, $txt$C$txt$, 3, true, $txt$6 cups rice and 4 cups beans$txt$),
  (33, $txt$D$txt$, 4, false, $txt$4.5 cups rice and 3 cups beans$txt$),
  (34, $txt$A$txt$, 1, false, $txt$500 FCFA$txt$),
  (34, $txt$B$txt$, 2, false, $txt$2,500 FCFA$txt$),
  (34, $txt$C$txt$, 3, false, $txt$10,000 FCFA$txt$),
  (34, $txt$D$txt$, 4, true, $txt$2,000 FCFA$txt$),
  (35, $txt$A$txt$, 1, false, $txt$15 km$txt$),
  (35, $txt$B$txt$, 2, false, $txt$30 km$txt$),
  (35, $txt$C$txt$, 3, true, $txt$27 km$txt$),
  (35, $txt$D$txt$, 4, false, $txt$24 km$txt$),
  (36, $txt$A$txt$, 1, false, $txt$1,200 FCFA$txt$),
  (36, $txt$B$txt$, 2, true, $txt$800 FCFA$txt$),
  (36, $txt$C$txt$, 3, false, $txt$1,600 FCFA$txt$),
  (36, $txt$D$txt$, 4, false, $txt$400 FCFA$txt$),
  (37, $txt$A$txt$, 1, false, $txt$1,000 mL$txt$),
  (37, $txt$B$txt$, 2, true, $txt$200 mL$txt$),
  (37, $txt$C$txt$, 3, false, $txt$250 mL$txt$),
  (37, $txt$D$txt$, 4, false, $txt$800 mL$txt$),
  (38, $txt$A$txt$, 1, false, $txt$600 FCFA$txt$),
  (38, $txt$B$txt$, 2, false, $txt$1,800 FCFA$txt$),
  (38, $txt$C$txt$, 3, true, $txt$2,400 FCFA$txt$),
  (38, $txt$D$txt$, 4, false, $txt$3,000 FCFA$txt$),
  (39, $txt$A$txt$, 1, true, $txt$10:15$txt$),
  (39, $txt$B$txt$, 2, false, $txt$09:15$txt$),
  (39, $txt$C$txt$, 3, false, $txt$10:00$txt$),
  (39, $txt$D$txt$, 4, false, $txt$10:30$txt$),
  (40, $txt$A$txt$, 1, false, $txt$4 packs$txt$),
  (40, $txt$B$txt$, 2, false, $txt$6 packs$txt$),
  (40, $txt$C$txt$, 3, false, $txt$14 packs$txt$),
  (40, $txt$D$txt$, 4, true, $txt$8 packs$txt$),
  (41, $txt$A$txt$, 1, true, $txt$2,700 FCFA$txt$),
  (41, $txt$B$txt$, 2, false, $txt$1,800 FCFA$txt$),
  (41, $txt$C$txt$, 3, false, $txt$6,300 FCFA$txt$),
  (41, $txt$D$txt$, 4, false, $txt$2,400 FCFA$txt$),
  (42, $txt$A$txt$, 1, false, $txt$3 ∈ B$txt$),
  (42, $txt$B$txt$, 2, false, $txt$6 ∉ A$txt$),
  (42, $txt$C$txt$, 3, false, $txt$5 ∈ A$txt$),
  (42, $txt$D$txt$, 4, true, $txt$5 ∈ B$txt$),
  (43, $txt$A$txt$, 1, true, $txt$23 students$txt$),
  (43, $txt$B$txt$, 2, false, $txt$17 students$txt$),
  (43, $txt$C$txt$, 3, false, $txt$30 students$txt$),
  (43, $txt$D$txt$, 4, false, $txt$29 students$txt$),
  (44, $txt$A$txt$, 1, false, $txt${a, b, c, d, e}$txt$),
  (44, $txt$B$txt$, 2, true, $txt${b, e}$txt$),
  (44, $txt$C$txt$, 3, false, $txt${f}$txt$),
  (44, $txt$D$txt$, 4, false, $txt${a, c}$txt$),
  (45, $txt$A$txt$, 1, false, $txt${5, 7}$txt$),
  (45, $txt$B$txt$, 2, false, $txt${0, 2, 4, 6}$txt$),
  (45, $txt$C$txt$, 3, false, $txt${1, 3}$txt$),
  (45, $txt$D$txt$, 4, true, $txt${1, 3, 5, 7}$txt$),
  (46, $txt$A$txt$, 1, true, $txt$6 students$txt$),
  (46, $txt$B$txt$, 2, false, $txt$19 students$txt$),
  (46, $txt$C$txt$, 3, false, $txt$8 students$txt$),
  (46, $txt$D$txt$, 4, false, $txt$14 students$txt$),
  (47, $txt$A$txt$, 1, false, $txt$32 students$txt$),
  (47, $txt$B$txt$, 2, true, $txt$23 students$txt$),
  (47, $txt$C$txt$, 3, false, $txt$28 students$txt$),
  (47, $txt$D$txt$, 4, false, $txt$5 students$txt$),
  (48, $txt$A$txt$, 1, false, $txt$∅ ∈ A$txt$),
  (48, $txt$B$txt$, 2, false, $txt$m ⊂ A$txt$),
  (48, $txt$C$txt$, 3, false, $txt${p} ⊂ A$txt$),
  (48, $txt$D$txt$, 4, true, $txt${m} ⊂ A$txt$),
  (49, $txt$A$txt$, 1, false, $txt$29 students$txt$),
  (49, $txt$B$txt$, 2, false, $txt$36 students$txt$),
  (49, $txt$C$txt$, 3, true, $txt$17 students$txt$),
  (49, $txt$D$txt$, 4, false, $txt$10 students$txt$),
  (50, $txt$A$txt$, 1, false, $txt$M ∪ S$txt$),
  (50, $txt$B$txt$, 2, true, $txt$M ∪ A$txt$),
  (50, $txt$C$txt$, 3, false, $txt$S′$txt$),
  (50, $txt$D$txt$, 4, false, $txt$M ∩ A$txt$)
),
target as (
  select q.id, (q.config ->> 'question_number')::int as n
    from public.questions q
   where q.organization_id = '0a400000-0000-4000-8000-000000000001'
     and q.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment'
     and not exists (select 1 from public.question_options o where o.question_id = q.id)
)
insert into public.question_options (question_id, label, is_correct, position, content_doc)
select t.id, o.label, o.is_correct, o.position,
       jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
         jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
           jsonb_build_object('type', 'text', 'text', o.body)))))
  from target t
  join opts o on o.n = t.n;
