-- Grade 4 examinations — the printed answer choices and marking keys.
--
-- Source document: "OAK_Grade4_Second_Marking_Period_Exam_Papers_2026_2027.pdf",
-- marking schemes pages 14-17.
--
-- Every row here is a choice the paper prints, in the order the paper prints it.
-- The label is the printed letter (A, B, C, D) and the text is the printed
-- choice text, so the option a pupil taps is the option a teacher sees on the
-- printed paper. TRUE / FALSE cards get the two printed answers.
--
-- The correct flag is the marking scheme's own answer for that question number;
-- nothing is inferred. Where the scheme itself contradicts the printed card, the
-- scheme's letter is still what is keyed (it is the school's key) and the
-- question is flagged review_required in the question row — it is never repaired
-- here by re-wording an option.
--
-- Types that are marked by the platform without option rows are keyed in the
-- question's own `config` instead and appear here only when the paper prints
-- choices:
--   * numeric  — Q14, Q15, Q16 and Q19 of Mathematics carry the printed answer
--                as `numeric_answer` with tolerance 0;
--   * matching — Q20 (Mathematics, Science and Social Science) and Q19
--                (Language Arts) carry the printed pairings as `pairs`;
--   * ordering — Q18 of Mathematics, Q18 of Science and Q18 of Social Science
--                carry the printed items here, in the printed answer order, so
--                the platform can mark the sequence.
--
-- Idempotent: options are written only for a question that has none yet, so
-- re-running never duplicates or overwrites an authored choice.

with opts(subject, n, label, position, is_correct, body) as (
  values
  -- ── Mathematics (marking scheme page 14) ───────────────────────────────
  ('mathematics',  1, $txt$A$txt$, 1, false, $txt$240$txt$),
  ('mathematics',  1, $txt$B$txt$, 2, true,  $txt$2,400$txt$),
  ('mathematics',  1, $txt$C$txt$, 3, false, $txt$24,000$txt$),
  ('mathematics',  1, $txt$D$txt$, 4, false, $txt$1,000$txt$),
  ('mathematics',  2, $txt$A$txt$, 1, false, $txt$60$txt$),
  ('mathematics',  2, $txt$B$txt$, 2, false, $txt$500$txt$),
  ('mathematics',  2, $txt$C$txt$, 3, true,  $txt$600$txt$),
  ('mathematics',  2, $txt$D$txt$, 4, false, $txt$6,000$txt$),
  ('mathematics',  3, $txt$A$txt$, 1, true,  $txt$8,536$txt$),
  ('mathematics',  3, $txt$B$txt$, 2, false, $txt$8,426$txt$),
  ('mathematics',  3, $txt$C$txt$, 3, false, $txt$8,524$txt$),
  ('mathematics',  3, $txt$D$txt$, 4, false, $txt$6,536$txt$),
  ('mathematics',  4, $txt$A$txt$, 1, false, $txt$560$txt$),
  ('mathematics',  4, $txt$B$txt$, 2, false, $txt$150$txt$),
  ('mathematics',  4, $txt$C$txt$, 3, false, $txt$56,000$txt$),
  ('mathematics',  4, $txt$D$txt$, 4, true,  $txt$5,600$txt$),
  ('mathematics',  5, $txt$A$txt$, 1, false, $txt$648$txt$),
  ('mathematics',  5, $txt$B$txt$, 2, true,  $txt$768$txt$),
  ('mathematics',  5, $txt$C$txt$, 3, false, $txt$728$txt$),
  ('mathematics',  5, $txt$D$txt$, 4, false, $txt$868$txt$),
  ('mathematics',  6, $txt$A$txt$, 1, false, $txt$40$txt$),
  ('mathematics',  6, $txt$B$txt$, 2, false, $txt$124$txt$),
  ('mathematics',  6, $txt$C$txt$, 3, true,  $txt$144$txt$),
  ('mathematics',  6, $txt$D$txt$, 4, false, $txt$164$txt$),
  ('mathematics',  7, $txt$A$txt$, 1, true,  $txt$600$txt$),
  ('mathematics',  7, $txt$B$txt$, 2, false, $txt$60$txt$),
  ('mathematics',  7, $txt$C$txt$, 3, false, $txt$800$txt$),
  ('mathematics',  7, $txt$D$txt$, 4, false, $txt$500$txt$),
  ('mathematics',  8, $txt$A$txt$, 1, false, $txt$90$txt$),
  ('mathematics',  8, $txt$B$txt$, 2, true,  $txt$9$txt$),
  ('mathematics',  8, $txt$C$txt$, 3, false, $txt$8$txt$),
  ('mathematics',  8, $txt$D$txt$, 4, false, $txt$6$txt$),
  ('mathematics',  9, $txt$A$txt$, 1, false, $txt$4$txt$),
  ('mathematics',  9, $txt$B$txt$, 2, false, $txt$5$txt$),
  ('mathematics',  9, $txt$C$txt$, 3, true,  $txt$6$txt$),
  ('mathematics',  9, $txt$D$txt$, 4, false, $txt$8$txt$),
  ('mathematics', 10, $txt$A$txt$, 1, false, $txt$7$txt$),
  ('mathematics', 10, $txt$B$txt$, 2, true,  $txt$8$txt$),
  ('mathematics', 10, $txt$C$txt$, 3, false, $txt$9$txt$),
  ('mathematics', 10, $txt$D$txt$, 4, false, $txt$6$txt$),
  ('mathematics', 11, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('mathematics', 11, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('mathematics', 12, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('mathematics', 12, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('mathematics', 13, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('mathematics', 13, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('mathematics', 17, $txt$A$txt$, 1, false, $txt$30 × 40$txt$),
  ('mathematics', 17, $txt$B$txt$, 2, false, $txt$20 × 60$txt$),
  ('mathematics', 17, $txt$C$txt$, 3, false, $txt$12 × 100$txt$),
  ('mathematics', 17, $txt$D$txt$, 4, true,  $txt$50 × 30$txt$),
  -- Typed answers: the printed key text is the accepted label, because the
  -- platform scores a typed answer against its keyed option labels.
  ('mathematics', 14, $txt$13500$txt$, 1, true, $txt$13,500$txt$),
  ('mathematics', 15, $txt$120$txt$,   1, true, $txt$120$txt$),
  ('mathematics', 16, $txt$120$txt$,   1, true, $txt$120$txt$),
  -- Q18 ordering: the printed answer order, smallest quotient first.
  ('mathematics', 18, $txt$60 ÷ 20$txt$,  1, false, $txt$60 ÷ 20$txt$),
  ('mathematics', 18, $txt$80 ÷ 20$txt$,  2, false, $txt$80 ÷ 20$txt$),
  ('mathematics', 18, $txt$120 ÷ 20$txt$, 3, false, $txt$120 ÷ 20$txt$),

  -- ── Science (marking scheme page 15) ───────────────────────────────────
  ('science',  1, $txt$A$txt$, 1, false, $txt$Thick wool coat$txt$),
  ('science',  1, $txt$B$txt$, 2, true,  $txt$Light cotton clothes$txt$),
  ('science',  1, $txt$C$txt$, 3, false, $txt$Heavy fur jacket$txt$),
  ('science',  1, $txt$D$txt$, 4, false, $txt$Rubber raincoat$txt$),
  ('science',  2, $txt$A$txt$, 1, false, $txt$Cotton$txt$),
  ('science',  2, $txt$B$txt$, 2, false, $txt$Linen$txt$),
  ('science',  2, $txt$C$txt$, 3, true,  $txt$Wool$txt$),
  ('science',  2, $txt$D$txt$, 4, false, $txt$Nylon$txt$),
  ('science',  3, $txt$A$txt$, 1, false, $txt$Silk$txt$),
  ('science',  3, $txt$B$txt$, 2, false, $txt$Cotton$txt$),
  ('science',  3, $txt$C$txt$, 3, false, $txt$Jute$txt$),
  ('science',  3, $txt$D$txt$, 4, true,  $txt$Nylon$txt$),
  ('science',  4, $txt$A$txt$, 1, true,  $txt$Remove wrinkles & kill germs$txt$),
  ('science',  4, $txt$B$txt$, 2, false, $txt$Make clothes wet$txt$),
  ('science',  4, $txt$C$txt$, 3, false, $txt$Tear the fibres$txt$),
  ('science',  4, $txt$D$txt$, 4, false, $txt$Add dust$txt$),
  ('science',  5, $txt$A$txt$, 1, true,  $txt$Solid$txt$),
  ('science',  5, $txt$B$txt$, 2, false, $txt$Liquid$txt$),
  ('science',  5, $txt$C$txt$, 3, false, $txt$Gas$txt$),
  ('science',  5, $txt$D$txt$, 4, false, $txt$Vapour$txt$),
  ('science',  6, $txt$A$txt$, 1, false, $txt$Solid$txt$),
  ('science',  6, $txt$B$txt$, 2, false, $txt$Liquid$txt$),
  ('science',  6, $txt$C$txt$, 3, true,  $txt$Gas$txt$),
  ('science',  6, $txt$D$txt$, 4, false, $txt$Ice$txt$),
  ('science',  7, $txt$A$txt$, 1, false, $txt$Freezing$txt$),
  ('science',  7, $txt$B$txt$, 2, true,  $txt$Evaporation$txt$),
  ('science',  7, $txt$C$txt$, 3, false, $txt$Melting$txt$),
  ('science',  7, $txt$D$txt$, 4, false, $txt$Condensation$txt$),
  ('science',  8, $txt$A$txt$, 1, true,  $txt$Solute$txt$),
  ('science',  8, $txt$B$txt$, 2, false, $txt$Solvent$txt$),
  ('science',  8, $txt$C$txt$, 3, false, $txt$Solution$txt$),
  ('science',  8, $txt$D$txt$, 4, false, $txt$Residue$txt$),
  ('science',  9, $txt$A$txt$, 1, false, $txt$Evaporation$txt$),
  ('science',  9, $txt$B$txt$, 2, false, $txt$Magnetism$txt$),
  ('science',  9, $txt$C$txt$, 3, true,  $txt$Filtration$txt$),
  ('science',  9, $txt$D$txt$, 4, false, $txt$Melting$txt$),
  ('science', 10, $txt$A$txt$, 1, false, $txt$Sandy soil$txt$),
  ('science', 10, $txt$B$txt$, 2, true,  $txt$Loamy soil$txt$),
  ('science', 10, $txt$C$txt$, 3, false, $txt$Clayey soil$txt$),
  ('science', 10, $txt$D$txt$, 4, false, $txt$Gravel$txt$),
  ('science', 11, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('science', 11, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('science', 12, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('science', 12, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('science', 13, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('science', 13, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('science', 17, $txt$A$txt$, 1, false, $txt$Cotton$txt$),
  ('science', 17, $txt$B$txt$, 2, false, $txt$Wool$txt$),
  ('science', 17, $txt$C$txt$, 3, false, $txt$Silk$txt$),
  ('science', 17, $txt$D$txt$, 4, true,  $txt$Polyester$txt$),
  -- Q18 ordering: the printed answer order, top layer first.
  ('science', 18, $txt$Topsoil$txt$,     1, false, $txt$Topsoil$txt$),
  ('science', 18, $txt$Subsoil$txt$,     2, false, $txt$Subsoil$txt$),
  ('science', 18, $txt$Parent rock$txt$, 3, false, $txt$Parent rock$txt$),
  ('science', 18, $txt$Bedrock$txt$,     4, false, $txt$Bedrock$txt$),
  -- Q19 multiple select: the printed four candidates, two of them keyed.
  ('science', 19, $txt$A$txt$, 1, false, $txt$Sunlight$txt$),
  ('science', 19, $txt$B$txt$, 2, true,  $txt$Wind$txt$),
  ('science', 19, $txt$C$txt$, 3, true,  $txt$Running Water$txt$),
  ('science', 19, $txt$D$txt$, 4, false, $txt$Moonlight$txt$),

  ('science', 14, $txt$condensation$txt$, 1, true, $txt$condensation$txt$),
  ('science', 15, $txt$solvent$txt$,      1, true, $txt$solvent$txt$),
  ('science', 16, $txt$humus$txt$,        1, true, $txt$humus$txt$),

  -- ── Language Arts (marking scheme page 16) ─────────────────────────────
  ('language-arts',  1, $txt$A$txt$, 1, false, $txt$It was raining$txt$),
  ('language-arts',  1, $txt$B$txt$, 2, true,  $txt$To make room for Mrs Bello$txt$),
  ('language-arts',  1, $txt$C$txt$, 3, false, $txt$The bench broke$txt$),
  ('language-arts',  1, $txt$D$txt$, 4, false, $txt$To hide$txt$),
  ('language-arts',  2, $txt$A$txt$, 1, false, $txt$Cold water$txt$),
  ('language-arts',  2, $txt$B$txt$, 2, false, $txt$Storybooks$txt$),
  ('language-arts',  2, $txt$C$txt$, 3, true,  $txt$Sweet oranges$txt$),
  ('language-arts',  2, $txt$D$txt$, 4, false, $txt$Pencils$txt$),
  ('language-arts',  3, $txt$A$txt$, 1, false, $txt$Bench$txt$),
  ('language-arts',  3, $txt$B$txt$, 2, false, $txt$Orange$txt$),
  ('language-arts',  3, $txt$C$txt$, 3, false, $txt$Basket$txt$),
  ('language-arts',  3, $txt$D$txt$, 4, true,  $txt$Water$txt$),
  ('language-arts',  4, $txt$A$txt$, 1, true,  $txt$is$txt$),
  ('language-arts',  4, $txt$B$txt$, 2, false, $txt$are$txt$),
  ('language-arts',  4, $txt$C$txt$, 3, false, $txt$were$txt$),
  ('language-arts',  4, $txt$D$txt$, 4, false, $txt$have$txt$),
  ('language-arts',  5, $txt$A$txt$, 1, false, $txt$Empty$txt$),
  ('language-arts',  5, $txt$B$txt$, 2, true,  $txt$Packed$txt$),
  ('language-arts',  5, $txt$C$txt$, 3, false, $txt$Quiet$txt$),
  ('language-arts',  5, $txt$D$txt$, 4, false, $txt$Lonely$txt$),
  ('language-arts',  6, $txt$A$txt$, 1, true,  $txt$Short version of main ideas$txt$),
  ('language-arts',  6, $txt$B$txt$, 2, false, $txt$List of every comma$txt$),
  ('language-arts',  6, $txt$C$txt$, 3, false, $txt$New long story$txt$),
  ('language-arts',  6, $txt$D$txt$, 4, false, $txt$Author bio$txt$),
  ('language-arts',  7, $txt$A$txt$, 1, false, $txt$It turns red$txt$),
  ('language-arts',  7, $txt$B$txt$, 2, false, $txt$It grows taller$txt$),
  ('language-arts',  7, $txt$C$txt$, 3, true,  $txt$Its leaflets fold inward$txt$),
  ('language-arts',  7, $txt$D$txt$, 4, false, $txt$It drops fruit$txt$),
  ('language-arts',  8, $txt$A$txt$, 1, false, $txt$Wide$txt$),
  ('language-arts',  8, $txt$B$txt$, 2, true,  $txt$Folded / closed$txt$),
  ('language-arts',  8, $txt$C$txt$, 3, false, $txt$Bright$txt$),
  ('language-arts',  8, $txt$D$txt$, 4, false, $txt$Sunny$txt$),
  ('language-arts',  9, $txt$A$txt$, 1, false, $txt$leaflets$txt$),
  ('language-arts',  9, $txt$B$txt$, 2, false, $txt$folded$txt$),
  ('language-arts',  9, $txt$C$txt$, 3, true,  $txt$quietly$txt$),
  ('language-arts',  9, $txt$D$txt$, 4, false, $txt$dusk$txt$),
  ('language-arts', 10, $txt$A$txt$, 1, false, $txt$water$txt$),
  ('language-arts', 10, $txt$B$txt$, 2, false, $txt$waters$txt$),
  ('language-arts', 10, $txt$C$txt$, 3, false, $txt$was watering$txt$),
  ('language-arts', 10, $txt$D$txt$, 4, true,  $txt$were watering$txt$),
  ('language-arts', 14, $txt$are$txt$,    1, true,  $txt$are$txt$),
  ('language-arts', 15, $txt$Bakery$txt$, 1, true,  $txt$Bakery$txt$),
  ('language-arts', 16, $txt$us$txt$,     1, true,  $txt$us$txt$),
  ('language-arts', 20, $txt$West$txt$,   1, true,  $txt$West$txt$),
  ('language-arts', 11, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('language-arts', 11, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('language-arts', 12, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('language-arts', 12, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('language-arts', 13, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('language-arts', 13, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('language-arts', 17, $txt$A$txt$, 1, false, $txt$gently$txt$),
  ('language-arts', 17, $txt$B$txt$, 2, false, $txt$quickly$txt$),
  ('language-arts', 17, $txt$C$txt$, 3, false, $txt$brightly$txt$),
  ('language-arts', 17, $txt$D$txt$, 4, true,  $txt$garden$txt$),
  ('language-arts', 18, $txt$A$txt$, 1, true,  $txt$was watching$txt$),
  ('language-arts', 18, $txt$B$txt$, 2, false, $txt$were watching$txt$),

  -- ── Social Science (marking scheme page 17) ────────────────────────────
  ('social-science',  1, $txt$A$txt$, 1, true,  $txt$Choose a research question$txt$),
  ('social-science',  1, $txt$B$txt$, 2, false, $txt$Write the final report$txt$),
  ('social-science',  1, $txt$C$txt$, 3, false, $txt$Draw a conclusion$txt$),
  ('social-science',  1, $txt$D$txt$, 4, false, $txt$Throw away data$txt$),
  ('social-science',  2, $txt$A$txt$, 1, false, $txt$Guessing$txt$),
  ('social-science',  2, $txt$B$txt$, 2, true,  $txt$Analysis$txt$),
  ('social-science',  2, $txt$C$txt$, 3, false, $txt$Copying$txt$),
  ('social-science',  2, $txt$D$txt$, 4, false, $txt$Sleeping$txt$),
  ('social-science',  3, $txt$A$txt$, 1, false, $txt$Pillow$txt$),
  ('social-science',  3, $txt$B$txt$, 2, false, $txt$Bicycle$txt$),
  ('social-science',  3, $txt$C$txt$, 3, true,  $txt$Majority$txt$),
  ('social-science',  3, $txt$D$txt$, 4, false, $txt$Umbrella$txt$),
  ('social-science',  4, $txt$A$txt$, 1, true,  $txt$Fair thinking$txt$),
  ('social-science',  4, $txt$B$txt$, 2, false, $txt$Unfair thinking$txt$),
  ('social-science',  4, $txt$C$txt$, 3, false, $txt$Selfish thinking$txt$),
  ('social-science',  4, $txt$D$txt$, 4, false, $txt$Lazy thinking$txt$),
  ('social-science',  5, $txt$A$txt$, 1, false, $txt$4$txt$),
  ('social-science',  5, $txt$B$txt$, 2, true,  $txt$5$txt$),
  ('social-science',  5, $txt$C$txt$, 3, false, $txt$6$txt$),
  ('social-science',  5, $txt$D$txt$, 4, false, $txt$10$txt$),
  ('social-science',  6, $txt$A$txt$, 1, false, $txt$Timekeeper$txt$),
  ('social-science',  6, $txt$B$txt$, 2, false, $txt$Gatekeeper$txt$),
  ('social-science',  6, $txt$C$txt$, 3, true,  $txt$Recorder / Scribe$txt$),
  ('social-science',  6, $txt$D$txt$, 4, false, $txt$Driver$txt$),
  ('social-science',  7, $txt$A$txt$, 1, false, $txt$High access$txt$),
  ('social-science',  7, $txt$B$txt$, 2, false, $txt$Easy access$txt$),
  ('social-science',  7, $txt$C$txt$, 3, false, $txt$Free vegetables$txt$),
  ('social-science',  7, $txt$D$txt$, 4, true,  $txt$Poor / low access$txt$),
  ('social-science',  8, $txt$A$txt$, 1, true,  $txt$Less flooding & fewer sicknesses$txt$),
  ('social-science',  8, $txt$B$txt$, 2, false, $txt$More mosquitoes$txt$),
  ('social-science',  8, $txt$C$txt$, 3, false, $txt$Dirty streets$txt$),
  ('social-science',  8, $txt$D$txt$, 4, false, $txt$Blocked roads$txt$),
  ('social-science',  9, $txt$A$txt$, 1, false, $txt$Decoration$txt$),
  ('social-science',  9, $txt$B$txt$, 2, true,  $txt$Evaluation$txt$),
  ('social-science',  9, $txt$C$txt$, 3, false, $txt$Celebration$txt$),
  ('social-science',  9, $txt$D$txt$, 4, false, $txt$Imagination$txt$),
  ('social-science', 10, $txt$A$txt$, 1, false, $txt$Rumours$txt$),
  ('social-science', 10, $txt$B$txt$, 2, false, $txt$Coin toss$txt$),
  ('social-science', 10, $txt$C$txt$, 3, true,  $txt$Inspection & test reports$txt$),
  ('social-science', 10, $txt$D$txt$, 4, false, $txt$Guesswork$txt$),
  ('social-science', 14, $txt$17$txt$,          1, true, $txt$17$txt$),
  ('social-science', 15, $txt$country$txt$,     1, true, $txt$country$txt$),
  ('social-science', 16, $txt$source / tool$txt$, 1, true, $txt$source / tool$txt$),
  ('social-science', 11, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('social-science', 11, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('social-science', 12, $txt$TRUE$txt$,  1, true,  $txt$TRUE$txt$),
  ('social-science', 12, $txt$FALSE$txt$, 2, false, $txt$FALSE$txt$),
  ('social-science', 13, $txt$TRUE$txt$,  1, false, $txt$TRUE$txt$),
  ('social-science', 13, $txt$FALSE$txt$, 2, true,  $txt$FALSE$txt$),
  ('social-science', 17, $txt$A$txt$, 1, false, $txt$compare$txt$),
  ('social-science', 17, $txt$B$txt$, 2, false, $txt$majority$txt$),
  ('social-science', 17, $txt$C$txt$, 3, false, $txt$least$txt$),
  ('social-science', 17, $txt$D$txt$, 4, true,  $txt$pillow$txt$),
  -- Q18 ordering: the printed answer order, first step to last.
  ('social-science', 18, $txt$Collect data$txt$,    1, false, $txt$Collect data$txt$),
  ('social-science', 18, $txt$Analyse data$txt$,    2, false, $txt$Analyse data$txt$),
  ('social-science', 18, $txt$Evaluate results$txt$, 3, false, $txt$Evaluate results$txt$),
  ('social-science', 19, $txt$A$txt$, 1, false, $txt$Littering the park$txt$),
  ('social-science', 19, $txt$B$txt$, 2, true,  $txt$Planting shade trees$txt$),
  ('social-science', 19, $txt$C$txt$, 3, false, $txt$Wasting water$txt$)
)
insert into public.question_options (question_id, label, is_correct, position, content_doc)
select q.id, o.label, o.is_correct, o.position,
       jsonb_build_object(
         'type', 'doc',
         'content', jsonb_build_array(
           jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
             jsonb_build_object('type', 'text', 'text', o.body)))))
  from opts o
  join public.questions q
    on q.organization_id = '0a400000-0000-4000-8000-000000000001'
   and q.config ->> 'source' = 'oak-grade4-2026-2027'
   and q.config ->> 'subject' = o.subject
   and q.config ->> 'question_number' = o.n::text
 where not exists (select 1 from public.question_options x where x.question_id = q.id);
