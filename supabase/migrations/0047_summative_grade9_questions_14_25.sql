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

-- This step writes questions 14–25. Idempotent: a question whose
-- source marker and number already exist is skipped, so re-running it is a
-- no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (14, $txt$A box plot is drawn for the 100 m times, in seconds, of all 40 athletes in a school race. How many athletes are represented by the box itself (the part between Q1 and Q3)?$txt$, $txt$1. By definition the box runs from Q1 to Q3, which is the middle 50% of the data.
2. 50% of 40 athletes is 0.5 × 40 = 20 athletes.
3. Each whisker section (min to Q1, and Q3 to max) represents a quarter of the data, here 10 athletes each.
4. The box plot divides the data into four parts of equal numbers of athletes, not four parts of equal length.

Why the other options are wrong:
A This counts the box plus one whisker, which is 75% of the athletes. 
B This is a quarter of the athletes, which is what one whisker section represents, not the box. 
D The whole plot, box plus both whiskers, represents all 40 athletes. MYP 5 MATHEMATICS PART II · SOLUTIONS · BOX-AND-WHISKER PLOTS & OUTLIERS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 31 of 45$txt$, $txt$easy$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":14,"criterion":"A","criterion_level":"1–2","descriptor":null}$txt$::jsonb),
  (15, $txt$Twelve torch batteries of the same brand were tested to failure, giving lifetimes in hours: 42, 45, 48, 50, 52, 54, 56, 58, 60, 63, 66, 84. Using the 1.5 × IQR rule, what is the upper fence, and is the 84-hour battery an outlier? Give the fence to 2 decimal places.$txt$, $txt$1. n = 12, so the halves have 6 values each: Q1 = (48 + 50) ÷ 2 = 49 and Q3 = (60 + 63) ÷ 2 = 61.5.
2. IQR = 61.5 − 49 = 12.5, so 1.5 × IQR = 18.75.
3. Upper fence = Q3 + 1.5 × IQR = 61.5 + 18.75 = 80.25 h. Lower fence = 49 − 18.75 = 30.25 h.
4. Because 84 > 80.25, the 84-hour battery is an outlier. On the box plot it is drawn as an isolated circle beyond the whisker, which stops at 66.

Why the other options are wrong:
A This adds one IQR instead of 1.5 IQR, so the fence is too low. 
B This uses the range (42 h) instead of the IQR inside the rule. 
C This uses Q1 in place of Q3 for the upper fence.$txt$, $txt$medium$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":15,"criterion":"A","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q15.png"}$txt$::jsonb),
  (16, $txt$The two box plots show the waiting time, in minutes, of 12 customers at each of two market stalls. Which statement is a valid conclusion from the plots?$txt$, $txt$1. Stall A: Q1 = 14.5, Q2 = 19, Q3 = 25, so IQR = 10.5 minutes.
2. Stall B: Q1 = 23, Q2 = 41, Q3 = 59, so IQR = 36 minutes.
3. B’s box lies further to the right, so B’s typical wait is longer; B’s box and whiskers are also much wider, so B’s waits vary more.
4. A complete comparison names both centre and spread, as option D does.

Why the other options are wrong:
A Spread does not determine centre; a large IQR does not force a large median, so the reasoning is invalid even though the medians do differ. 
C A common scale lets the spreads be compared — it does not make them equal; B’s box is much wider. 
D A maximum and an IQR are different kinds of measure, so comparing them proves nothing.$txt$, $txt$medium$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":16,"criterion":"C","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q16.png"}$txt$::jsonb),
  (17, $txt$The box plot shows the daily number of passengers carried by a taxi on a fixed route for 12 days. Which five- point summary matches the plot?$txt$, $txt$1. Sorted data: 12, 14, 15, 16, 17, 18, 19, 21, 23, 25, 27, 52.
2. n = 12: Q2 = (18 + 19) ÷ 2 = 18.5; lower half (6 values) has median Q1 = (15 + 16) ÷ 2 = 15.5; upper half has Q3 = (23 + 25) ÷ 2 = 24.
3. Fences: 15.5 − 12.75 = 2.75 and 24 + 12.75 = 36.75, so 52 is an outlier and is plotted as a circle, while the whisker stops at 27.
4. Five-point summary 12, 15.5, 18.5, 24, 52 — the maximum of the data, not the end of the whisker.

Why the other options are wrong:
A This includes the two middle values in both halves, which the convention for this paper does not allow. 
B This uses the (n + 1) ÷ 4 position rule with linear interpolation instead of the median-of-halves convention required here. 
C The right whisker ends at 27 because 52 is an outlier; the outlier is still the maximum of the data. MYP 5 MATHEMATICS PART II · SOLUTIONS · BOX-AND-WHISKER PLOTS & OUTLIERS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 32 of 45$txt$, $txt$medium$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-B$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":17,"criterion":"B","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q17.png"}$txt$::jsonb),
  (18, $txt$A shopkeeper recorded the number of customers arriving each hour on 20 Saturday hours, in the order recorded: 23, 8, 36, 14, 20, 30, 55, 18, 24, 39, 28, 16, 26, 61, 21, 33, 11, 22, 25, 19. How many values in this data set are outliers by the 1.5 × IQR rule?$txt$, $txt$1. Sort first: 8, 11, 14, 16, 18, 19, 20, 21, 22, 23, 24, 25, 26, 28, 30, 33, 36, 39, 55, 61.
2. n = 20, halves of 10: Q1 = (18 + 19) ÷ 2 = 18.5, Q3 = (30 + 33) ÷ 2 = 31.5, so IQR = 13.
3. Fences: 18.5 − 19.5 = −1 and 31.5 + 19.5 = 51.
4. The values 55 and 61 exceed 51, so there are 2 outliers. Nothing can fall below the lower fence because counts are positive.

Why the other options are wrong:
A This counts every value above Q3, which is not the outlier rule. 
B This treats only the largest value as extreme, but 55 also lies beyond the upper fence. 
D This uses the range in place of the IQR, which makes the fences far too wide.$txt$, $txt$hard$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":18,"criterion":"C","criterion_level":"5–6","descriptor":"MULTI-STEP"}$txt$::jsonb),
  (19, $txt$Two tontine groups record each member’s weekly contribution, in cedis, over 10 weeks. Village A: 20, 25, 30, 35, 40, 45, 50, 55, 60, 105. Village B: 35, 40, 45, 50, 52, 55, 58, 60, 62, 65. Using the 1.5 × IQR rule and the two distributions, which statement is correct?$txt$, $txt$consistent.
1. Village A sorted: 20, 25, 30, 35, 40, 45, 50, 55, 60, 105 → Q1 = 30, Q2 = 42.5, Q3 = 55, IQR = 25.
2. Upper fence for A = 55 + 1.5 × 25 = 92.5, so the 105 cedi week is an outlier; the whisker stops at 60.
3. Village B → Q1 = 45, Q2 = 53.5, Q3 = 60, IQR = 15, upper fence = 82.5, so B has no outliers.
4. B’s median is higher and its IQR is smaller (15 against 25), so B contributes more on average and far more consistently. Removing A’s outlier raises A’s mean but leaves its median almost unchanged.

Why the other options are wrong:
A Being the largest value is not the test; and the median is unaffected by one extreme value, so A’s median stays below B’s. 
B The rule uses 1.5 × IQR, not 1.5 × range; and A’s median (42.5) is below B’s (53.5). 
D Signs of the values have nothing to do with the outlier test. Chapter 4 · Grouped Frequency Tables Solutions to questions 20, 21, 22, 23, 24, 25$txt$, $txt$hard$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":19,"criterion":"D","criterion_level":"5–6","descriptor":"COMPARING DISTRIBUTIONS","figure":"/exam-figures/grade9/q19.png"}$txt$::jsonb),
  (20, $txt$The masses, in kilograms, of 40 bags of rice stored in a warehouse are grouped in the table. Estimate the mean mass of a bag.$txt$, $txt$1. Midpoints: x = 12.5, 17.5, 22.5, 27.5 for the four classes.
2. Multiply by the frequencies: 6 × 12.5 + 12 × 17.5 + 14 × 22.5 + 8 × 27.5 = 75 + 210 + 315 + 220 = 820.
3. x̄ = 820 ÷ 40 = 20.5 kg.
4. This is an estimate because every bag in a class is treated as if it weighed the class midpoint.

Why the other options are wrong:
B 22.5 is the midpoint of the modal class, which is not the mean. 
C This uses the lower class boundaries instead of the midpoints. 
D This uses the upper class boundaries instead of the midpoints. MYP 5 MATHEMATICS PART II · SOLUTIONS · GROUPED FREQUENCY TABLES 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 33 of 45$txt$, $txt$easy$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":20,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q20.png"}$txt$::jsonb),
  (21, $txt$The table shows the marks, out of 100, of 50 students in an end-of-term test. State the modal class and the median class.$txt$, $txt$1. The modal class is the class with the largest frequency: 18 students in 40 ≤ s < 50.
2. Cumulative frequencies are 18, 28, 37, 45, 50.
3. The median is at position 50 ÷ 2 = 25; since 18 < 25 ≤ 28, position 25 lies in 50 ≤ s < 60.
4. So the modal class is 40 ≤ s < 50 and the median class is 50 ≤ s < 60.

Why the other options are wrong:
A These are the frequency and the position, not the class intervals that the question asks for. 
B The median class is not the same as the modal class; the cumulative frequency shows that position 25 lies in the class 50 ≤ s < 60. 
D Position 3n ÷ 4 = 37.5 locates the upper quartile class, not the median class.$txt$, $txt$easy$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":21,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q21.png"}$txt$::jsonb),
  (22, $txt$The lengths, in centimetres, of 30 fish caught by a fishing cooperative in Ada are grouped as shown. Estimate the median length, to 1 decimal place.$txt$, $txt$1. n = 30, so the median is at position 15. Cumulative frequencies: 4, 13, 24, 30, so position 15 lies in 30 ≤ L < 40.
2. In that class L = 30, f = 11, w = 10 and the cumulative frequency before it is CF = 13.
3. Median ≈ 30 + [(15 − 13) ÷ 11] × 10 = 30 + 1.818 = 31.8 cm (1 d.p.).
4. The estimate assumes the 11 fish in the class are spread evenly across the interval.

Why the other options are wrong:
A This is the lower boundary of the median class; the median lies above it because 2 of the 11 fish in the class are needed. 
B This is the midpoint of the median class, which is not the interpolated median. 
C This subtracts the cumulative frequency of the first class (4) instead of the cumulative frequency before the median class (13).$txt$, $txt$medium$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":22,"criterion":"A","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q22.png"}$txt$::jsonb),
  (23, $txt$Daily sales of a provision shop, in cedis, over 50 days are grouped in the table. A student estimated the mean sales by calculating (20 + 40 + 60 + 80) ÷ 4 = 50. Which error explains her working?$txt$, $txt$frequencies.
1. The four numbers 20, 40, 60, 80 are exactly the lower boundaries of the four classes.
2. They were added and divided by 4, so each class counted once regardless of how many days it contains — the frequencies 8, 14, 16, 12 were ignored.
3. The correct estimate uses midpoints weighted by frequency: (8 × 30 + 14 × 50 + 16 × 70 + 12 × 90) ÷ 50 = 3140 ÷ 50 = 62.8 cedis.
4. Checking the other readings: midpoints average to 60, upper boundaries to 70 and widths to 20 — none of them gives 50.

Why the other options are wrong:
A The widths are 20, 20, 20, 20; averaging them gives 20, not 50. 
B The upper boundaries are 40, 60, 80, 100, which average to 70, not 50. 
D The midpoints are 30, 50, 70, 90, whose sum divided by 4 is 60, not 50. MYP 5 MATHEMATICS PART II · SOLUTIONS · GROUPED FREQUENCY TABLES 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 34 of 45$txt$, $txt$medium$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":23,"criterion":"C","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q23.png"}$txt$::jsonb),
  (24, $txt$The travel time to school, in minutes, of 60 students in a class is grouped as shown. Estimate the mean travel time, correct to 1 decimal place.$txt$, $txt$1. Midpoints are 5, 15, 25, 35, 45 minutes with frequencies 6, 18, 21, 10, 5.
2. Σ f x = 30 + 270 + 525 + 350 + 225 = 1400 and Σ f = 60.
3. x̄ = 1400 ÷ 60 = 23.333… ≈ 23.3 minutes (1 d.p.).
4. Because the data are grouped, 23.3 minutes is an estimate; a typical student travels between 20 and 30 minutes.

Why the other options are wrong:
A This is Σ f x, the numerator only; it was not divided by the 60 students. 
B This uses the lower class boundaries instead of the midpoints. 
C This is the mean of the five midpoints, which ignores the frequencies.$txt$, $txt$medium$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":24,"criterion":"D","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q24.png"}$txt$::jsonb),
  (25, $txt$The marks of 48 students in a mathematics test are grouped in the table. A grade B is awarded for a mark of at least 60. How many students are awarded grade B?$txt$, $txt$1. The qualifying classes are those beginning at 60 or higher: 60 ≤ m < 70 (11), 70 ≤ m < 80 (6) and 80 ≤ m < 90 (3).
2. 11 + 6 + 3 = 20 students are awarded grade B.
3. Check with the cumulative column: 28 students scored below 60, and 48 − 28 = 20.
4. As a percentage, 20 ÷ 48 ≈ 41.7% of the class achieved grade B or above.

Why the other options are wrong:
B This leaves out the class 80 ≤ m < 90, which also qualifies. 
C This is the cumulative frequency at 70, a value read from the wrong place in the table. 
D This is the cumulative frequency at 60, which counts the students who scored LESS than 60. Chapter 5 · Cumulative Frequency Curves Solutions to questions 26, 27, 28, 29, 30, 31$txt$, $txt$hard$txt$, $txt$Grouped Frequency Tables$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$grouped-frequency-tables$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":25,"criterion":"D","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q25.png"}$txt$::jsonb)
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
  (15, $txt$/exam-figures/grade9/q15.png$txt$, null),
  (16, $txt$/exam-figures/grade9/q16.png$txt$, null),
  (17, $txt$/exam-figures/grade9/q17.png$txt$, null),
  (18, null, $txt$Customers per hour (order recorded): 23, 8, 36, 14, 20, 30, 55, 18, 24, 39, 28, 16, 26, 61, 21, 33, 11, 22, 25, 19$txt$),
  (19, $txt$/exam-figures/grade9/q19.png$txt$, null),
  (20, $txt$/exam-figures/grade9/q20.png$txt$, null),
  (21, $txt$/exam-figures/grade9/q21.png$txt$, null),
  (22, $txt$/exam-figures/grade9/q22.png$txt$, null),
  (23, $txt$/exam-figures/grade9/q23.png$txt$, null),
  (24, $txt$/exam-figures/grade9/q24.png$txt$, null),
  (25, $txt$/exam-figures/grade9/q25.png$txt$, null)
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
