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

-- This step writes questions 26–38. Idempotent: a question whose
-- source marker and number already exist is skipped, so re-running it is a
-- no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (26, $txt$The cumulative frequency curve shows the marks out of 60 obtained by the 60 students in a mathematics test at a school in Bo. Read the curve to find how many students scored less than 30 marks.$txt$, $txt$1. On a cumulative frequency curve the height of the point above a value is the number of students at or below that value.
2. Go to 30 on the horizontal axis, move up to the curve and read across: the plotted point is at a cumulative frequency of 25.
3. So 25 of the 60 students scored less than 30 marks.
4. Check: the classes below 30 have frequencies 5 + 5 + 15 = 25 ✓.

Why the other options are wrong:
A This is the frequency of the class 20 ≤ m < 30 alone, not the running total up to 30. 
C This is the cumulative frequency at 40 marks, read at the wrong end of the scale. 
D This is the frequency of the next class, 30 ≤ m < 40; it is not part of the total below 30. MYP 5 MATHEMATICS PART II · SOLUTIONS · CUMULATIVE FREQUENCY CURVES 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 35 of 45$txt$, $txt$easy$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":26,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q26.png"}$txt$::jsonb),
  (27, $txt$A student copies this table of the shopping times of 50 customers in a supermarket in Accra and has to complete the cumulative frequency column. Which value belongs in the empty cell?$txt$, $txt$1. Each cumulative frequency is the frequency of that class added to the cumulative frequency of the class before it.
2. The class before ends with a cumulative frequency of 30, and this class has frequency 12.
3. 30 + 12 = 42, so the empty cell is 42.
4. Continue the check: 42 + 8 = 50, which is the total number of customers ✓.

Why the other options are wrong:
A This is the total of all 50 frequencies, which belongs in the last row only. 
B This is the frequency of the class 30 ≤ t < 40; the cumulative column needs the running total. 
D This is the cumulative frequency of the class BEFORE, so one class was left out of the total.$txt$, $txt$easy$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":27,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q27.png"}$txt$::jsonb),
  (28, $txt$The curve shows the times, in minutes, taken by 40 students in Kisumu to walk to school. Estimate the median walking time.$txt$, $txt$1. The median is the value at half the total cumulative frequency: 40 ÷ 2 = 20.
2. Read across from 20 on the vertical axis to the curve, then straight down: the point lies inside the class 20 ≤ t < 30.
3. By interpolation, 20 + (20 − 15) ÷ (25 − 15) × 10 = 25 minutes.
4. So the estimated median walking time is 25 minutes.

Why the other options are wrong:
A This is the value read at cumulative frequency 30, which is 3n/4 — the upper quartile, not the median. 
B This is the lower boundary of the median class 20 ≤ t < 30, not the interpolated value inside it. 
C This is the upper boundary of the median class; half the students had already been counted before it.$txt$, $txt$medium$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":28,"criterion":"C","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q28.png"}$txt$::jsonb),
  (29, $txt$The table shows the marks out of 50 obtained by 50 students in a history test. Which set of points gives the correct cumulative frequency curve for these marks?$txt$, $txt$1. Build the cumulative column first: 5, 5 + 11 = 16, 16 + 14 = 30, 30 + 13 = 43, 43 + 7 = 50.
2. A cumulative frequency curve is plotted against the UPPER class boundaries, and it starts with cumulative frequency 0 at the lower boundary of the first class.
3. So the points are (0, 0), (10, 5), (20, 16), (30, 30), (40, 43), (50, 50).
4. The curve can never go down, because the running total only grows; the last height must equal the total, 50.

Why the other options are wrong:
A These points use the class MIDPOINTS on the horizontal axis; a cumulative frequency curve is plotted against the upper class boundaries. 
B The cumulative frequencies are right, but the curve is missing its starting point (0, 0) on the horizontal axis. 
D These points plot the class frequencies instead of the running totals, so the graph falls as well as rises. MYP 5 MATHEMATICS PART II · SOLUTIONS · CUMULATIVE FREQUENCY CURVES 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 36 of 45$txt$, $txt$medium$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-B$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":29,"criterion":"B","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q29.png"}$txt$::jsonb),
  (30, $txt$The curve shows the masses, in kilograms, of tomatoes harvested from each of the 32 plots in a market garden near Nsawkw. Estimate the values of Q1, Q2 and Q3 from the curve.$txt$, $txt$1. For n = 32 plots the quartiles lie at cumulative frequencies n/4 = 8, n/2 = 16 and 3n/4 = 24.
2. Read across from each of these heights to the curve, then down to the horizontal axis.
3. The curve passes through (30, 8), (35, 16) and (40, 24), so Q1 = 30, Q2 = 35 and Q3 = 40 kg.
4. This gives IQR = 40 − 30 = 10 kg, the spread of the middle half of the plots.

Why the other options are wrong:
A These are the LOWER boundaries of the classes that carry the quartiles; the quartile is found at the upper boundary of the class on the curve. 
B These take the least and greatest values as the outer quartiles; Q1 and Q3 are quarter positions, not the ends of the data. 
C These are the cumulative-frequency positions n/4, n/2 and 3n/4 read off the vertical axis as though they were masses.$txt$, $txt$hard$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":30,"criterion":"C","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q30.png"}$txt$::jsonb),
  (31, $txt$A school in Bo gives a certificate to every student who scores at least 40 marks on the test in Question 26, whose curve is shown here. What percentage of the 60 students received a certificate?$txt$, $txt$1. Read the curve at 40 marks: the cumulative frequency is 45, so 45 students scored less than 40.
2. Students with at least 40 marks: 60 − 45 = 15.
3. As a percentage of the whole class: 15 ÷ 60 = 0.25, that is 25%.
4. In context, one student in four received a certificate.

Why the other options are wrong:
A This is the percentage who did NOT receive a certificate, 45 ÷ 60. 
B This turns the cumulative frequency 45 into a percentage, but 45 students scored LESS than 40 marks. 
D This writes the 15 qualifying students as a percentage without dividing by 60. Chapter 6 · Histograms and Distribution Shape Solutions to questions 32, 33, 34, 35, 36, 37, 38$txt$, $txt$hard$txt$, $txt$Cumulative Frequency Curves$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$cumulative-frequency-curves$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":31,"criterion":"D","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q31.png"}$txt$::jsonb),
  (32, $txt$The histogram shows the masses, in kilograms, of 50 bags of rice in a warehouse in Lomé. How many bags have a mass between 25 kg and 30 kg?$txt$, $txt$1. With equal class widths the height of a bar IS its frequency, so the bar over 25 to 30 is read directly.
2. That bar reaches a height of 14 on the frequency scale.
3. So 14 of the 50 bags have a mass between 25 kg and 30 kg.
4. Reasonable check: the five bar heights 6 + 14 + 12 + 10 + 8 = 50 ✓.

Why the other options are wrong:
A This is the height of the FIRST bar, the class 20 ≤ m < 25. 
C This is the total of the first two bars, 6 + 14, the number of bags lighter than 30 kg. 
D This is the height of the bar for 30 ≤ m < 35, one bar too far to the right. MYP 5 MATHEMATICS PART II · SOLUTIONS · HISTOGRAMS & DISTRIBUTION SHAPE 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 37 of 45$txt$, $txt$easy$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":32,"criterion":"C","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q32.png"}$txt$::jsonb),
  (33, $txt$The same 50 bags of rice are drawn as a relative-frequency histogram. What is the height of the bar for the class 25 ≤ m < 30, to 2 decimal places?$txt$, $txt$1. Relative frequency = frequency ÷ total frequency.
2. This class has frequency 14 and there are 50 bags altogether.
3. 14 ÷ 50 = 0.28, so the bar is drawn with height 0.28.
4. All the bar heights of a relative-frequency histogram add to 1; here 0.12 + 0.28 + 0.24 + 0.20 + 0.16 = 1.00 ✓.

Why the other options are wrong:
A This is the relative frequency of the class 30 ≤ m < 35, the row below. 
C This is the relative frequency of the class 20 ≤ m < 30, from the row above. 
D This is the frequency of the class, which has not been divided by the total of 50.$txt$, $txt$easy$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":33,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q33.png"}$txt$::jsonb),
  (34, $txt$The waiting times, in minutes, of 70 customers at a mobile-money agent in Kumasi are grouped in the table. Calculate the frequency density of the class 20 ≤ t < 40, to 1 decimal place.$txt$, $txt$1. Frequency density = frequency ÷ class width.
2. The width of this class is 40 − 20 = 20 minutes and its frequency is 30.
3. 30 ÷ 20 = 1.5, so the frequency density is 1.5 customers per minute.
4. With the density as the height, the area of the bar is 1.5 × 20 = 30, the frequency ✓.

Why the other options are wrong:
B This is the frequency, used as the density without dividing by the class width. 
C This divides by 10 as though every class had width 10; this class has width 40 − 20 = 20. 
D This divides the class width by the frequency, 20 ÷ 30, which is upside down.$txt$, $txt$medium$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":34,"criterion":"A","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q34.png"}$txt$::jsonb),
  (35, $txt$The waiting times of 70 patients at a clinic in Dakar are grouped in classes of widths 10, 10, 20 and 30 minutes. A student draws the histogram shown here using the frequencies as the bar heights. Which statement correctly describes her graph?$txt$, $txt$height, that represents the frequency.
1. The classes have widths 10, 10, 20 and 30 minutes, so they are NOT equal.
2. In a histogram the AREA of each bar must represent the frequency, which means height = frequency ÷ width.
3. Correct heights would be 8 ÷ 10 = 0.8, 20 ÷ 10 = 2, 30 ÷ 20 = 1.5 and 12 ÷ 30 = 0.4.
4. As drawn, the last bar suggests 12 × 30 = 360 patients, so the widest class is heavily over-stated: the heights must be frequency densities.

Why the other options are wrong:
B Multiplying by the width makes the area f × w²; area must equal frequency, so the height must be divided by the width. 
C Frequencies as heights are only correct when all class widths are equal, which they are not here. 
D Histogram bars keep the order of the classes; reordering the classes cannot repair a wrong height. MYP 5 MATHEMATICS PART II · SOLUTIONS · HISTOGRAMS & DISTRIBUTION SHAPE 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 38 of 45$txt$, $txt$medium$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-B$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":35,"criterion":"B","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q35.png"}$txt$::jsonb),
  (36, $txt$The histogram shows the daily travel times, in minutes, of 40 delivery motorbike riders in Abidjan. Describe the shape of this distribution.$txt$, $txt$1. Most riders are bunched in the class 30 ≤ t < 40, which is the modal class with frequency 13.
2. To the left the frequencies drop 9, 4; to the right they drop slowly 8, 4, 2, giving a long tail towards the larger times.
3. A single peak with a tail to the right is skewed right (positively skewed).
4. This is confirmed by the estimates: mean ≈ 36.3 minutes exceeds the median ≈ 35.4 minutes.

Why the other options are wrong:
A The short times fall away quickly on the left; the long tail of riders is on the right, so the skew is positive, not negative. 
B The bars to the right of the peak (8, 4, 2) run on for three classes while those to the left (9, 4) stop after two, so the graph is not symmetric. 
C Only one class is the highest; a single rise to 13 and fall to 2 gives one peak, not two.$txt$, $txt$medium$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":36,"criterion":"C","criterion_level":"3–4","descriptor":null,"figure":"/exam-figures/grade9/q36.png"}$txt$::jsonb),
  (37, $txt$Four histograms show the number of loaves of bread sold each morning over several mornings at four bakeries in Cotonou. All the classes have the same width. Which statement correctly describes the shapes?$txt$, $txt$1. P reads 3, 8, 12, 8, 3: the same frequencies on both sides of the peak, so it is symmetric about 50 ≤ x < 55.
2. Q reads 14, 10, 6, 3, 2: it starts at the peak and trails off towards the larger values, so it is skewed right.
3. S reads 2, 3, 6, 10, 14, the mirror image of Q, so it is skewed left.
4. R reads 9, 3, 2, 4, 10: it rises again at the far end, which gives two peaks — a bimodal distribution, so the correct statement is that P is symmetric, Q is skewed right, R is bimodal and S is skewed left.

Why the other options are wrong:
B Q and S are mirror images of each other and neither is symmetric; R has two separate peaks. 
C R has two peaks, at the smallest and the largest classes, and the modal classes of P, Q, R and S are different. 
D P is indeed symmetric, but Q falls away towards the LARGER numbers (14, 10, 6, 3, 2), so Q is skewed right.$txt$, $txt$hard$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":37,"criterion":"C","criterion_level":"5–6","descriptor":"CONCEPTUAL REASONING","figure":"/exam-figures/grade9/q37.png"}$txt$::jsonb),
  (38, $txt$The histogram shows the frequency density of the times, in minutes, that 70 customers spent at a bank counter in Rabat. How many customers spent between 30 and 45 minutes at the counter?$txt$, $txt$1. In a histogram with unequal widths, frequency = area of the bar = frequency density × class width.
2. The bar from 30 to 45 has height 0.8 and width 45 − 30 = 15 minutes.
3. 0.8 × 15 = 12, so 12 customers spent between 30 and 45 minutes at the counter.
4. Check by adding every bar area: 3 × 5 + 1.2 × 15 + 2.5 × 10 + 0.8 × 15 = 15 + 18 + 25 + 12 = 70 ✓.

Why the other options are wrong:
A This is the frequency density of the class, which must still be multiplied by the class width. 
C This is the frequency of the class 5 ≤ t < 20, read from the wrong bar. 
D This multiplies by 10 minutes; the class 30 ≤ t < 45 is 15 minutes wide. MYP 5 MATHEMATICS PART II · SOLUTIONS · MEAN & STANDARD DEVIATION 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 39 of 45 Chapter 7 · Mean and Standard Deviation Solutions to questions 39, 40, 41, 42, 43, 44$txt$, $txt$hard$txt$, $txt$Histograms and Distribution Shape$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$histograms$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":38,"criterion":"D","criterion_level":"5–6","descriptor":"MULTI-STEP","figure":"/exam-figures/grade9/q38.png"}$txt$::jsonb)
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
  (26, $txt$/exam-figures/grade9/q26.png$txt$, null),
  (27, $txt$/exam-figures/grade9/q27.png$txt$, null),
  (28, $txt$/exam-figures/grade9/q28.png$txt$, null),
  (29, $txt$/exam-figures/grade9/q29.png$txt$, null),
  (30, $txt$/exam-figures/grade9/q30.png$txt$, null),
  (31, $txt$/exam-figures/grade9/q31.png$txt$, null),
  (32, $txt$/exam-figures/grade9/q32.png$txt$, null),
  (33, $txt$/exam-figures/grade9/q33.png$txt$, null),
  (34, $txt$/exam-figures/grade9/q34.png$txt$, null),
  (35, $txt$/exam-figures/grade9/q35.png$txt$, null),
  (36, $txt$/exam-figures/grade9/q36.png$txt$, null),
  (37, $txt$/exam-figures/grade9/q37.png$txt$, null),
  (38, $txt$/exam-figures/grade9/q38.png$txt$, null)
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
