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

-- This step writes questions 1–25. Idempotent: a question whose source marker and number already
-- exist is skipped, so re-running is a no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (1, $txt$There are 6 red counters and 9 blue counters. State the ratio of red to blue in simplest form.$txt$, $txt$1. Write red first: 6 : 9.
2. Divide both parts by 3 to get 2 : 3.

Why the other options are wrong:
B. It does not simplify the ratio.
C. It compares red with the whole group instead of blue.
D. It reverses red and blue.$txt$, $txt$easy$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 1, "chapter": "Ratio", "criterion": "A", "criterion_level": 1, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (2, $txt$The bar shows a juice mix. Find the ratio of water to the whole mix in simplest form.$txt$, $txt$1. There are 2 water blocks and 5 blocks in the whole mix.
2. Write water first, then the whole: 2 : 5.

Why the other options are wrong:
A. It compares mango with the whole mix instead of water.
C. It compares water with mango rather than with the whole mix.
D. It gives an equivalent part-to-whole ratio but does not simplify it.$txt$, $txt$easy$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 2, "chapter": "Ratio", "criterion": "C", "criterion_level": 2, "criterion_objective": "Communicating", "figure": "/exam-figures/grade7/q02.png"}$txt$::jsonb),
  (3, $txt$A paint mix uses blue : white = 2 : 3. Which amounts keep the same shade?$txt$, $txt$1. The original parts are 2 : 3.
2. Multiply both amounts by 4: blue is 2 × 4 = 8 and white is 3 × 4 = 12; the ratio still simplifies to 2 : 3.

Why the other options are wrong:
A. It scales blue but leaves white unchanged.
B. It reverses the order of blue and white.
C. It adds the same amount instead of multiplying both parts.$txt$, $txt$easy$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 3, "chapter": "Ratio", "criterion": "A", "criterion_level": 2, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (4, $txt$The blue-to-yellow ratio stays the same in each badge order. Find the missing table entry.$txt$, $txt$1. From Order 1 to Order 3, the number of blue badges goes from 3 to 12, so multiply by 4.
2. Multiply yellow in the same way: 5 × 4 = 20.

Why the other options are wrong:
B. It forgets to double the previous yellow count.
C. It adds the old difference of 2 to 12 instead of scaling.
D. It copies the blue count into the yellow row.$txt$, $txt$medium$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 4, "chapter": "Ratio", "criterion": "B", "criterion_level": 3, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q04.png"}$txt$::jsonb),
  (5, $txt$A coach shares 48 training cones in the ratio red : yellow = 5 : 3. How many cones are red?$txt$, $txt$1. Add the parts: 5 + 3 = 8; one part is 48 ÷ 8 = 6 cones.
2. Red gets 5 parts: 5 × 6 = 30 cones.

Why the other options are wrong:
B. It gives the yellow share rather than the red share.
C. It finds one part but forgets to multiply by the red parts.
D. It divides the cones equally instead of using the ratio.$txt$, $txt$medium$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 5, "chapter": "Ratio", "criterion": "A", "criterion_level": 3, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (6, $txt$The bar shows how 72 seedlings are shared among three gardens. How many go to Garden C?$txt$, $txt$1. Count 2 + 3 + 4 = 9 blocks in all.
2. Each block is 72 ÷ 9 = 8 seedlings; Garden C gets 4 × 8 = 32.

Why the other options are wrong:
A. It stops after finding the value of one block.
B. It gives Garden B’s share rather than Garden C’s.
C. It leaves Garden B’s blocks out when finding the whole.$txt$, $txt$medium$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 6, "chapter": "Ratio", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q06.png"}$txt$::jsonb),
  (7, $txt$A 150 mL dye batch has red : yellow = 2 : 3. A student says red is 2/3 of the whole batch. Which correction is right?$txt$, $txt$1. The whole batch has 2 + 3 = 5 parts, so red is 2/5 of it.
2. One part is 150 ÷ 5 = 30 mL; red is 2 × 30 = 60 mL.

Why the other options are wrong:
A. It mistakes the red-to-yellow comparison for a fraction of the whole.
C. It finds yellow’s share instead of red’s.
D. It has the right fraction but divides by only the yellow parts.$txt$, $txt$medium$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 7, "chapter": "Ratio", "criterion": "C", "criterion_level": 4, "criterion_objective": "Communicating"}$txt$::jsonb),
  (8, $txt$Team P has 12 boys and 18 girls. Team Q has 16 boys and 20 girls. Which has the larger boys-to-girls ratio?$txt$, $txt$1. Simplify boys : girls: P is 2 : 3 and Q is 4 : 5.
2. Compare without rounding: 2 × 5 = 10, while 4 × 3 = 12; Team Q has the larger ratio.

Why the other options are wrong:
A. It assumes ratios can only be compared for equal-sized teams.
B. It treats two different ratios as equal because both have more girls.
D. It compares team sizes, not boys-to-girls ratios.$txt$, $txt$hard$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 8, "chapter": "Ratio", "criterion": "C", "criterion_level": 5, "criterion_objective": "Communicating"}$txt$::jsonb),
  (9, $txt$A farmer packs cassava, maize and yam in the ratio 2 : 3 : 7. There are 28 more yam baskets than maize baskets. How many baskets are there altogether?$txt$, $txt$1. Yam exceeds maize by 7 − 3 = 4 parts; one part is 28 ÷ 4 = 7 baskets.
2. The whole ratio has 12 parts, so the total is 12 × 7 = 84 baskets.

Why the other options are wrong:
A. It finds only the yam baskets, not all the baskets.
B. It treats the difference between two shares as the total.
C. It uses the whole 28-basket difference as one part.$txt$, $txt$hard$txt$, $txt$Ratio$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$ratio$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 9, "chapter": "Ratio", "criterion": "B", "criterion_level": 6, "criterion_objective": "Investigating patterns"}$txt$::jsonb),
  (10, $txt$A school bus covers 90 km in 2 h. Find its average speed.$txt$, $txt$1. Average speed is distance ÷ time.
2. 90 km ÷ 2 h = 45 km/h.

Why the other options are wrong:
A. It forgets the “per hour” unit.
B. It multiplies distance by time instead of dividing.
D. It adds distance and time, which have different units.$txt$, $txt$easy$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 10, "chapter": "Rate", "criterion": "A", "criterion_level": 1, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (11, $txt$The table shows mango prices at one market stall. What is the price per kilogram?$txt$, $txt$1. Use either column: 800 FCFA ÷ 2 kg = 400 FCFA per kg.
2. The other column checks it: 2,000 ÷ 5 = 400 FCFA per kg.

Why the other options are wrong:
A. It multiplies price by mass instead of dividing.
B. It uses the full 5 kg price as the 1 kg price.
C. It uses the full 2 kg price as the 1 kg price.$txt$, $txt$easy$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 11, "chapter": "Rate", "criterion": "D", "criterion_level": 2, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q11.png"}$txt$::jsonb),
  (12, $txt$A tap pours 18 L in 3 min. How long will it take to fill a 30 L container at the same rate?$txt$, $txt$1. First find the rate: 18 L ÷ 3 min = 6 L/min.
2. Then 30 L ÷ 6 L/min = 5 min.

Why the other options are wrong:
A. It assumes the tap pours only 1 L each minute.
B. It divides by the original time instead of by the flow rate.
D. It reports the litres per minute as the number of minutes.$txt$, $txt$medium$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 12, "chapter": "Rate", "criterion": "D", "criterion_level": 3, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (13, $txt$A cyclist rides 15 km in 30 minutes. What is the average speed in km/h?$txt$, $txt$1. Convert time first: 30 minutes = 0.5 hour.
2. Speed = 15 km ÷ 0.5 hour = 30 km/h.

Why the other options are wrong:
B. It adds a distance and a time instead of making a rate.
C. It divides by minutes and labels the result as km/h.
D. It treats 30 minutes as one whole hour.$txt$, $txt$medium$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 13, "chapter": "Rate", "criterion": "A", "criterion_level": 3, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (14, $txt$The table shows water flowing from a community tap. How many litres flow in 6 min at the same rate?$txt$, $txt$1. The table gives 7 L in 1 min, or 7 L/min.
2. In 6 min the tap gives 6 × 7 = 42 L.

Why the other options are wrong:
A. It multiplies a four-minute volume by six.
C. It adds the number of minutes to the last volume.
D. It gives the flow for one minute, not six minutes.$txt$, $txt$medium$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 14, "chapter": "Rate", "criterion": "B", "criterion_level": 4, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q14.png"}$txt$::jsonb),
  (15, $txt$At a market, a 2 kg rice bag costs 1,300 FCFA and a 3 kg bag costs 1,800 FCFA. Which is the better buy per kg, and by how much?$txt$, $txt$1. The 2 kg bag costs 1,300 ÷ 2 = 650 FCFA per kg.
2. The 3 kg bag costs 1,800 ÷ 3 = 600 FCFA per kg; it is 50 FCFA per kg less.

Why the other options are wrong:
A. It compares whole-bag prices instead of prices per kg.
C. It mistakes the difference between bag prices for a per-kg difference.
D. It assumes both bags have the same unit price.$txt$, $txt$medium$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 15, "chapter": "Rate", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (16, $txt$A runner covers 600 m in 2 min. Express the average speed in km/h.$txt$, $txt$1. 600 m ÷ 2 min = 300 m/min.
2. In one hour that is 300 × 60 = 18,000 m/h = 18 km/h.

Why the other options are wrong:
A. It labels metres per minute as kilometres per hour.
B. It converts metres to kilometres but not minutes to hours.
D. It halves the rate a second time after using the two-minute time.$txt$, $txt$hard$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 16, "chapter": "Rate", "criterion": "A", "criterion_level": 5, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (17, $txt$A bus travels 24 km in 40 min. A zémidjan (motorcycle taxi) travels 18 km in 30 min. Which comparison of their average speeds is correct?$txt$, $txt$1. Bus: 24 km ÷ 40 min = 0.6 km/min; multiply by 60 to get 36 km/h.
2. Zémidjan: 18 km ÷ 30 min = 0.6 km/min; multiply by 60 to get 36 km/h. They match.

Why the other options are wrong:
A. It compares distances while ignoring the different times.
C. It reports kilometres per minute as kilometres per hour.
D. It compares times while ignoring the different distances.$txt$, $txt$hard$txt$, $txt$Rate$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$rate$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 17, "chapter": "Rate", "criterion": "C", "criterion_level": 6, "criterion_objective": "Communicating"}$txt$::jsonb),
  (18, $txt$One notebook costs 200 FCFA. At this fixed price, what do 3 notebooks cost?$txt$, $txt$1. The cost of each notebook is 200 FCFA.
2. Multiply by 3: 200 × 3 = 600 FCFA.

Why the other options are wrong:
A. It pays for one notebook too few.
B. It adds the number of notebooks to the price instead of multiplying.
C. It gives the price of only one notebook.$txt$, $txt$easy$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 18, "chapter": "Proportion", "criterion": "A", "criterion_level": 1, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (19, $txt$Each bag has the same mass. Complete the table.$txt$, $txt$1. One bag is 5 kg; two bags are 10 kg.
2. Four bags are twice two bags, so 10 × 2 = 20 kg.

Why the other options are wrong:
B. It adds just one bag to the two-bag mass instead of doubling it.
C. It copies the number of bags as their mass.
D. It multiplies the two-bag mass by four instead of by two.$txt$, $txt$easy$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 19, "chapter": "Proportion", "criterion": "B", "criterion_level": 2, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q19.png"}$txt$::jsonb),
  (20, $txt$A toy car drawing uses the scale 1 : 100. A length of 4 cm on the drawing represents how many metres on the real car?$txt$, $txt$1. At 1 : 100, 4 cm on the drawing represents 4 × 100 = 400 cm.
2. Convert to metres: 400 cm ÷ 100 = 4 m.

Why the other options are wrong:
A. It makes a tenfold error while converting centimetres to metres.
B. It converts the drawing length to metres but forgets the scale.
D. It multiplies in centimetres and then labels the result as metres.$txt$, $txt$easy$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 20, "chapter": "Proportion", "criterion": "A", "criterion_level": 2, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (21, $txt$Fuel use stays steady. Read the double number line. How many litres of fuel are needed for the marked trip?$txt$, $txt$1. The line pairs 30 km with 3 L, so one litre covers 10 km.
2. 70 km needs 70 ÷ 10 = 7 L.

Why the other options are wrong:
B. It finds fuel for only the extra distance and forgets the first 30 km.
C. It copies the distance as though it were a fuel amount.
D. It adds the first 3 L to a total that already includes it.$txt$, $txt$medium$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 21, "chapter": "Proportion", "criterion": "B", "criterion_level": 3, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q21.png"}$txt$::jsonb),
  (22, $txt$The map shows the distance between two places. What is their real distance in kilometres?$txt$, $txt$1. The map scale is 1 : 25,000; 8 cm × 25,000 = 200,000 cm in reality.
2. Convert centimetres to kilometres: 200,000 ÷ 100,000 = 2 km.

Why the other options are wrong:
A. It makes a tenfold error converting centimetres to kilometres.
B. It divides scaled centimetres by 1,000 instead of 100,000.
D. It divides by ten one time too many during the conversion.$txt$, $txt$medium$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 22, "chapter": "Proportion", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q22.png"}$txt$::jsonb),
  (23, $txt$A student claims the cost in the table is directly proportional to the number of notebooks. Which response is correct?$txt$, $txt$1. The first two columns each cost 350 FCFA per notebook.
2. At that rate, 6 notebooks should cost 6 × 350 = 2,100 FCFA, not 2,000 FCFA; the rate is not constant.

Why the other options are wrong:
B. It checks two entries but ignores the last entry.
C. It confuses a constant total price with a constant price per notebook.
D. It confuses increasing values with a constant unit price.$txt$, $txt$hard$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 23, "chapter": "Proportion", "criterion": "B", "criterion_level": 5, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q23.png"}$txt$::jsonb),
  (24, $txt$The scale drawing shows a rectangular garden. What is its real perimeter in metres?$txt$, $txt$1. At 1 : 200, the real sides are 6 × 200 cm = 12 m and 4 × 200 cm = 8 m.
2. Perimeter = 2 × (12 + 8) = 40 m.

Why the other options are wrong:
A. It calculates the garden area instead of its perimeter.
C. It adds one length and one width but forgets the other two sides.
D. It labels a centimetre result as metres without converting.$txt$, $txt$hard$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 24, "chapter": "Proportion", "criterion": "D", "criterion_level": 5, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q24.png"}$txt$::jsonb),
  (25, $txt$3 identical bags of grain weigh 7.5 kg in all. A school needs 20 kg. How many bags of this size are needed?$txt$, $txt$1. One bag weighs 7.5 ÷ 3 = 2.5 kg.
2. For 20 kg, 20 ÷ 2.5 = 8 whole bags.

Why the other options are wrong:
A. It multiplies by kilograms per bag instead of dividing.
C. It doubles the first order, which provides only 15 kg.
D. It rounds the mass of a bag down to 2 kg.$txt$, $txt$hard$txt$, $txt$Proportion$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportion$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 25, "chapter": "Proportion", "criterion": "D", "criterion_level": 6, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb)
  ) as s(n, prompt, explanation, difficulty, topic, tags, config)
 where not exists (
   select 1 from public.questions existing
    where existing.organization_id = '0a400000-0000-4000-8000-000000000001'
      and existing.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment'
      and (existing.config ->> 'question_number')::int = s.n
 );
