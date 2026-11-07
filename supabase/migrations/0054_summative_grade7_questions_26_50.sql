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

-- This step writes questions 26–50. Idempotent: a question whose source marker and number already
-- exist is skipped, so re-running is a no-op.

insert into public.questions
  (organization_id, type, prompt, explanation, points, difficulty, topic, tags,
   status, review_status, config)
select '0a400000-0000-4000-8000-000000000001', 'single_choice', s.prompt, s.explanation, 1,
       s.difficulty, s.topic, s.tags, 'published', 'approved', s.config
  from (values
  (26, $txt$A recipe uses 2 eggs for 8 pancakes. How many eggs are needed for 16 pancakes?$txt$, $txt$1. The pancake count changes by a factor of 2: 8 × 2 = 16.
2. Use the same factor for eggs: 2 × 2 = 4 eggs.

Why the other options are wrong:
A. It adds the increase in pancakes to the eggs instead of scaling.
B. It forgets to scale the number of eggs.
D. It divides the new pancake count by the old egg count.$txt$, $txt$easy$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 26, "chapter": "Proportional Reasoning", "criterion": "A", "criterion_level": 1, "criterion_objective": "Knowing and understanding"}$txt$::jsonb),
  (27, $txt$A family prepares the same amount of rice per serving. Complete the recipe table.$txt$, $txt$1. Two servings use 300 g, so each serving uses 150 g.
2. Six servings use 6 × 150 = 900 g.

Why the other options are wrong:
A. It doubles the four-serving amount instead of multiplying by one and a half.
B. It uses the four-serving amount for six servings.
C. It applies the six-to-four factor to the two-serving amount.$txt$, $txt$easy$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 27, "chapter": "Proportional Reasoning", "criterion": "B", "criterion_level": 2, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q27.png"}$txt$::jsonb),
  (28, $txt$A phone shop sells 4 GB (gigabytes) of data for 2,000 FCFA or 6 GB for 3,000 FCFA. Which statement correctly compares value per GB?$txt$, $txt$1. 2,000 ÷ 4 = 500 FCFA per GB for the first pack.
2. 3,000 ÷ 6 = 500 FCFA per GB for the second; neither has a lower unit price.

Why the other options are wrong:
A. It divides the price by the wrong number of gigabytes.
B. It compares amounts of data without comparing unit prices.
C. It compares pack prices without comparing one gigabyte.$txt$, $txt$medium$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 28, "chapter": "Proportional Reasoning", "criterion": "C", "criterion_level": 3, "criterion_objective": "Communicating"}$txt$::jsonb),
  (29, $txt$Use the double number line. At the same water rate, how many young trees can be watered with the marked amount?$txt$, $txt$1. The water amount changes from 3 L to 9 L, a factor of 3.
2. The trees change by the same factor: 5 × 3 = 15 trees.

Why the other options are wrong:
A. It copies the water number as the tree number.
B. It multiplies litres by the old litre count, not by trees per litre.
D. It adds the increase in litres to the tree count instead of using a scale factor.$txt$, $txt$medium$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 29, "chapter": "Proportional Reasoning", "criterion": "B", "criterion_level": 3, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q29.png"}$txt$::jsonb),
  (30, $txt$A class has 32 students. 25% join the art club. How many students join?$txt$, $txt$1. 25% means one quarter of the whole class.
2. 32 ÷ 4 = 8 students join.

Why the other options are wrong:
A. It uses 50%, not 25%, of the class.
C. It counts the students who do not join.
D. It reads 25% as a count of 25 students.$txt$, $txt$medium$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 30, "chapter": "Proportional Reasoning", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (31, $txt$A phone top-up (prepaid credit) of 2,000 FCFA gives 10% extra credit. How much credit does the customer receive in total?$txt$, $txt$1. The bonus is 10% of 2,000 FCFA: 2,000 ÷ 10 = 200 FCFA.
2. Add it to the starting credit: 2,000 + 200 = 2,200 FCFA.

Why the other options are wrong:
B. It subtracts the bonus as though it were a discount.
C. It gives only the bonus and leaves out the original credit.
D. It adds 10 FCFA instead of 10% of the top-up.$txt$, $txt$medium$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 31, "chapter": "Proportional Reasoning", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (32, $txt$A shop charges 200 FCFA per kg of fruit plus a fixed 500 FCFA delivery fee. Which statement correctly explains whether total cost is directly proportional to mass?$txt$, $txt$1. One kilogram costs 500 + 200 = 700 FCFA; two kilograms cost 500 + 400 = 900 FCFA.
2. Twice 700 would be 1,400 FCFA, not 900; the added fee prevents direct proportion.

Why the other options are wrong:
B. It confuses a constant rate with a constant total.
C. It mistakes a fixed added fee for a constant price per kilogram.
D. It assumes that every increasing relationship is proportional.$txt$, $txt$hard$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 32, "chapter": "Proportional Reasoning", "criterion": "C", "criterion_level": 5, "criterion_objective": "Communicating"}$txt$::jsonb),
  (33, $txt$A recipe was increased by 50% and now uses 9 cups of rice and 6 cups of beans. What were the original amounts?$txt$, $txt$1. A 50% increase multiplies each original amount by 1.5.
2. Reverse the factor: 9 ÷ 1.5 = 6 cups rice and 6 ÷ 1.5 = 4 cups beans.

Why the other options are wrong:
A. It subtracts half a cup instead of dividing by one and a half.
B. It ignores the increase and repeats the new amounts.
D. It halves the new amounts instead of reversing a 50% increase.$txt$, $txt$hard$txt$, $txt$Proportional Reasoning$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$proportional-reasoning$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 33, "chapter": "Proportional Reasoning", "criterion": "B", "criterion_level": 6, "criterion_objective": "Investigating patterns"}$txt$::jsonb),
  (34, $txt$A stall puts 20 mangoes into bags of 5. Each bag sells for 500 FCFA. How much money comes in if all the bags sell?$txt$, $txt$1. First make 20 ÷ 5 = 4 bags.
2. Then sell 4 bags × 500 FCFA = 2,000 FCFA.

Why the other options are wrong:
A. It counts the money from only one bag.
B. It treats mangoes per bag as the number of bags.
C. It charges the bag price for each individual mango.$txt$, $txt$easy$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 34, "chapter": "Word Problems", "criterion": "D", "criterion_level": 2, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (35, $txt$A cyclist rides at 12 km/h for 2 h, then walks 3 km. What is the total distance travelled?$txt$, $txt$1. Cycling distance = 12 km/h × 2 h = 24 km.
2. Add the walk: 24 + 3 = 27 km.

Why the other options are wrong:
A. It adds a speed to a distance without accounting for time.
B. It multiplies the walking distance by the cycling time too.
D. It leaves out the distance walked.$txt$, $txt$easy$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 35, "chapter": "Word Problems", "criterion": "D", "criterion_level": 2, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (36, $txt$A shopper buys 3 kg from the stall and pays 2,000 FCFA. How much change should the shopper get?$txt$, $txt$1. The board gives 400 FCFA per kg, so 3 kg costs 3 × 400 = 1,200 FCFA.
2. Change = 2,000 − 1,200 = 800 FCFA.

Why the other options are wrong:
A. It gives the cost of the maize rather than the change.
C. It subtracts the price of only 1 kg.
D. It charges for one extra kilogram.$txt$, $txt$medium$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 36, "chapter": "Word Problems", "criterion": "D", "criterion_level": 3, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q36.png"}$txt$::jsonb),
  (37, $txt$A juice mix uses syrup : water = 1 : 4. It fills 4 bottles of 250 mL each. How much syrup is needed?$txt$, $txt$1. The bottles hold 4 × 250 = 1,000 mL of mixture.
2. There are 5 parts; one part is 1,000 ÷ 5 = 200 mL, so syrup needs 200 mL.

Why the other options are wrong:
A. It uses the whole drink rather than the syrup part.
C. It assumes that one full bottle contains only syrup.
D. It finds the water share instead of the syrup share.$txt$, $txt$medium$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 37, "chapter": "Word Problems", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (38, $txt$A school pays 1,800 FCFA for 3 kg of rice. It needs 5 kg for lunch but already has 1 kg. At the same price, how much more must it spend?$txt$, $txt$1. One kilogram costs 1,800 ÷ 3 = 600 FCFA per kg.
2. Buy 5 − 1 = 4 kg; spend 4 × 600 = 2,400 FCFA.

Why the other options are wrong:
A. It stops after finding the price for 1 kg.
B. It pays for the original 3 kg instead of the 4 kg still needed.
D. It buys all the rice and ignores the 1 kg already in stock.$txt$, $txt$medium$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 38, "chapter": "Word Problems", "criterion": "D", "criterion_level": 4, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (39, $txt$A minibus travels 60 km at 30 km/h and stops for 15 min on the way. It leaves at 08:00. When does it arrive?$txt$, $txt$1. Driving time is 60 km ÷ 30 km/h = 2 h.
2. 08:00 + 2 h + 15 min = 10:15.

Why the other options are wrong:
B. It allows only one hour to drive 60 km at 30 km/h.
C. It leaves out the stop.
D. It counts the stop twice.$txt$, $txt$hard$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 39, "chapter": "Word Problems", "criterion": "D", "criterion_level": 5, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (40, $txt$A tournament has 40 players, with juniors : seniors = 3 : 2. Each junior receives 2 water bottles. Bottles come in packs of 6. How many full packs are needed for the juniors?$txt$, $txt$1. One ratio part is 40 ÷ 5 = 8; juniors = 3 × 8 = 24.
2. They need 24 × 2 = 48 bottles; 48 ÷ 6 = 8 full packs.

Why the other options are wrong:
A. It gives one bottle, not two, to each junior.
B. It uses the number of seniors in place of juniors.
C. It gives two bottles to every player, including the seniors.$txt$, $txt$hard$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 40, "chapter": "Word Problems", "criterion": "D", "criterion_level": 5, "criterion_objective": "Applying mathematics in real-life contexts"}$txt$::jsonb),
  (41, $txt$7 identical planters need 4 kg of mix each. Use the mix ratio and the shop sign. What is the least you can spend on whole compost bags?$txt$, $txt$1. All planters need 7 × 4 = 28 kg of mix. Compost is 2 of 7 parts, so compost needed = 28 ÷ 7 × 2 = 8
2. Two bags have only 6 kg; buy 3 whole bags for 3 × 900 = 2,700 FCFA.

Why the other options are wrong:
B. It buys two bags, which hold too little compost.
C. It buys one bag for each planter, more than is needed.
D. It pays for exactly 8 kg and ignores the whole-bag rule.$txt$, $txt$hard$txt$, $txt$Word Problems$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$word-problems$txt$, $txt$criterion-D$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 41, "chapter": "Word Problems", "criterion": "D", "criterion_level": 6, "criterion_objective": "Applying mathematics in real-life contexts", "figure": "/exam-figures/grade7/q41.png"}$txt$::jsonb),
  (42, $txt$In the diagram, A is the set of even numbers and B is the set of numbers greater than 3. Which statement is true?$txt$, $txt$1. The right-only region holds 5, so 5 belongs to B.
2. The overlap holds 4 and 6, which belong to both sets; therefore 5 ∈ B is the true statement.

Why the other options are wrong:
A. It treats a number outside both circles as in B.
B. It forgets that a number in the overlap also belongs to A.
C. It treats a number in B only as an element of A.$txt$, $txt$easy$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 42, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 1, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q42.png"}$txt$::jsonb),
  (43, $txt$A class surveys students about football (F) and music (M). How many choose at least one of these activities?$txt$, $txt$1. Add the three regions inside at least one circle: 9 + 6 + 8 = 23.
2. Do not include the 7 students outside both circles.

Why the other options are wrong:
B. It leaves out students in the overlap.
C. It includes students who chose neither activity.
D. It counts the overlap twice.$txt$, $txt$easy$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 43, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 2, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q43.png"}$txt$::jsonb),
  (44, $txt$List the elements of A ∩ B shown in the diagram.$txt$, $txt$1. A ∩ B means the elements in both circles at once.
2. The overlap contains {b, e}, so A ∩ B = {b, e}.

Why the other options are wrong:
A. It lists the union instead of the intersection.
C. It lists the element in neither set.
D. It lists A-only elements and misses the shared elements.$txt$, $txt$easy$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 44, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 2, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q44.png"}$txt$::jsonb),
  (45, $txt$List A′, the complement of A in ξ, using the diagram.$txt$, $txt$1. A contains {0, 2, 4, 6}. A′ is every element of ξ that is not in A.
2. Include B-only {1, 3} and outside-both {5, 7}: A′ = {1, 3, 5, 7}.

Why the other options are wrong:
A. It forgets the elements in B only.
B. It lists A itself instead of its complement.
C. It forgets the elements outside both circles.$txt$, $txt$medium$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 45, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 3, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q45.png"}$txt$::jsonb),
  (46, $txt$A group is surveyed about football (F) and basketball (B). How many play basketball only? Fill the ? region.$txt$, $txt$1. The diagram has 30 students in all; the known regions add to 11 + 8 + 5 = 24.
2. The missing B-only region is 30 − 24 = 6 students.

Why the other options are wrong:
B. It counts all football players instead of basketball-only players.
C. It takes the number who play both sports, not basketball only.
D. It forgets to remove the students in the overlap.$txt$, $txt$medium$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-B$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 46, "chapter": "Sets and Venn Diagrams", "criterion": "B", "criterion_level": 4, "criterion_objective": "Investigating patterns", "figure": "/exam-figures/grade7/q46.png"}$txt$::jsonb),
  (47, $txt$At a camp, D means drums and T means dance. How many choose exactly one activity?$txt$, $txt$1. Exactly one means either the D-only region (14) or the T-only region (9).
2. Add only those regions: 14 + 9 = 23 students.

Why the other options are wrong:
A. It counts the whole group, including those who chose both or neither.
C. It includes students who chose both activities.
D. It selects the overlap instead of the two only-regions.$txt$, $txt$medium$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 47, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 4, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q47.png"}$txt$::jsonb),
  (48, $txt$Which statement about the diagram uses set notation correctly and is true? The symbol ⊂ means “is a proper subset of”.$txt$, $txt$1. A has the elements {m, n}. The set {m} has only m, which is in A.
2. Because {m} is a smaller set inside A, {m} ⊂ A; m on its own is an element, not a set.

Why the other options are wrong:
A. It confuses the empty set with an element contained in A.
B. It uses a subset symbol for a single element instead of a set.
C. It treats an element in B only as a member of A.$txt$, $txt$hard$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 48, "chapter": "Sets and Venn Diagrams", "criterion": "C", "criterion_level": 5, "criterion_objective": "Communicating", "figure": "/exam-figures/grade7/q48.png"}$txt$::jsonb),
  (49, $txt$At school, G means gardening and F means football. Find n(G), the number of students in G.$txt$, $txt$1. n(G) means count all students inside the G circle, including the overlap.
2. G-only is 10 and both is 7, so n(G) = 10 + 7 = 17.

Why the other options are wrong:
A. It includes students who are in football only.
B. It counts everyone in the universal set, including those outside G.
D. It leaves out the students who chose both gardening and football.$txt$, $txt$hard$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-A$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 49, "chapter": "Sets and Venn Diagrams", "criterion": "A", "criterion_level": 5, "criterion_objective": "Knowing and understanding", "figure": "/exam-figures/grade7/q49.png"}$txt$::jsonb),
  (50, $txt$The three circles are music (M), art (A) and sport (S). Which expression describes every shaded region? Do not count any students.$txt$, $txt$1. The blue shading covers all of M and all of A, including their overlaps with S.
2. The word “or” means union, so the shaded region is M ∪ A.

Why the other options are wrong:
A. It includes the unshaded S-only region and misses the A-only region.
C. It includes everything outside S, even the area outside all circles.
D. It includes only the shared part of M and A.$txt$, $txt$hard$txt$, $txt$Sets and Venn Diagrams$txt$, array[$txt$myp2$txt$, $txt$ratio-rate-proportion-and-sets$txt$, $txt$e-assessment$txt$, $txt$summative-assessment$txt$, $txt$grade-7$txt$, $txt$sets-and-venn-diagrams$txt$, $txt$criterion-C$txt$]::text[], $txt${"source": "myp2-ratio-rate-proportion-and-sets-e-assessment", "question_number": 50, "chapter": "Sets and Venn Diagrams", "criterion": "C", "criterion_level": 6, "criterion_objective": "Communicating", "figure": "/exam-figures/grade7/q50.png"}$txt$::jsonb)
  ) as s(n, prompt, explanation, difficulty, topic, tags, config)
 where not exists (
   select 1 from public.questions existing
    where existing.organization_id = '0a400000-0000-4000-8000-000000000001'
      and existing.config ->> 'source' = 'myp2-ratio-rate-proportion-and-sets-e-assessment'
      and (existing.config ->> 'question_number')::int = s.n
 );
