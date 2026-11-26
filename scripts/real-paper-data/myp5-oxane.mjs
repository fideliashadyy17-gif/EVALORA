/**
 * REAL MYP5 Version C submission, captured from production.
 *
 * Candidate: Oxane ZOCLI · attempt d3bbe8de-4d90-4d48-a7d0-84802c4494c7
 * Stored score 56/100. Answer payloads, awarded marks, marker notes, question
 * prompts, part specs and option keys are transcribed verbatim from Supabase so
 * the PDF verifier renders a genuine paper rather than a synthetic one.
 *
 * Only the config keys the renderer and marker read are kept (parts, criterion,
 * question number, section, structured marks); presentation-only config such as
 * hints is present because the part normaliser requires it.
 */

const H = (what) => [
  `Re-read what ${what} is asking you to find.`,
  `Use the data and method named in the question for ${what}.`,
];

const part = (id, label, kind, points, prompt, extra = {}) => ({
  id,
  label,
  kind,
  points,
  prompt,
  hints: H(label),
  ...extra,
});

export const MYP5_OXANE = {
  label: "MYP5 Version C — Oxane ZOCLI (real production submission)",
  exam: "ce000000-0000-4000-8000-000000000002",
  attempt: "d3bbe8de-4d90-4d48-a7d0-84802c4494c7",
  student: "Oxane ZOCLI",
  score: 56,
  maxScore: 100,
  criteria: [
    { code: "A", title: "Knowing and understanding", marksAwarded: 15, marksMax: 32 },
    { code: "B", title: "Investigating patterns", marksAwarded: 8, marksMax: 24 },
    { code: "C", title: "Communicating", marksAwarded: 9, marksMax: 20 },
    { code: "D", title: "Applying mathematics in real-life contexts", marksAwarded: 9, marksMax: 24 },
  ],
  rows: [
    {
      id: "ce000000-0000-4000-8000-000000001001",
      type: "single_choice",
      points: 1,
      criterion: "C",
      number: 1,
      prompt: "Which sequence is geometric?",
      options: [
        { id: "98e8945b-6e89-4ec7-9dae-d876a2a90a3b", label: "A", is_correct: false },
        { id: "9e169931-aa7f-407f-825d-90432f497904", label: "B", is_correct: false },
        { id: "64122afc-8df0-45d6-834d-287715938bbb", label: "C", is_correct: true },
        { id: "80f0a745-1c51-4a5c-9c52-659ebab1eb48", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001002",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 2,
      prompt: "The 10th term of an arithmetic sequence is:",
      options: [
        { id: "323bd4a6-7fe0-46a6-b970-9d93a6cd437d", label: "A", is_correct: false },
        { id: "fb9cf1e3-ffb1-4040-9ed4-34d34ee80d2b", label: "B", is_correct: true },
        { id: "90202145-c985-43ba-bcc9-c4f0a491ade9", label: "C", is_correct: false },
        { id: "cebbac34-6d12-4265-9ce1-8a6fc1b62885", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001003",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 3,
      prompt: "The common difference of the sequence is:",
      options: [
        { id: "752d3bcb-49c5-4980-8190-df4914deaa0c", label: "A", is_correct: true },
        { id: "b2bd0bd4-7b00-4168-88a3-e3f93123eee9", label: "B", is_correct: false },
        { id: "164122cb-a03e-4a9e-a64a-4f2090baab18", label: "C", is_correct: false },
        { id: "30cff300-1d64-4c42-9bc0-47468e91cefb", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001011",
      type: "single_choice",
      points: 2,
      criterion: "A",
      number: 11,
      prompt: "Which formula gives the sum of the first n terms of a geometric series?",
      options: [
        { id: "30a75119-b033-4012-9f6a-7a66d789c8ed", label: "A", is_correct: false },
        { id: "1797409f-436a-45c4-a60b-6694f6b17a5a", label: "B", is_correct: false },
        { id: "fe4abffc-664e-4f54-969c-d8477c0d9e58", label: "C", is_correct: true },
        { id: "14fe0042-51bf-4b8e-a80a-8bfd10e56ecd", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001024",
      type: "single_choice",
      points: 2,
      criterion: "B",
      number: 24,
      prompt: "A quadratic sequence has constant second difference 4. Its general term is:",
      options: [
        { id: "44c2c42f-9dd0-45cb-86ba-1d37507a428a", label: "A", is_correct: true },
        { id: "e0f69cdf-6e63-47cd-916e-9d028f24aed7", label: "B", is_correct: false },
        { id: "7b57447a-c966-4ac5-8542-10623dd9e17d", label: "C", is_correct: false },
        { id: "2e189fbf-898a-4e11-a366-c28dbd41fc82", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001020",
      type: "single_choice",
      points: 2,
      criterion: "A",
      number: 20,
      prompt: "The value of a term in a geometric sequence is:",
      options: [
        { id: "972cda8c-aab2-48a4-a13d-8d396c7e9561", label: "A", is_correct: false },
        { id: "5311ae95-9d18-410e-baa7-74ba29f5e44c", label: "B", is_correct: false },
        { id: "48d48810-77c7-4071-b315-b49a3e966295", label: "C", is_correct: true },
        { id: "c6c0de44-8d1b-42c0-9cb3-08780b281a9d", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001012",
      type: "assess_parts",
      points: 2,
      criterion: "A",
      number: 12,
      prompt: "Arithmetic sequence with $u_4 = 23$ and $u_{11} = 65$: [2]\n**(i) $d =$**   **(ii) $u_{25} =$**",
      parts: [
        part("d", "(i)", "numeric", 1, "Common difference d", { answer: 6, tolerance: 0 }),
        part("u25", "(ii)", "numeric", 1, "Twenty-fifth term", { answer: 149, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001016",
      type: "assess_parts",
      points: 3,
      criterion: "C",
      number: 16,
      prompt: "Linear $L_n = 3n + 3$ and quadratic $Q_n = n^2 - n + 6$ are plotted together. [3]\n**(i) Both intersection points:** ______\n**(ii) $Q_5 - L_5 =$** ______",
      parts: [
        part("i1", "(i) first", "text", 1, "First intersection point", { accepted: ["(1, 6)", "1, 6", "n=1, y=6"] }),
        part("i2", "(i) second", "text", 1, "Second intersection point", { accepted: ["(3, 12)", "3, 12", "n=3, y=12"] }),
        part("diff", "(ii)", "numeric", 1, "Value of Q5 − L5", { answer: 8, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001017",
      type: "assess_parts",
      points: 3,
      criterion: "A",
      number: 17,
      prompt: "Positive geometric sequence with $u_2 = 12$ and $u_5 = 324$: [3]\n**(i) $r =$** ______   **$u_1 =$** ______   **(ii) Sum $S_5 =$** ______",
      parts: [
        part("r", "(i) r", "numeric", 1, "Common ratio r", { answer: 3, tolerance: 0 }),
        part("u1", "(i) u1", "numeric", 1, "First term u1", { answer: 4, tolerance: 0 }),
        part("s5", "(ii)", "numeric", 1, "Sum of the first five terms", { answer: 484, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001018",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 18,
      prompt:
        "Cumulative flour bags $S_n$ used by a Cotonou bakery over Weeks 1–4 (weekly usage is arithmetic). [3]\n**(i) Week 4 usage $u_4 =$** ______   **(ii) $d =$** ______ **;** **$S_8 =$** ______",
      parts: [
        part("u4", "(i)", "numeric", 1, "Week 4 usage", { answer: 30, tolerance: 0, unit: "bags" }),
        part("d", "(ii) d", "numeric", 1, "Common difference", { answer: 4, tolerance: 0, unit: "bags" }),
        part("s8", "(ii) S8", "numeric", 1, "Total usage over 8 weeks", { answer: 256, tolerance: 0, unit: "bags" }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001019",
      type: "assess_parts",
      points: 3,
      criterion: "A",
      number: 19,
      prompt: "Quadratic rule $u_n = 2n^2 - 7n + 9$: [3]\n**(i)** $u_1 =$ ______ **, $u_5 =$** ______   **(ii) Solve $u_n = 81$: $n =$** ______",
      parts: [
        part("terms", "(i)", "text", 1, "Values of u1 and u5", { accepted: ["4 and 24", "4, 24", "u1=4, u5=24"] }),
        part("solve", "(ii)", "numeric", 2, "Positive integer n for which u_n = 81", { answer: 8, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001023",
      type: "assess_parts",
      points: 3,
      criterion: "B",
      number: 23,
      prompt: "**Complete** the sequence classification & fifth-term table: [3]",
      parts: [
        part("r1", "Row 1", "text", 1, "Type and fifth term for 30, 23, 16, 9, …", {
          accepted: ["Arithmetic, 2", "Arithmetic; 2", "Arithmetic u5=2"],
        }),
        part("r2", "Row 2", "text", 1, "Type and fifth term for 5, 10, 20, 40, …", {
          accepted: ["Geometric, 80", "Geometric; 80", "Geometric u5=80"],
        }),
        part("r3", "Row 3", "text", 1, "Type and fifth term for 2, 7, 16, 29, …", {
          accepted: ["Quadratic, 46", "Quadratic; 46", "Quadratic u5=46"],
        }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001027",
      type: "assess_parts",
      points: 2,
      criterion: "C",
      number: 27,
      prompt: "**Rewrite** $u_n = 12\\left(\\frac12\\right)^{n-1}$ $(n \\ge 1)$ as a recursive rule: [2]\n$u_1 =$ ______ , $u_{n+1} =$ ______ $(n \\ge 1)$",
      parts: [
        part("u1", "u1", "numeric", 1, "Initial term", { answer: 12, tolerance: 0 }),
        part("rule", "un+1", "expression", 1, "Recursive rule in terms of u_n", {
          accepted: ["(1/2)u_n", "1/2*u_n", "0.5u_n", "u_n/2", "1/2 u_n", "0.5*u_n"],
        }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001028",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 28,
      prompt:
        "A Porto-Novo cooperative weaves 56 baskets in Month 1 (+8 baskets/month). [3]\n**(i) Month 10: $u_{10} =$** ______   **(ii) Months for $S_n = 792$: $n =$** ______",
      parts: [
        part("u10", "(i)", "numeric", 1, "Month 10 production", { answer: 128, tolerance: 0, unit: "baskets" }),
        part("n", "(ii)", "numeric", 2, "Number of months for a total of 792 baskets", { answer: 9, tolerance: 0, unit: "months" }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001030",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 30,
      prompt:
        "A Bohicon plant filters $V_n$ m³ in month $n$ (geometric decay). [3]\n**(i) $r =$** ______ **; $V_6 =$** ______   **(ii) $S_6$ (nearest m³) =** ______",
      parts: [
        part("r", "(i) r", "numeric", 1, "Common ratio", { answer: 0.9, tolerance: 0 }),
        part("v6", "(i) V6", "numeric", 1, "Volume in month 6 (1 d.p.)", { answer: 236.2, tolerance: 0.05, unit: "m³" }),
        part("s6", "(ii)", "numeric", 1, "Total volume over 6 months (nearest m³)", { answer: 1874, tolerance: 0.5, unit: "m³" }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001034",
      type: "assess_parts",
      points: 10,
      criterion: "D",
      number: 4,
      prompt:
        "**TASK 4 · CRITERION D — Applying in real-life contexts [10 marks]**\n**(a)** State the geometric ratio $r$ and compute Year 6 output. [4]",
      parts: [
        part("r", "(a) r", "numeric", 1, "Geometric ratio", { answer: 0.96, tolerance: 0 }),
        part("e6", "(a) E6", "numeric", 1, "Year 6 output (1 d.p.)", { answer: 489.2, tolerance: 0.05, unit: "MWh" }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001031",
      type: "assess_parts",
      points: 10,
      criterion: "A",
      number: 1,
      prompt:
        "**TASK 1 · CRITERION A — Knowing and understanding [10 marks]**\nArithmetic and geometric sequences are plotted together. [10]",
      parts: [
        part("a1", "(a)(i)", "expression", 1, "Explicit formula for A_n", { accepted: ["40-4n", "36-4(n-1)"] }),
        part("a3", "(a)(iii)", "text", 1, "Show both terms equal 24", {
          accepted: ["A4 = 40 - 16 = 24 and G4 = 3 × 2^3 = 24", "A4=24, G4=3(8)=24"],
        }),
        part("b1", "(b)(i)", "text", 1, "First negative term", { accepted: ["n=11, A11=-4", "11 and -4", "A11 = -4"] }),
        part("b2", "(b)(ii)", "numeric", 1, "Sum of first 20 terms", { answer: -40, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001032",
      type: "assess_parts",
      points: 10,
      criterion: "B",
      number: 2,
      prompt: "**TASK 2 · CRITERION B — Investigating patterns [10 marks]**\nThree sequences are tabulated. [10]",
      parts: [
        part("a1", "(a)(i)", "text", 1, "First five terms of B_n", { accepted: ["4, 6, 8, 10, 12"] }),
        part("a2", "(a)(ii)", "text", 1, "Terms of C and T", {
          accepted: ["C: 2, 6, 12, 20, 30; T: 6, 12, 20, 30, 42", "2,6,12,20,30 and 6,12,20,30,42"],
        }),
        part("b3", "(b)(iii)", "numeric", 1, "Stage where C exceeds 208", { answer: 2, tolerance: 0 }),
        part("c2", "(c)(ii)", "numeric", 2, "Smallest n", { answer: 13, tolerance: 0 }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001033",
      type: "assess_parts",
      points: 10,
      criterion: "C",
      number: 3,
      prompt: "**TASK 3 · CRITERION C — Communicating [10 marks]**\nTwo sequences are shown and two students' work is critiqued. [10]",
      parts: [
        part("a1", "(a)(i)", "text", 1, "Describe P_n", {
          accepted: ["Alternating geometric; points alternate above and below the n-axis while halving"],
        }),
        part("a2", "(a)(ii)", "text", 1, "Describe R_n", {
          accepted: ["Quadratic; U-shaped parabola with minimum vertex (4,0) and symmetry R3=R5"],
        }),
        part("c3", "(c)(iii)", "text", 1, "Find Amina's error", {
          accepted: ["She used exponent 5 instead of 6; S6 = 5(2^6-1) = 315", "The exponent must be n=6; correct sum 315"],
        }),
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001004",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 4,
      prompt: "The coordinate graph shows the first five terms of a lineay sequence $u_n$. **Identify** its explicit formula.\n\n[Figure: First five terms of a linear sequence]",
      options: [
        { id: "c2867ff6-6d73-4a0c-8490-56e9009f8497", label: "A", is_correct: false },
        { id: "0f97f4cb-b7fb-4e13-80d2-a7d4fbcc7e1b", label: "B", is_correct: false },
        { id: "b435f108-4a26-4884-a6e7-25aa67fe9603", label: "C", is_correct: true },
        { id: "1b9db58f-79f9-4a87-b699-0dc2dd56c9c8", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001005",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 5,
      prompt: "For the geometric sequence 128, −64, 32, −16, …, **find** $r$ and $u_6$.",
      options: [
        { id: "0e2d2d1d-4f9c-4962-9d4d-214b8db60474", label: "A", is_correct: false },
        { id: "82bc8b59-360e-49b8-bdd9-1e6c14905b52", label: "B", is_correct: true },
        { id: "7b469b12-a549-4f55-b313-c79015cf8127", label: "C", is_correct: false },
        { id: "1a93076b-2e4c-4c8f-9268-347c05441088", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001006",
      type: "single_choice",
      points: 1,
      criterion: "B",
      number: 6,
      prompt: "How is the sequence 5, 9, 17, 29, 45, … best **classified**?",
      options: [
        { id: "5d32638c-ff5e-43dc-afe2-a52137b4ed6f", label: "A", is_correct: false },
        { id: "29e1dfaf-91fb-4dff-926f-964c63c29aa0", label: "B", is_correct: false },
        { id: "3bfb9367-114e-4781-8f92-1f8c61a65bc8", label: "C", is_correct: true },
        { id: "699c622e-fb9e-4087-b35d-8ac6c443da11", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001007",
      type: "single_choice",
      points: 1,
      criterion: "B",
      number: 7,
      prompt: "Which explicit formula **generates** the sequence $\\frac13, \\frac25, \\frac37, \\frac49, \\ldots$?",
      options: [
        { id: "e58b1b26-5f17-43bc-b4d6-a62eaa117cb2", label: "A", is_correct: false },
        { id: "b8cbbb22-ce2c-4161-922c-da9529636965", label: "B", is_correct: true },
        { id: "20050fd8-fa84-47bd-bedf-d709e89bda99", label: "C", is_correct: false },
        { id: "c5a3f513-368a-485a-8d72-683b9b51f3ef", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001008",
      type: "single_choice",
      points: 1,
      criterion: "D",
      number: 8,
      prompt: "An auditorium has 18 seats in Row 1 and 26 seats in Row 9, increasing arithmetically by row. **Find** the total seats $S_9$.",
      options: [
        { id: "943283e0-5829-421d-afd7-4ccf57bb5f4e", label: "A", is_correct: false },
        { id: "50d11682-b1ac-40b2-9477-27250f763b47", label: "B", is_correct: false },
        { id: "d57246c7-9a8b-4d45-8903-277955ae1174", label: "C", is_correct: true },
        { id: "e3edc570-4168-4375-8ce1-d1b455a91b40", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001009",
      type: "single_choice",
      points: 2,
      criterion: "B",
      number: 9,
      prompt: "The difference table below represents a quadratic sequence $u_n = an^2 + bn + c$: [2]\nTerm n\n | 1\n | 2\n | 3\n | 4\n | 5\n\nValue $u_n$\n | 4\n | 11\n | 24\n | 43\n | $k$\n\n1st diff. $\\Delta^1$\n | +7\n | +13\n | +19\n | $p$\n | —\n\n2nd diff. $\\Delta^2$\n | \n | +6\n | +6\n | (constant)\n | \n\n**Find** the leading coefficient $a$ and fifth term $k$.",
      options: [
        { id: "f45a6c46-0396-44f3-b08d-e7b71891df38", label: "A", is_correct: true },
        { id: "fdc708fa-fa83-474e-a972-8f15fabfa961", label: "B", is_correct: false },
        { id: "bd56ef54-9760-47b6-977f-66b5b417dd73", label: "C", is_correct: false },
        { id: "159bbee1-0ce1-4b4c-af4b-acbe24ca811d", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001010",
      type: "single_choice",
      points: 2,
      criterion: "C",
      number: 10,
      prompt: "The graph displays the first four terms of a geometric sequence. **Choose** its explicit rule and exact fifth term $u_5$. [2]\n\n[Figure: First four terms of a geometric sequence]",
      options: [
        { id: "ecdf6a1b-9d39-4e16-a5b9-f7f642ec2719", label: "A", is_correct: false },
        { id: "47007274-941c-4cc8-8206-231ff0205a7c", label: "B", is_correct: true },
        { id: "1824bb82-d3d8-4290-8888-7581449a6bb1", label: "C", is_correct: false },
        { id: "99b2fc8f-d3c6-43d8-a6de-456d92076135", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001013",
      type: "single_choice",
      points: 2,
      criterion: "A",
      number: 13,
      prompt: "**Calculate** the sum $S_{15}$ of the first 15 terms of the arithmetic series 9 + 13 + 17 + 21 + … [2]",
      options: [
        { id: "53cbc79f-ff4e-468f-b92c-5fa4c95a243f", label: "A", is_correct: false },
        { id: "36dcc5b4-3d3c-4b8a-b610-3fd8faa1c757", label: "B", is_correct: true },
        { id: "d295b5a4-01bd-4cee-bae8-32f6aaebf171", label: "C", is_correct: false },
        { id: "3592342c-6e1f-4753-87e5-86f1287f843a", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001014",
      type: "single_choice",
      points: 2,
      criterion: "D",
      number: 14,
      prompt: "Lab equipment worth $25 000 in Year 1 retains 80% of its value each year ($V_n = 25 000(0.8)\u001e{n-1}$). **Find** its Year 4 value $V_4$. [2]",
      options: [
        { id: "85757a0d-9b2e-4ac2-903a-68b93f2ba43f", label: "A", is_correct: false },
        { id: "63d217f5-f99e-4619-bb63-88b9791b715e", label: "B", is_correct: true },
        { id: "991cfc4d-9b5f-4901-b79b-7f53a416aa5a", label: "C", is_correct: false },
        { id: "b0161b50-7d92-405a-84ae-5fdd102146ed", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001015",
      type: "assess_parts",
      points: 3,
      criterion: "B",
      number: 15,
      prompt: "A sequence satisfies $u_1 = 1$ and $u_{n+1} = u_n + 2n + 1$ $(n \\ge 1)$. [3]\n**(i)** **Plot** $(3, u_3)$ and $(4, u_4)$ on the grid.\n**(ii) Explicit rule:** $u_n =$ ______",
      parts: [
        {
          id: "rule",
          label: "(ii)",
          kind: "expression",
          points: 1,
          prompt: "Explicit rule for the sequence, and plot the two required points in the working space",
          hints: H("the explicit rule"),
          accepted: ["n^2", "n\u00b2"],
        },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001021",
      type: "single_choice",
      points: 2,
      criterion: "A",
      number: 21,
      prompt: "Consecutive positive terms $k-2$, $k+4$, $3k$ form a geometric sequence. **Find** $k$ and common ratio $r$. [2]",
      options: [
        { id: "c9d63126-c4ba-4c8d-895c-b9337c16f86d", label: "A", is_correct: false },
        { id: "18e7cf21-6eae-478c-8366-eaee3c3dfc7b", label: "B", is_correct: true },
        { id: "26735295-c221-431d-ac16-783303e26d67", label: "C", is_correct: false },
        { id: "b3a70b1b-ff95-482f-b485-dbbb954d84c5", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001022",
      type: "single_choice",
      points: 2,
      criterion: "A",
      number: 22,
      prompt: "**How many terms** are in the alternating geometric series $243 - 162 + 108 - \\ldots - 32$? [2]",
      options: [
        { id: "d3b31f18-58ec-4c15-af07-25482b261da5", label: "A", is_correct: false },
        { id: "538c28d1-2cb8-48ff-985e-14a93f420284", label: "B", is_correct: true },
        { id: "c629525c-3ef4-4692-a321-b6d2917e6afc", label: "C", is_correct: false },
        { id: "8e256e24-a53f-42b3-9443-a41d8413319a", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001025",
      type: "single_choice",
      points: 2,
      criterion: "B",
      number: 25,
      prompt: "Given $u_1 = 4$ and $u_{n+1} = 3u_n - 2$ $(n \\ge 1)$, where $w_n = u_n - 1$ is geometric, **identify** the explicit formula for $u_n$. [2]",
      options: [
        { id: "5666664f-445f-42aa-bd7b-59e94cf4c07a", label: "A", is_correct: false },
        { id: "c9c057bd-831b-4b5c-8613-61a55be03b0f", label: "B", is_correct: true },
        { id: "dbf9027c-5adc-46fc-b65a-392457faba89", label: "C", is_correct: false },
        { id: "bd351ff5-4bc4-480f-8dcf-6b3b49365e7d", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001026",
      type: "single_choice",
      points: 2,
      criterion: "C",
      number: 26,
      prompt: "Which recursive definition **generates** the sequence with explicit rule $u_n = 7n - 4$ $(n \\ge 1)$? [2]",
      options: [
        { id: "0638a306-df7c-4a18-bf63-ee693f10049a", label: "A", is_correct: false },
        { id: "37594c72-9c2e-4852-8bd0-1d30d5d57b66", label: "B", is_correct: true },
        { id: "281fe12f-105b-49d1-a561-94b11b4dd9bf", label: "C", is_correct: false },
        { id: "fdfacf57-6a32-4553-b1b7-792dd9f6aeed", label: "D", is_correct: false },
      ],
    },
    {
      id: "ce000000-0000-4000-8000-000000001029",
      type: "single_choice",
      points: 2,
      criterion: "D",
      number: 29,
      prompt: "Kofi invests 100 000 FCFA at the **start** of each year for 5 years at 6% compound interest p.a. **Find** the end-of-Year-5 balance. [2]",
      options: [
        { id: "4c2ee57c-04f0-45df-a12d-3381097f58e2", label: "A", is_correct: false },
        { id: "b408173f-2623-484b-8f07-f68769945b76", label: "B", is_correct: true },
        { id: "7be6b1e9-893e-4ed0-ae4a-724201ed2730", label: "C", is_correct: false },
        { id: "95957557-b049-427c-aba9-767f81ba95d7", label: "D", is_correct: false },
      ],
    },
  ],
  answers: {
    "ce000000-0000-4000-8000-000000001004": { answer: { option_id: "b435f108-4a26-4884-a6e7-25aa67fe9603" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001005": { answer: { option_id: "82bc8b59-360e-49b8-bdd9-1e6c14905b52" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001006": { answer: { option_id: "3bfb9367-114e-4781-8f92-1f8c61a65bc8" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001007": { answer: { option_id: "b8cbbb22-ce2c-4161-922c-da9529636965" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001008": { answer: { option_id: "d57246c7-9a8b-4d45-8903-277955ae1174" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001009": { answer: { option_id: "f45a6c46-0396-44f3-b08d-e7b71891df38" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001010": { answer: { option_id: "47007274-941c-4cc8-8206-231ff0205a7c" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001013": { answer: { option_id: "36dcc5b4-3d3c-4b8a-b610-3fd8faa1c757" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001014": { answer: { option_id: "63d217f5-f99e-4619-bb63-88b9791b715e" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001020": { answer: { option_id: "972cda8c-aab2-48a4-a13d-8d396c7e9561" }, points_awarded: 0 },
    "ce000000-0000-4000-8000-000000001015": {
      answer: {
        parts: { rule: "Tn=n+3" },
        working: {
          rule: {
            text: "",
            graph: {
              points: [
                { x: 3, y: 9, label: "A", open: false },
                { x: 4, y: 16, label: "B", open: true },
              ],
            },
          },
        },
      },
      points_awarded: 2,
    },
    "ce000000-0000-4000-8000-000000001021": { answer: { option_id: "18e7cf21-6eae-478c-8366-eaee3c3dfc7b" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001022": { answer: { option_id: "538c28d1-2cb8-48ff-985e-14a93f420284" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001024": { answer: { option_id: "2e189fbf-898a-4e11-a366-c28dbd41fc82" }, points_awarded: 0 },
    "ce000000-0000-4000-8000-000000001025": { answer: { option_id: "c9c057bd-831b-4b5c-8613-61a55be03b0f" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001026": { answer: { option_id: "37594c72-9c2e-4852-8bd0-1d30d5d57b66" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001029": { answer: { option_id: "b408173f-2623-484b-8f07-f68769945b76" }, points_awarded: 2 },
    "ce000000-0000-4000-8000-000000001001": { answer: { option_id: "64122afc-8df0-45d6-834d-287715938bbb" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001002": { answer: { option_id: "fb9cf1e3-ffb1-4040-9ed4-34d34ee80d2b" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001003": { answer: { option_id: "752d3bcb-49c5-4980-8190-df4914deaa0c" }, points_awarded: 1 },
    "ce000000-0000-4000-8000-000000001011": { answer: { option_id: "30a75119-b033-4012-9f6a-7a66d789c8ed" }, points_awarded: 0 },
    "ce000000-0000-4000-8000-000000001024": { answer: { option_id: "2e189fbf-898a-4e11-a366-c28dbd41fc82" }, points_awarded: 0 },
    "ce000000-0000-4000-8000-000000001020": { answer: { option_id: "972cda8c-aab2-48a4-a13d-8d396c7e9561" }, points_awarded: 0 },
    "ce000000-0000-4000-8000-000000001012": {
      answer: { parts: { d: "6", u25: "149" } },
      points_awarded: 2,
    },
    "ce000000-0000-4000-8000-000000001016": {
      answer: { parts: { i1: "(1,6)", i2: "(3,12)", diff: "8" } },
      points_awarded: 3,
      marker_note:
        'MYP5 C A Q16: (i) Both intersections "(1,6)" and "(3,12)" exact A1 A1 (missed by auto-grader); (ii) Q5−L5 = 8 A1. Awarded 3/3.',
    },
    "ce000000-0000-4000-8000-000000001017": {
      answer: { parts: { r: "3", s5: "52", u1: "4" } },
      points_awarded: 2,
    },
    "ce000000-0000-4000-8000-000000001018": {
      answer: { parts: { d: "4", s8: "256", u4: "96" } },
      points_awarded: 2,
    },
    "ce000000-0000-4000-8000-000000001019": {
      answer: { parts: { solve: "The positive integer is 9", terms: "U1=4 and U5= 24" } },
      points_awarded: 1,
      marker_note:
        'MYP5 C A Q19: (i) "U1=4 and U5= 24" exact A1 (missed by auto-grader); (ii) 9 incorrect. Awarded 1/3.',
    },
    "ce000000-0000-4000-8000-000000001023": {
      answer: { parts: { r1: "Arithmetic U5= 72", r2: "Geometric", r3: "Quadratic" } },
      points_awarded: 0,
    },
    "ce000000-0000-4000-8000-000000001027": {
      answer: { parts: { u1: "12" } },
      points_awarded: 1,
    },
    "ce000000-0000-4000-8000-000000001028": {
      answer: { parts: { n: "105", u10: "128" } },
      points_awarded: 1,
    },
    "ce000000-0000-4000-8000-000000001030": {
      answer: { parts: { r: "0.9", s6: "18742", v6: "262.4" } },
      points_awarded: 1,
    },
    "ce000000-0000-4000-8000-000000001034": {
      answer: { parts: { r: "0.6", e6: "46.6" } },
      points_awarded: 0,
    },
    "ce000000-0000-4000-8000-000000001031": {
      answer: {
        parts: {
          a1: "An=-4n+32",
          a2: "Gn= 3(7)^n-1",
          a3: "A4=G4=16",
          a4: "The common ratio for the graph is -4",
          b1: "The first Negative term is 8",
          b2: "760",
          b3: "n=-10 in the formule it gives 42",
        },
      },
      points_awarded: 0,
      marker_note: "MYP5 C B Q1: All attempted parts mathematically incorrect (auto keyword false positives on a3/a4/b3 removed). Adjusted 2 -> 0/10.",
    },
    "ce000000-0000-4000-8000-000000001032": {
      answer: {
        parts: { a1: "2", a2: "Cn=2 and Tn=3", a4: "Tn is arithemetic", b3: "Stage 4", c2: "Stage 11" },
      },
      points_awarded: 0,
    },
    "ce000000-0000-4000-8000-000000001033": {
      answer: { parts: { a1: "Geometric", a2: "Arithemetic", c3: "she put the wrong n and used the geometric series." } },
      points_awarded: 0,
    },
  },
};
