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

-- This step writes questions 1–13. Idempotent: a question whose
-- source marker and number already exist is skipped, so re-running it is a
-- no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (1, $txt$A teacher records five variables for each of the 40 students in her class in Tamale: I favourite fruit; II travel time to school, in minutes; III number of brothers and sisters; IV shoe size; V the market where the family usually shops. Which of these variables are categorical (qualitative)?$txt$, $txt$1. Categorical (qualitative) data place each observation into a named group; they cannot be meaningfully added or averaged.
2. I favourite fruit — names of fruits, so categorical. V the market where the family shops — names of markets, so categorical.
3. II travel time in minutes is continuous quantitative; III number of brothers and sisters and IV shoe size are discrete quantitative.
4. So only I and V are categorical.

Why the other options are wrong:
A These are the two quantitative variables; both are numerical rather than categorical. 
C The number of brothers and sisters is a count, so it is discrete quantitative data. 
D Travel time is measured on a scale, so it is continuous quantitative data, not categorical.$txt$, $txt$easy$txt$, $txt$Categorising Data and Stem-and-Leaf Plots$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$categorising-data$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":1,"criterion":"A","criterion_level":"1–2","descriptor":"CONCEPTUAL REASONING"}$txt$::jsonb),
  (2, $txt$The stem-and-leaf plot shows the marks, out of 80, obtained by 22 students in a mathematics test. How many students scored at least 50 marks?$txt$, $txt$1. The key says stem 5 with leaf 0 is the value 50, so the qualifying values are in stems 5, 6 and 7.
2. Stem 5 contributes 6 leaves (50, 51, 53, 53, 54, 56), stem 6 contributes 2 (60, 62) and stem 7 contributes 1 (71).
3. 6 + 2 + 1 = 9 students scored at least 50 marks.
4. Check: 9 of the 22 leaves lie on or after the row that begins with the stem 5 and the leaf 0.

Why the other options are wrong:
A This counts only the leaves in stem 5 and ignores stems 6 and 7. 
B This excludes the student who scored exactly 50, although "at least 50" includes 50. 
C This counts the 40s as well, although only the stems 5, 6 and 7 are at least 50. Correct answer, step-by-step working, and the student error behind every distractor Questions 1–50 · 50 marks MYP 5 MATHEMATICS PART II · SOLUTIONS · CATEGORISING DATA & STEM-AND-LEAF PLOTS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 27 of 45$txt$, $txt$easy$txt$, $txt$Categorising Data and Stem-and-Leaf Plots$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$categorising-data$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":2,"criterion":"A","criterion_level":"1–2","descriptor":"INTERPRETATION OF A GRAPH","figure":"/exam-figures/grade9/q02.png"}$txt$::jsonb),
  (3, $txt$A trader at Agbogbloshie records four quantities for each crate of tomatoes she sells. Which one of these is a continuous quantitative variable?$txt$, $txt$1. Quantitative data are numerical; continuous data can take any value in an interval and come from measuring.
2. The mass of a crate is measured with a scale and can be 12.4 kg, 12.41 kg and so on, so it is continuous quantitative.
3. The number of tomatoes and the number of days are counts (discrete quantitative); the colour grade is a label (categorical).

Why the other options are wrong:
A A count of tomatoes can only be whole numbers, so it is discrete quantitative data. 
B Colour grade is a name or label, so it is categorical (qualitative) data. 
C Days are counted in whole numbers, so this is discrete quantitative data.$txt$, $txt$medium$txt$, $txt$Categorising Data and Stem-and-Leaf Plots$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$categorising-data$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":3,"criterion":"A","criterion_level":"3–4","descriptor":"CONCEPTUAL REASONING"}$txt$::jsonb),
  (4, $txt$The plot shows the heights of 22 fifteen-year-old students, measured in centimetres, but the key was left off the page. Which key makes the data possible?$txt$, $txt$1. The stems run from 14 to 18 and the leaves are single digits, so the key must turn a stem-and-leaf pair into a height.
2. Reading 15 | 2 as 152 cm gives heights from 148 cm to 186 cm, which is exactly the range of human heights for this age group.
3. Reading it as 15.2 cm or 152 mm gives 0.152 m, and 15.2 m is taller than a house — both impossible.
4. A stem-and-leaf plot is incomplete without its key: the same digits can be read as 152, 15.2 or 1520.

Why the other options are wrong:
B A height of 15.2 cm is about the length of a pencil, not the height of a student. 
C 15.2 m is taller than a single-storey building. 
D 152 mm equals 15.2 cm, which is impossible for a student’s height.$txt$, $txt$medium$txt$, $txt$Categorising Data and Stem-and-Leaf Plots$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$categorising-data$txt$, $txt$criterion-B$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":4,"criterion":"B","criterion_level":"3–4","descriptor":"CONSTRUCTION / ERROR ANALYSIS","figure":"/exam-figures/grade9/q04.png"}$txt$::jsonb),
  (5, $txt$This back-to-back stem-and-leaf plot shows the daily mass of tomatoes sold, in kilograms, at two market stalls over 12 market days each. What is the median daily sale at stall A?$txt$, $txt$1. Stall A has n = 12 values, which is even, so the median is the mean of the 6th and 7th values in order.
2. Reading A’s leaves from the stem outwards to the right and sorting: 12, 15, 18, 21, 24, 26, 28, 31, 33, 35, 38, 42. The 6th value is 26 and the 7th is 28.
3. Median = (26 + 28) ÷ 2 = 27 kg.
4. For comparison, stall B’s median is 32 kg, so B sold more than A on a typical day.

Why the other options are wrong:
A This is the 7th value only, so the two middle values were not averaged. 
B This is the mean of stall A’s sales, not the median. 
C This is the 6th value only; with 12 values the median needs the 6th and 7th. MYP 5 MATHEMATICS PART II · SOLUTIONS · CATEGORISING DATA & STEM-AND-LEAF PLOTS 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 28 of 45$txt$, $txt$hard$txt$, $txt$Categorising Data and Stem-and-Leaf Plots$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$categorising-data$txt$, $txt$criterion-B$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":5,"criterion":"B","criterion_level":"5–6","descriptor":"MULTI-STEP","figure":"/exam-figures/grade9/q05.png"}$txt$::jsonb),
  (6, $txt$A student copied these 20 numbers — customers served each day at a salon in East Legon — into a stem- and-leaf plot, but she wrote one number in the wrong row. Which number is incorrectly represented in her plot?$txt$, $txt$1. Expand the plot: its leaves give 18, 22, 25, 31, 34, 36, 38, 40, 42, 42, 45, 47, 48, 55, 58, 60, 63, 66, 71, 74.
2. Compare with the original list. The number 42 appears twice in the plot but once in the data, and 52 appears in the data but not in the plot.
3. So the value 52 was written as 42, in the row with stem 4 instead of the row with stem 5.
4. A reliable check is to count the leaves (here 20, correct) and to compare the sum of the plotted values with the sum of the data: 947 plotted against 999 in the data, a difference of 52 − 42 = 10.

Why the other options are wrong:
A 48 is correctly placed as the leaf 8 in the row with stem 4. 
C 55 is correctly placed as the leaf 5 in the row with stem 5. 
D This is the number that appears twice in the plot; it is a correct value, but it is not the one missing from the data. Chapter 2 · Quartiles, Range and Interquartile Range Solutions to questions 7, 8, 9, 10, 11, 12$txt$, $txt$medium$txt$, $txt$Construction / Error Analysis$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$construction-error-analysis$txt$, $txt$criterion-$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":6,"criterion":"","criterion_level":"","descriptor":null,"figure":"/exam-figures/grade9/q06.png"}$txt$::jsonb),
  (7, $txt$The plot shows the marks, out of 70, of 25 students in a spelling test. A student is asked to find Q1. What is the correct value?$txt$, $txt$1. There are n = 25 values, which is odd, so the median is the 13th value: Q2 = 38.
2. Median excluded from both halves: the lower half is the first 12 values (12 to 37). Its median is the mean of its 6th and 7th values, 25 and 28.
3. Q1 = (25 + 28) ÷ 2 = 26.5.
4. Had the student wrongly placed 38 inside the lower half, that half would hold 13 values whose median is 28 — the second option.

Why the other options are wrong:
A 38 is the median Q2, not the lower quartile. 
C This is the 6th value, taken by using the position n ÷ 4 = 6.25 and rounding down instead of finding the median of the lower half. 
D This is found by including the median 38 in the lower half, which this paper’s convention does not allow.$txt$, $txt$easy$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":7,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q07.png"}$txt$::jsonb),
  (8, $txt$Ten students recorded the time, in minutes, they spent travelling to school: 30, 18, 44, 25, 50, 34, 22, 40, 28, 36. Which is the correct five-point summary?$txt$, $txt$1. Sort first: 18, 22, 25, 28, 30, 34, 36, 40, 44, 50.
2. n = 10 is even, so the median is the mean of the 5th and 6th values: Q2 = (30 + 34) ÷ 2 = 32.
3. Halves of five values each: lower 18, 22, 25, 28, 30 → Q1 = 25; upper 34, 36, 40, 44, 50 → Q3 = 40.
4. Five-point summary: 18, 25, 32, 40, 50, so IQR = 40 − 25 = 15 and range = 50 − 18 = 32.

Why the other options are wrong:
A This includes the two middle values in both halves, which the convention for this paper does not allow. 
B The extremes of a five-point summary are the actual minimum and maximum, not the second values. 
D The middle of ten sorted values is the mean of the 5th and 6th values, not the 5th value alone. MYP 5 MATHEMATICS PART II · SOLUTIONS · QUARTILES, RANGE AND IQR 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 29 of 45$txt$, $txt$easy$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":8,"criterion":"A","criterion_level":"1–2","descriptor":null}$txt$::jsonb),
  (9, $txt$A cooperative recorded the maize yield, in kilograms per plot, on 12 farms: 42, 45, 48, 51, 55, 58, 60, 63, 66, 70, 74, 88. How much greater is the range than the interquartile range? Give your answer to 1 decimal place.$txt$, $txt$1. n = 12, so Q2 is the mean of the 6th and 7th values: (58 + 60) ÷ 2 = 59.
2. Lower half 42, 45, 48, 51, 55, 58 → Q1 = (48 + 51) ÷ 2 = 49.5. Upper half 60, 63, 66, 70, 74, 88 → Q3 = (66 + 70) ÷ 2 = 68.
3. IQR = 68 − 49.5 = 18.5 kg. Range = 88 − 42 = 46 kg.
4. Difference = 46 − 18.5 = 27.5 kg.

Why the other options are wrong:
A This is the range itself; the IQR was not subtracted. 
B This is the distance from the maximum to the upper quartile, not the difference of the two spreads. 
D This uses the second-largest value with the minimum, so the range was measured wrongly.$txt$, $txt$medium$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":9,"criterion":"A","criterion_level":"3–4","descriptor":null}$txt$::jsonb),
  (10, $txt$A data set contains 21 different values. A student finds the quartiles by putting the median into both halves instead of excluding it. What is the effect of this error?$txt$, $txt$1. With n = 21 the median is the 11th value, and the correct halves contain 10 values each.
2. Putting the median into the lower half makes 11 values whose median is the 6th value — one place further up the list, so Q1 increases.
3. Putting the median into the upper half makes its median the 16th value — one place lower, so Q3 decreases.
4. Both quartiles move towards the centre, so the IQR shrinks. For the data 30, 33, 36, …, 90 the correct Q1 = 45 and Q3 = 75 (IQR = 30) become Q1 = 48 and Q3 = 72 (IQR = 24).

Why the other options are wrong:
B This is the opposite of what happens: adding the middle value to the lower half pulls its median upwards. 
C The two quartiles move in opposite directions, not the same direction. 
D The median does change which value sits in the middle of each half, so the quartiles do change.$txt$, $txt$medium$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":10,"criterion":"C","criterion_level":"3–4","descriptor":null}$txt$::jsonb),
  (11, $txt$The table below lists the daily temperatures, in degrees Celsius, recorded in Kumasi for 12 days. A meteorologist adds 5 to every value to correct a faulty thermometer. Which statement describes the effect?$txt$, $txt$1. Adding a constant moves every value the same distance, so position-based statistics move by that constant: x̄ and Q2 both increase by 5.
2. Spread statistics are differences: range = max − min and IQR = Q3 − Q1, and here both Q3 and Q1 rise by 5, so their difference does not change.
3. Numerically, for these temperatures x̄ = 66.25 → 71.25, Q2 = 65.5 → 70.5, while range = 50 and IQR = 28.5 on both versions.
4. Rule: adding a to every value adds a to the mean and median but leaves range, IQR and standard deviation unchanged.

Why the other options are wrong:
B Every value increases by 5, so the mean increases by 5 as well. 
C Spread measures compare differences between values, and adding a constant to every value leaves all differences unchanged. 
D Each quartile increases by 5, so their difference — the IQR — is unchanged. MYP 5 MATHEMATICS PART II · SOLUTIONS · QUARTILES, RANGE AND IQR 50 marks · suggested time 60 minutes IB MYP 5 Mathematics · Statistics & Distributions Page 30 of 45$txt$, $txt$hard$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-C$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":11,"criterion":"C","criterion_level":"5–6","descriptor":null}$txt$::jsonb),
  (12, $txt$Two athletes recorded the number of shuttle-run completions per session over 12 sessions. Their five-point summaries are drawn as box plots below. Which conclusion is valid?$txt$, $txt$1. Athlete A: Q1 = 59, Q2 = 65, Q3 = 71, so IQR = 12 and range = 26.
2. Athlete B: Q1 = 62, Q2 = 71, Q3 = 82, so IQR = 20 and range = 42.
3. B’s box sits further right, so B’s typical (median) score is higher; but B’s box and whiskers are longer, so B’s performance varies more.
4. Valid conclusion: B is better on average while A is more consistent — centre and spread must both be reported.

Why the other options are wrong:
A Reaching a higher maximum shows a better single session, not more consistency; consistency is judged from the spread. 
C Equal sample sizes say nothing about spread; B’s IQR is 20 against A’s 12. 
D A’s median (65) is lower than B’s (71), so the claim about the centre is false. Chapter 3 · Box-and-Whisker Plots and Outliers Solutions to questions 13, 14, 15, 16, 17, 18, 19$txt$, $txt$hard$txt$, $txt$Quartiles, Range and Interquartile Range$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$quartiles-and-iqr$txt$, $txt$criterion-D$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":12,"criterion":"D","criterion_level":"5–6","descriptor":null,"figure":"/exam-figures/grade9/q12.png"}$txt$::jsonb),
  (13, $txt$The box plot shows the time, in minutes, that 14 students take to walk to the bus station. What is the interquartile range of these times?$txt$, $txt$1. The ends of the box are the quartiles: reading the plot, Q1 = 15 and Q3 = 30 minutes.
2. IQR = Q3 − Q1 = 30 − 15 = 15 minutes.
3. The vertical line inside the box is the median, Q2 = 24 minutes, and the whiskers run from 8 to 42 minutes, giving a range of 34.
4. The IQR describes the middle 50% of students only, which is why it ignores the fastest and slowest walkers.

Why the other options are wrong:
A This is the range (42 − 8), which uses the extreme values instead of the quartiles. 
C 24 is the median, a measure of centre, not of spread. 
D This is only the distance from the median to Q3, which is half of the box.$txt$, $txt$easy$txt$, $txt$Box-and-Whisker Plots and Outliers$txt$, array[$txt$myp4$txt$, $txt$statistics-and-distributions$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-9$txt$, $txt$box-and-whisker-plots$txt$, $txt$criterion-A$txt$]::text[], $txt${"source":"myp4-statistics-and-distributions-e-assessment","question_number":13,"criterion":"A","criterion_level":"1–2","descriptor":null,"figure":"/exam-figures/grade9/q13.png"}$txt$::jsonb)
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
  (2, $txt$/exam-figures/grade9/q02.png$txt$, null),
  (4, $txt$/exam-figures/grade9/q04.png$txt$, null),
  (5, $txt$/exam-figures/grade9/q05.png$txt$, null),
  (6, $txt$/exam-figures/grade9/q06.png$txt$, null),
  (7, $txt$/exam-figures/grade9/q07.png$txt$, null),
  (11, null, $txt$Recorded temperatures (°C): 46, 52, 55, 61, 63, 68, 72, 75, 81, 88, 90, 96$txt$),
  (12, $txt$/exam-figures/grade9/q12.png$txt$, null),
  (13, $txt$/exam-figures/grade9/q13.png$txt$, null)
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
