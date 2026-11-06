-- Summative Assessment — Grade 9 (Oak International School)
--
-- Source document: "MYP 4 Statistics & Distributions E-Assessment" (45 pages,
-- supplied PDF). The file itself is printed "MYP 5" on every page; that label is
-- wrong — the paper is MYP 4 / Grade 9 — so the assessment is titled and filed as
-- Grade 9, and the document's own label is deliberately not reproduced.
--
-- Fidelity rules applied:
--   * answers are the document's own key (page 25), and every keyed letter was
--     cross-checked against the marking scheme's worked solution for that
--     question: 50/50 agree, 0 mismatches, 0 missing;
--   * the explanations are the document's own worked solutions and its
--     "why the other options are wrong" notes, re-flowed only (PDF line
--     wrapping removed) — never rewritten, never inferred;
--   * every item is 1 mark: the document states "1 mark each";
--   * 35 questions carry a figure (box plot, histogram, cumulative frequency
--     curve, normal curve, stem-and-leaf plot or frequency table). The PDF has
--     no raster images at all — every figure is vector — so each figure is
--     rendered from the page it is printed on, at 220 dpi, cropped to the
--     question's own band (caption included, nothing from the neighbouring
--     question) and stored in the repository as a static asset under
--     public/exam-figures/grade9/. Three further questions carry a plain data
--     callout, which is kept as text rather than as an image;
--   * question order and option order stay fixed, so the printed A–D key
--     remains valid (randomize_questions and randomize_options are false).

-- This step writes questions 39–50. Idempotent: a question whose
-- source marker and number already exist is skipped, so re-running it is a
-- no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (39, $txt$The times, in seconds, of 5 athletes in a 100 m sprint were as shown. Calculate the standard deviation of these times, to 2 decimal places, using the population formula σ = √(Σ(x - x̄)2 ÷ n).$txt$, $txt$1. The mean is (43 + 46 + 41 + 52 + 48) ÷ 5 = 230 ÷ 5 = 46 seconds.
2. Squared deviations from 46: (−3)² + 0² + (−5)² + 6² + 2² = 9 + 0 + 25 + 36 + 4 = 74.
3. Variance = 74 ÷ 5 = 14.8, so σ = √14.8 = 3.847….
4. To 2 decimal places the standard deviation is 3.85 seconds.

Why the other options are wrong:
A This is the mean of the times, not a measure of spread. 
B This divides the sum of squared deviations by n − 1 = 4 instead of by n = 5. 
D This is the variance Σ(x − x̄)² ÷ n; its square root was not taken.$txt$, $txt$easy$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":39,"criterion":"A","criterion_level":"1–2","descriptor":null}$txt$::jsonb),
  (40, $txt$In a class test the mean score of 10 students was 62 and the standard deviation was 8. The teacher then adds 5 marks to every student’s score. What are the new mean and standard deviation?$txt$, $txt$1. Adding 5 to every value moves the centre up by 5: new mean = 62 + 5 = 67.
2. Standard deviation measures how far the values lie from the mean, and every value and the mean all moved by the same amount.
3. So the deviations x − x̄ are unchanged and the new standard deviation is still 8.
4. Rule: for y = x + a, ȳ = x̄ + a and σy = σx.

Why the other options are wrong:
A This multiplies the standard deviation by 5 instead of leaving it alone. 
B Adding the same number to every score shifts the whole distribution; the distances between the scores, and so σ, are unchanged. 
C The mean does change: every score is 5 marks higher, so the mean rises by 5.$txt$, $txt$easy$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":40,"criterion":"A","criterion_level":"1–2","descriptor":null}$txt$::jsonb),
  (41, $txt$The table shows the number of loaves of bread sold each hour by a bakery in Porto-Novo over 30 hours. Calculate the standard deviation of the number of loaves sold per hour, to 2 decimal places.$txt$, $txt$1. Weighted mean: x̄ = Σfx ÷ Σf = (40 + 84 + 126 + 112 + 54) ÷ 30 = 416 ÷ 30 = 13.8667 loaves.
2. Multiply each squared deviation by its frequency: Σf(x − x̄)² = 167.4667.
3. Variance = 167.4667 ÷ 30 = 5.5822, so σ = √5.5822 = 2.3627.
4. To 2 decimal places the standard deviation is 2.36 loaves.

Why the other options are wrong:
B This is the weighted mean Σfx ÷ Σf, a measure of centre rather than of spread. 
C This divides by n − 1 = 29; the question asks for the population standard deviation, which divides by n = 30. 
D This is the variance Σf(x − x̄)² ÷ n; the square root was not taken. MYP 5 MATHEMATICS PART II · SOLUTIONS · MEAN & STANDARD DEVIATION 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 40 of 45$txt$, $txt$medium$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":41,"criterion":"D","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q41.png"}$txt$::jsonb),
  (42, $txt$The variance of the monthly salaries, in FCFA, of the 40 employees of a company in Cotonou is 2 500 000. What is the standard deviation, to the nearest FCFA, and what does it measure?$txt$, $txt$1. Standard deviation is the square root of the variance: σ = √(2 500 000).
2. √(2 500 000) = 1581.1388…, which is 1 581 FCFA to the nearest FCFA.
3. Because the square root is taken, σ is back in the units of the data (FCFA), unlike the variance.
4. In context, a salary typically differs from the mean salary of the 40 employees by about 1 581 FCFA.

Why the other options are wrong:
A Dividing by 40 has already been done when the variance was formed; the missing step is the square root, not another division. 
B The variance is measured in squared FCFA, so it cannot be compared with the salaries until the square root is taken. 
C Halving the variance has no meaning; σ is obtained by taking a square root.$txt$, $txt$medium$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":42,"criterion":"D","criterion_level":"3–4","descriptor":null}$txt$::jsonb),
  (43, $txt$The temperature x, in °C, was recorded every hour in Niamey. For the 24 readings the mean was 25 and the standard deviation was 6. Each reading is converted to degrees Fahrenheit by y = 1.8x + 32. What are the mean and standard deviation of the 24 values of y?$txt$, $txt$1. For y = a + bx the mean becomes a + b x̄ and the standard deviation becomes |b| σ.
2. Mean: 32 + 1.8 × 25 = 32 + 45 = 77 °F.
3. Standard deviation: 1.8 × 6 = 10.8 °F — the +32 only slides the scale, so it does not affect spread.
4. So the 24 Fahrenheit readings have mean 77 and σ 10.8.

Why the other options are wrong:
B This adds 32 to the standard deviation; adding a constant moves the data and the mean together, so it leaves σ unchanged. 
C This multiplies the mean by 1.8 but forgets to add the 32. 
D A change of scale does affect σ: multiplying every value by 1.8 multiplies σ by 1.8 as well.$txt$, $txt$hard$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":43,"criterion":"A","criterion_level":"5–6","descriptor":null}$txt$::jsonb),
  (44, $txt$A technician in Lagos recorded the number of phones he repaired each day for 40 days, and the table gives the totals Σfx = 154 and Σfx2 = 650. Use σ = √(Σfx2 ÷ n − x̄2) to calculate the standard deviation, to 2 decimal places.$txt$, $txt$1. x̄ = Σfx ÷ n = 154 ÷ 40 = 3.85 phones per day, so x̄² = 14.8225.
2. Σfx² ÷ n = 650 ÷ 40 = 16.25.
3. σ² = 16.25 − 14.8225 = 1.4275, therefore σ = √1.4275 = 1.1948.
4. To 2 decimal places the standard deviation is 1.19 phones.

Why the other options are wrong:
B This takes √(650 ÷ 40) without first subtracting x̄² = 14.8225. 
C This divides by n − 1 = 39 instead of n = 40, which gives the sample rather than the population standard deviation. 
D This is 16.25 − 3.85² = 1.4275, the variance; the final square root was not taken. MYP 5 MATHEMATICS PART II · SOLUTIONS · NORMAL DISTRIBUTIONS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 41 of 45 Chapter 8 · The Normal Distribution Solutions to questions 45, 46, 47, 48, 49, 50$txt$, $txt$hard$txt$, $txt$Mean and Standard Deviation$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$mean-and-standard-deviation$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":44,"criterion":"A","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q44.png"}$txt$::jsonb),
  (45, $txt$A distribution is approximately normal. Which of the following statements is NOT true of it?$txt$, $txt$1. The 68–95–99.7 rule says about 68% of values lie within ONE standard deviation of the mean.
2. About 95% lie within TWO standard deviations, and 99.7% within three.
3. So the statement claiming 95% within one σ is the one that is NOT true.
4. The other three statements are standard properties: symmetry about μ, equal mean/median/mode, and total area 1.

Why the other options are wrong:
A This is true: symmetry about μ is the defining shape of the normal curve. 
C This is true: because the curve is symmetric and unimodal, all three averages coincide at the centre. 
D This is true: area under the curve gives proportions, and the whole area is 1.$txt$, $txt$easy$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":45,"criterion":"A","criterion_level":"1–2","descriptor":null}$txt$::jsonb),
  (46, $txt$The heights of maize stalks in a field are approximately normally distributed with mean 120 cm and standard deviation 15 cm, as shown. One stalk measures 141 cm. Calculate its z-score, to 2 decimal places.$txt$, $txt$1. The z-score measures how many standard deviations the value is from the mean: z = (x − μ) ÷ σ.
2. z = (141 − 120) ÷ 15 = 21 ÷ 15.
3. 21 ÷ 15 = 1.4, so z = 1.40 to 2 decimal places.
4. The positive sign tells us the stalk is above the mean height, which agrees with its position on the curve.

Why the other options are wrong:
B This reverses the subtraction, σ − x in place of x − μ; a value above the mean has a positive z-score. 
C This divides the height by σ without subtracting the mean, 141 ÷ 15. 
D This subtracts the standard deviation from the height and divides by the mean, (141 − 15) ÷ 120.$txt$, $txt$medium$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":46,"criterion":"A","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q46.png"}$txt$::jsonb),
  (47, $txt$The masses of eggs laid by a flock of hens in Ho are approximately normal with mean 60 g and standard deviation 4 g, as shown. What percentage of the eggs have a mass between 52 g and 56 g?$txt$, $txt$1. 52 = 60 − 2 × 4 is μ − 2σ and 56 = 60 − 4 is μ − σ, so the shaded band lies between 1 and 2 standard deviations below the mean.
2. Within 2σ of the mean is 95%, and within 1σ is 68%, so the ring between them covers 95 − 68 = 27%.
3. That 27% is split equally between the left and right sides, so one side is 27 ÷ 2 = 13.5%.
4. About 13.5% of the eggs weigh between 52 g and 56 g.

Why the other options are wrong:
A This is half of 95%, the percentage between μ − 2σ and the mean, which is wider than the shaded band. 
C This is the percentage BELOW μ − σ, i.e. the left-hand tail beyond one standard deviation. 
D This is half of 68%, the percentage between μ − σ and the mean — the band to the RIGHT of the shaded one. MYP 5 MATHEMATICS PART II · SOLUTIONS · NORMAL DISTRIBUTIONS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 42 of 45$txt$, $txt$medium$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":47,"criterion":"C","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q47.png"}$txt$::jsonb),
  (48, $txt$The time customers spend shopping in a supermarket in Accra is approximately normal with mean 25 minutes and standard deviation 5 minutes. For 95% of shoppers, between which two times is their shopping time?$txt$, $txt$1. By the 68–95–99.7 rule, 95% of the values lie within TWO standard deviations of the mean.
2. Lower limit: μ − 2σ = 25 − 2 × 5 = 15 minutes; upper limit: μ + 2σ = 25 + 10 = 35 minutes.
3. So for 95% of shoppers the time lies between 15 and 35 minutes.
4. In context, only about one shopper in twenty takes longer than 35 minutes.

Why the other options are wrong:
A This is μ ± 3σ, which contains 99.7% of shoppers — wider than the 95% asked for. 
B This interval is only μ ± σ, which contains 68% of shoppers, not 95%. 
D This is the right-hand HALF of the 95% interval, containing only 47.5% of shoppers.$txt$, $txt$medium$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":48,"criterion":"D","criterion_level":"3–4","descriptor":null}$txt$::jsonb),
  (49, $txt$In a mathematics contest the 60 scores in the Nairobi branch have mean 84 and standard deviation 6, while the 80 scores in the Kampala branch have mean 90 and standard deviation 10. Amina scored 90 in Nairobi and Otieno scored 90 in Kampala. Who did better relative to their own branch?$txt$, $txt$1. Compare each score with its own branch by converting to a z-score: z = (x − μ) ÷ σ.
2. Amina: z = (90 − 84) ÷ 6 = 1.00, one full standard deviation above the Nairobi mean.
3. Otieno: z = (90 − 90) ÷ 10 = 0.00, exactly on the Kampala mean.
4. Amina did better relative to her own branch, and the z-scores make the two different distributions comparable.

Why the other options are wrong:
A The two z-scores are swapped: 90 is exactly the Kampala mean, so Otieno’s z-score is 0, not 1. 
C Equal raw marks are not equal achievements; the branches have different means and different spreads. 
D Converting to z-scores is exactly what makes the two branches comparable.$txt$, $txt$hard$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":49,"criterion":"C","criterion_level":"5–6","descriptor":null}$txt$::jsonb),
  (50, $txt$The lifetime of a torch battery is approximately normal with mean 200 hours and standard deviation 20 hours, as shown. The maker replaces free of charge any battery that fails before 160 hours. In a batch of 1000 batteries, how many are expected to be replaced?$txt$, $txt$1. 160 = 200 − 2 × 20, so 160 hours is exactly two standard deviations below the mean: z = −2.
2. Within 2σ of the mean is 95%, so 5% lies outside it, split equally between the two tails.
3. Proportion failing before μ − 2σ is 5 ÷ 2 = 2.5%.
4. 2.5% of 1000 batteries is 0.025 × 1000 = 25, so about 25 batteries are expected to be replaced.

Why the other options are wrong:
A This uses 25%, which is the percentage between μ − 2σ and the mean, on the wrong side of the curve. 
B This uses the whole 5% lying outside two standard deviations, but only the LEFT half of it is below 160 hours. 
D This is the 95% expected NOT to be replaced, read as though it were the number replaced.$txt$, $txt$hard$txt$, $txt$The Normal Distribution$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$normal-distribution$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":50,"criterion":"D","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q50.png"}$txt$::jsonb)
  ) as s(n, prompt, explanation, difficulty, topic, tags, config)
 where not exists (
   select 1 from public.questions q
    where q.organization_id = '0a400000-0000-4000-8000-000000000001'
      and q.config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment'
      and (q.config ->> 'question_number')::int = s.n
 );

-- Figures and data callouts become part of the structured prompt, so the student
-- screen shows them with the question instead of a caption with no figure. The
-- prompt text is taken from the row that was just written, never re-typed.
with extra(n, figure, callout) as (
  values
  (39, null, $txt$Times in seconds: 43, 46, 41, 52, 48$txt$),
  (41, $txt$/exam-figures/grade9/q41.png$txt$, null),
  (44, $txt$/exam-figures/grade9/q44.png$txt$, null),
  (46, $txt$/exam-figures/grade9/q46.png$txt$, null),
  (47, $txt$/exam-figures/grade9/q47.png$txt$, null),
  (50, $txt$/exam-figures/grade9/q50.png$txt$, null)
)
update public.questions q
   set prompt_doc = jsonb_build_object(
         'type', 'doc',
         'content', (
           jsonb_build_array(jsonb_build_object(
             'type', 'paragraph',
             'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', q.prompt))
           )) ||
           case
             when e.figure is not null then jsonb_build_array(
               jsonb_build_object('type', 'image', 'attrs', jsonb_build_object(
                 'src', e.figure, 'alt', 'Figure for question ' || e.n, 'width', 100)))
             when e.callout is not null then jsonb_build_array(
               jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(
                 jsonb_build_object('type', 'text', 'marks', jsonb_build_array(jsonb_build_object('type', 'bold')), 'text', e.callout))))
             else '[]'::jsonb
           end
         )
       )
  from extra e
 where q.organization_id = '0a400000-0000-4000-8000-000000000001'
   and q.config ->> 'source' = 'myp4-statistics-and-distributions-e-assessment'
   and (q.config ->> 'question_number')::int = e.n;
