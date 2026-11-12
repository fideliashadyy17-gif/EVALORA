# MYP2 (Grade 7) — Rate, ratio, proportion, sets & Venn, probability. 25 questions.
from assess_prep_common import P, Q

EXAM = {
    "key": "myp2", "title": "MYP 2 Mathematics — Formative Assessment: Rate, Ratio, Proportion, Sets and Probability",
    "grade": "7", "curriculum": "MYP 2", "class_id": "0a400000-0000-4000-8000-000000000107",
    "access_code": "MYP2-FORM-2026", "duration": 45,
    "description": "Grade 7 · MYP 2 · Mathematics · Formative (Assess Prep). Rate, ratio, proportion and proportional reasoning, sets and two-set Venn diagrams, simple and experimental probability. Type every answer — there are no options to choose from.",
}

H = lambda a, b: [a, b]  # two hint levels

QUESTIONS = [
Q(1, "rate", "easy", "A", "A cyclist travels 120 km in 4 hours at a steady speed. What is her speed?",
  "Speed = distance ÷ time = 120 ÷ 4 = 30 km/h.",
  single=("numeric", (30, 0), 1), hints=H("Speed compares distance with time. Which operation links them?", "Divide the distance travelled by the time taken."), nxt="Always write the unit with a rate.", subtopic="unit rate"),
Q(2, "rate", "easy", "A", "A tap fills 36 litres of water in 6 minutes. How many litres does it fill in one minute?",
  "Rate = 36 ÷ 6 = 6 litres per minute.",
  single=("numeric", (6, 0), 1), hints=H("A unit rate tells you the amount for ONE minute.", "Divide the total litres by the number of minutes."), subtopic="unit rate"),
Q(3, "rate", "medium", "D", "A car uses 21 litres of fuel to travel 315 km. How many litres does it use per 100 km? Give your answer to 2 decimal places.",
  "Litres per km = 21 ÷ 315 = 0.0666… So per 100 km: 0.0666… × 100 = 6.67 litres (2 d.p.).",
  single=("numeric", (6.67, 0.01), 2), hints=H("First find the fuel used for ONE kilometre.", "Divide 21 by 315, then scale your answer up to 100 km."), nxt="Find the rate for 1 first, then scale.", subtopic="fuel consumption"),
Q(4, "rate", "medium", "D", "Tap A fills a 240 litre tank in 8 minutes. Tap B fills the same tank in 12 minutes.",
  "Tap A: 240 ÷ 8 = 30 L/min. Tap B: 240 ÷ 12 = 20 L/min. Tap A is faster because its rate in litres per minute is greater.",
  parts=[
    P("a", "(a)", "What is the filling rate of tap A?", "numeric", 1, H("Rate = amount ÷ time for the same tank.", "Divide 240 litres by tap A's time."), answer=30, unit="L/min"),
    P("b", "(b)", "What is the filling rate of tap B?", "numeric", 1, H("Use the same tank size with tap B's time.", "Divide 240 litres by tap B's time."), answer=20, unit="L/min"),
    P("c", "(c)", "Which tap is faster? Type: Tap A or Tap B.", "text", 1, H("Compare the two rates: a greater litres-per-minute fills sooner.", "Compare your answers to (a) and (b)."), accepted=["Tap A", "A"]),
  ], subtopic="comparing rates"),
Q(5, "ratio", "easy", "A", "Write the ratio 12 : 18 in its simplest form. Type it like 2:3.",
  "Both numbers divide by 6: 12 : 18 = 2 : 3.",
  single=("text", ["2:3", "2/3", "2 : 3"], 1), hints=H("Look for a number that divides both 12 and 18.", "Divide both sides by their highest common factor."), subtopic="simplifying ratios"),
Q(6, "ratio", "medium", "A", "The tape diagram shows counters shared between red and blue in the ratio 3 : 2. There are 40 counters in total.",
  "There are 5 equal parts, so one part = 40 ÷ 5 = 8 counters. Red has 3 parts: 3 × 8 = 24 counters.",
  diagram={"kind": "tape", "title": "Red : Blue counters (40 in total)", "tapeRows": [
      {"label": "Red", "segments": [{"label": "?", "span": 1}, {"label": "?", "span": 1}, {"label": "?", "span": 1}]},
      {"label": "Blue", "segments": [{"label": "?", "span": 1}, {"label": "?", "span": 1}]}]},
  parts=[
    P("a", "(a)", "How many counters is ONE part worth?", "numeric", 1, H("Start by finding the total number of parts in the ratio.", "Add the parts 3 and 2, then share 40 counters equally between them."), answer=8),
    P("b", "(b)", "How many counters are red?", "numeric", 1, H("Red takes 3 of the equal parts.", "Multiply the value of one part by the number of red parts."), answer=24),
  ], subtopic="sharing with a tape diagram"),
Q(7, "ratio", "medium", "D", "A paint colour mixes red and yellow paint in the ratio 2 : 5. A decorator needs 35 litres of the mixture.",
  "Total parts = 2 + 5 = 7, so one part = 35 ÷ 7 = 5 litres. Red: 2 × 5 = 10 litres. Yellow: 5 × 5 = 25 litres.",
  parts=[
    P("a", "(a)", "How many litres of red paint are needed?", "numeric", 1, H("Start by finding the total number of parts in the ratio.", "Share 35 litres into 7 equal parts, then take the red share."), answer=10, unit="litres"),
    P("b", "(b)", "How many litres of yellow paint are needed?", "numeric", 1, H("Yellow takes 5 of the equal parts.", "Multiply the value of one part by 5 — or subtract red from 35."), answer=25, unit="litres"),
  ], subtopic="sharing in a ratio"),
Q(8, "ratio", "medium", "D", "$84 is shared between Amara and Bola in the ratio 3 : 4.",
  "Total parts = 7, so one part = 84 ÷ 7 = $12. Amara: 3 × 12 = $36. Bola: 4 × 12 = $48. Check: 36 + 48 = 84.",
  parts=[
    P("a", "(a)", "How much does Amara receive?", "numeric", 1, H("Start by finding the total number of parts in the ratio.", "Share $84 into 7 equal parts, then take Amara's 3 parts."), answer=36, unit="$"),
    P("b", "(b)", "How much does Bola receive?", "numeric", 1, H("Bola takes 4 of the equal parts.", "Multiply the value of one part by 4 — or subtract Amara's share from $84."), answer=48, unit="$"),
  ], subtopic="sharing money"),
Q(9, "ratio", "hard", "B", "Two ratios are linked: a : b = 2 : 3 and b : c = 4 : 5.",
  "Make b the same in both ratios: multiply a : b by 4 → 8 : 12, and b : c by 3 → 12 : 15. So a : b : c = 8 : 12 : 15 (35 parts). For a total of 70, one part = 2, so c = 15 × 2 = 30.",
  parts=[
    P("a", "(a)", "Write the combined ratio a : b : c in its simplest form. Type it like 8:12:15.", "text", 1, H("The shared letter b must be worth the same in both ratios.", "Scale each ratio so that b becomes the lowest common multiple of 3 and 4."), accepted=["8:12:15", "8 : 12 : 15"]),
    P("b", "(b)", "The three quantities total 70. What is the value of c?", "numeric", 1, H("Add the parts of your combined ratio to share 70.", "Find one part from the total, then take c's parts."), answer=30),
  ], subtopic="combining ratios"),
Q(10, "proportion", "easy", "A", "The double number line shows that 3 pens cost $6.",
  "One pen costs 6 ÷ 3 = $2. Seven pens cost 7 × 2 = $14.",
  diagram={"kind": "double_number_line", "title": "Cost of pens", "lines": [
      {"label": "Pens", "unit": "pens", "max": 7, "ticks": [{"at": 0, "label": "0"}, {"at": 3, "label": "3"}, {"at": 7, "label": "7"}]},
      {"label": "Cost", "unit": "$", "max": 14, "ticks": [{"at": 0, "label": "0"}, {"at": 6, "label": "6"}, {"at": 14, "label": "?"}]}]},
  parts=[
    P("a", "(a)", "What does ONE pen cost?", "numeric", 1, H("The line links 3 pens with $6. Find the value for one first.", "Divide the cost of 3 pens by 3."), answer=2, unit="$"),
    P("b", "(b)", "What do 7 pens cost?", "numeric", 1, H("Use the cost of one pen and scale up.", "Multiply the unit cost by 7."), answer=14, unit="$"),
  ], subtopic="double number line"),
Q(11, "proportion", "easy", "A", "A recipe for 4 people uses 300 g of flour. How much flour is needed for 1 person?",
  "For 1 person: 300 ÷ 4 = 75 g.",
  single=("numeric", (75, 0), 1), hints=H("This is the unitary method: find the amount for ONE person first.", "Divide 300 g by the 4 people."), subtopic="unitary method"),
Q(12, "proportion", "medium", "D", "On a map, 1 cm represents 5 km. Two towns are 7.5 cm apart on the map. What is the real distance between them?",
  "Real distance = 7.5 × 5 = 37.5 km.",
  single=("numeric", (37.5, 0.05), 2), hints=H("Every centimetre on the map stands for 5 km in real life.", "Multiply the map distance by the scale value."), nxt="Multiply by the scale — check the unit changes from cm to km.", subtopic="map scales"),
Q(13, "proportion", "medium", "A", "Five identical bottles hold 7.5 litres of water in total.",
  "One bottle holds 7.5 ÷ 5 = 1.5 litres. Eight bottles hold 8 × 1.5 = 12 litres.",
  parts=[
    P("a", "(a)", "How much water does ONE bottle hold?", "numeric", 1, H("Find the amount for one first — the unitary method.", "Divide 7.5 litres by the 5 bottles."), answer=1.5, unit="litres"),
    P("b", "(b)", "How much water do 8 bottles hold?", "numeric", 1, H("Scale the one-bottle amount up to 8 bottles.", "Multiply your answer to (a) by 8."), answer=12, unit="litres"),
  ], subtopic="unitary method"),
Q(14, "proportion", "hard", "C", "Spot the mistake. A student writes: \"4 shirts cost $48. 10 shirts is 6 more shirts, so 10 shirts cost 48 + 6 = $54.\"",
  "The mistake is adding instead of scaling: price grows in proportion, not by the number of extra shirts. One shirt costs 48 ÷ 4 = $12, so 10 shirts cost 10 × 12 = $120.",
  parts=[
    P("a", "(a)", "What does ONE shirt actually cost?", "numeric", 1, H("Ignore the student's method. Find the unit price from 4 shirts.", "Divide $48 by 4 shirts."), answer=12, unit="$"),
    P("b", "(b)", "Type the correct cost of 10 shirts.", "numeric", 2, H("Proportional quantities are scaled by multiplication, not addition.", "Multiply the cost of one shirt by 10."), answer=120, unit="$"),
  ], subtopic="spot the mistake: proportional reasoning"),
Q(15, "sets and Venn diagrams", "easy", "A", "The Venn diagram shows students who play football (F) and basketball (B).",
  "Football only has 7 and both sports have 5, so n(F) = 7 + 5 = 12. In total: 7 + 5 + 9 + 4 = 25 students.",
  diagram={"kind": "venn2", "title": "Sports played", "venn": {"leftLabel": "F", "rightLabel": "B", "leftOnly": "7", "both": "5", "rightOnly": "9", "outside": "4", "universalLabel": "ξ = students"}},
  parts=[
    P("a", "(a)", "How many students play football (including those who play both)?", "numeric", 1, H("The whole F circle counts — both of its regions.", "Add the 'football only' region to the overlap region."), answer=12),
    P("b", "(b)", "How many students are shown in the universal set?", "numeric", 1, H("The universal set is everything inside the rectangle.", "Add all four regions, including the outside region."), answer=25),
  ], subtopic="reading a Venn diagram"),
Q(16, "sets and Venn diagrams", "easy", "A", "The universal set is ξ = {1, 2, 3, …, 12}. Set E contains the even numbers.",
  "The even numbers up to 12 are 2, 4, 6, 8, 10, 12 — six numbers. The complement E′ has the other 6 numbers, so n(E′) = 6.",
  parts=[
    P("a", "(a)", "List the elements of E, separated by commas.", "text", 1, H("Even means exactly divisible by 2.", "Work through 1 to 12 and keep the numbers divisible by 2."), accepted=["2, 4, 6, 8, 10, 12", "2,4,6,8,10,12", "{2, 4, 6, 8, 10, 12}"]),
    P("b", "(b)", "How many elements are in the complement of E, n(E′)?", "numeric", 1, H("The complement is everything in ξ that is NOT in E.", "Subtract n(E) from the total number of elements in ξ."), answer=6),
  ], subtopic="set notation and complement"),
Q(17, "sets and Venn diagrams", "medium", "D", "In a class of 30 students, 18 play chess, 12 play drums and 7 play both.",
  "Chess only = 18 − 7 = 11. Drums only = 12 − 7 = 5. Playing something = 11 + 7 + 5 = 23, so neither = 30 − 23 = 7 students.",
  diagram={"kind": "venn2", "title": "Chess and drums in a class of 30", "venn": {"leftLabel": "Chess", "rightLabel": "Drums", "leftOnly": "?", "both": "7", "rightOnly": "?", "outside": "?", "universalLabel": "ξ = 30 students"}},
  parts=[
    P("a", "(a)", "How many students play chess only?", "numeric", 1, H("Start in the overlap: the 7 who play both are counted inside the 18.", "Subtract the 'both' students from the chess total."), answer=11),
    P("b", "(b)", "How many students play neither activity?", "numeric", 2, H("Fill every region of the Venn diagram first, then use the class total.", "Add the three inside regions and subtract from 30."), answer=7),
  ], subtopic="working with a Venn diagram"),
Q(18, "sets and Venn diagrams", "medium", "B", "For the numbers 1 to 40, A = {multiples of 3} and B = {multiples of 5}.",
  "Multiples of 3: 13 numbers; multiples of 5: 8 numbers; multiples of both (15 and 30): 2. Only A = 13 − 2 = 11. In A or B: 11 + 2 + 6 = 19, so in neither: 40 − 19 = 21.",
  parts=[
    P("a", "(a)", "How many numbers are in A but not in B?", "numeric", 1, H("Count the multiples of 3 first, then remove those that are also multiples of 5.", "Numbers in both sets are the multiples of 15."), answer=11),
    P("b", "(b)", "How many numbers from 1 to 40 are in neither set?", "numeric", 1, H("Build the three inside regions of the Venn diagram.", "Add only-A, both and only-B, then subtract from 40."), answer=21),
  ], subtopic="Venn diagrams with number sets"),
Q(19, "sets and Venn diagrams", "hard", "A", "In a universal set of 32 students, n(A) = 17, n(B) = 14 and n(A ∩ B) = 6.",
  "Only A = 17 − 6 = 11. n(A ∪ B) = 17 + 14 − 6 = 25 (the overlap is added twice, so subtract it once). Neither = 32 − 25 = 7.",
  parts=[
    P("a", "(a)", "How many are in A only?", "numeric", 1, H("The overlap belongs to A as well — remove it from A's total.", "Subtract n(A ∩ B) from n(A)."), answer=11),
    P("b", "(b)", "Find n(A ∪ B).", "numeric", 1, H("Add the two sets, but the overlap has been counted twice.", "Use n(A) + n(B) − n(A ∩ B)."), answer=25),
    P("c", "(c)", "How many are in neither set?", "numeric", 1, H("Use the universal set size and your union answer.", "Subtract n(A ∪ B) from 32."), answer=7),
  ], subtopic="union and intersection"),
Q(20, "probability", "easy", "A", "A bag contains 4 red, 3 blue and 5 green counters. One counter is chosen at random. What is the probability it is red? Give your answer as a fraction in its simplest form.",
  "There are 4 + 3 + 5 = 12 counters. P(red) = 4/12 = 1/3.",
  single=("text", ["1/3", "4/12", "0.33", "0.333"], 1), hints=H("Probability = favourable outcomes ÷ total outcomes.", "Count all the counters first, then write red counters over the total and simplify."), subtopic="simple probability"),
Q(21, "probability", "medium", "D", "A spinner was spun 60 times in an experiment. It landed on red 18 times. What is the experimental probability of landing on red? Give your answer as a fraction in its simplest form.",
  "Experimental probability = 18 ÷ 60 = 18/60 = 3/10.",
  single=("text", ["3/10", "18/60", "0.3"], 1), hints=H("Experimental probability uses the results of the trials, not equally likely outcomes.", "Write 'times it landed on red' over 'total spins', then simplify."), nxt="Experimental probability comes from trials: successes ÷ trials.", subtopic="experimental probability"),
Q(22, "probability", "medium", "A", "A fair six-sided dice is rolled once.",
  "Even numbers are 2, 4, 6: P(even) = 3/6 = 1/2. Multiples of 3 are 3 and 6: P = 2/6 = 1/3.",
  parts=[
    P("a", "(a)", "What is the probability of rolling an even number? Give a fraction in its simplest form.", "text", 1, H("List the even faces of the dice first.", "Write even faces over 6 and simplify."), accepted=["1/2", "3/6", "0.5"]),
    P("b", "(b)", "What is the probability of rolling a multiple of 3? Give a fraction in its simplest form.", "text", 1, H("List the multiples of 3 among 1 to 6 first.", "Write those faces over 6 and simplify."), accepted=["1/3", "2/6", "0.33", "0.333"]),
  ], subtopic="simple probability"),
Q(23, "probability", "hard", "D", "A bag contains 3 red, 2 blue and 5 yellow counters (10 in total). A counter is chosen at random.",
  "P(not blue) = (3 + 5)/10 = 8/10 = 4/5. In 50 trials you would expect about 4/5 × 50 = 40 counters that are not blue.",
  parts=[
    P("a", "(a)", "What is the probability the counter is NOT blue? Give a fraction in its simplest form.", "text", 1, H("'Not blue' means red or yellow — count those counters.", "Add the red and yellow counters over the total, then simplify."), accepted=["4/5", "8/10", "0.8"]),
    P("b", "(b)", "In 50 trials, how many times would you EXPECT the counter not to be blue?", "numeric", 1, H("Expected number = probability × number of trials.", "Multiply your probability from (a), as a decimal or fraction, by 50."), answer=40),
  ], subtopic="probability and expectation"),
Q(24, "mixed challenge", "hard", "D", "For a school fête, juice is mixed from syrup and water in the ratio 1 : 4. One batch makes 2.5 litres of juice.",
  "One batch has 5 parts, so one part = 2.5 ÷ 5 = 0.5 litres of syrup. For 15 litres: 15 ÷ 2.5 = 6 batches, needing 6 × 0.5 = 3 litres of syrup.",
  parts=[
    P("a", "(a)", "How many litres of syrup are in one batch?", "numeric", 1, H("Start by finding the total number of parts in the ratio.", "Share 2.5 litres into 5 equal parts; syrup takes 1 part."), answer=0.5, tol=0.01, unit="litres"),
    P("b", "(b)", "How many litres of syrup are needed to make 15 litres of juice?", "numeric", 2, H("Work out how many batches 15 litres makes first.", "Divide 15 by the size of one batch, then multiply by the syrup per batch."), answer=3, unit="litres"),
  ], subtopic="ratio in a real context"),
Q(25, "mixed challenge", "hard", "C", "Sam says: \"Doubling 3 : 5 to 6 : 10 changes the ratio, because the numbers are bigger.\" In 1–2 sentences, explain whether Sam is right, and justify your answer using what the ratio 3 : 5 means. (Marked by your teacher against the rubric.)",
  "Sam is wrong. A ratio compares the relative sizes of the parts: 6 : 10 has the same relative shares as 3 : 5 because both sides were multiplied by the same number (2), so each side still takes the same fraction of the total (3/8 and 5/8). Changing a ratio needs the sides multiplied by different numbers.",
  single=("open", "3 marks. 1: states Sam is wrong (the ratio is unchanged/equivalent). 1: explains that both sides were multiplied by the same number, so the ratio is equivalent. 1: justifies with the meaning of the parts (same shares/fractions of the total, e.g. 3/8 and 5/8, or an equivalent example). No credit for a bare 'he is wrong' without justification.", 3),
  hints=H("Think about what a ratio compares: absolute size, or relative shares?", "Compare the fraction of the total each side represents in 3 : 5 and in 6 : 10."), nxt="Equivalent ratios come from multiplying both sides by the same number.", subtopic="explain why: equivalent ratios"),
]

BLUEPRINT = {"rate": 4, "ratio": 5, "proportion": 5, "sets and Venn diagrams": 5, "probability": 4, "mixed challenge": 2}
