/**
 * REAL MYP4 Version C submission, captured from production.
 *
 * Candidate: Melina OUSSOU · attempt ff1cb3ba-c166-4842-af65-a44dd853b4cb
 * Stored score 61/100 (raw 46 plus the school's internal score adjustment, which
 * is never shown to students). Answer payloads, awarded marks, marker notes,
 * question prompts, part specs and option keys are transcribed verbatim from
 * Supabase so the PDF verifier renders a genuine paper, not a synthetic one.
 *
 * This is the harder of the two real fixtures to typeset: it is statistics-heavy,
 * with stem-and-leaf and table-style prompts, `\mu` / `\sigma` notation,
 * inequalities such as `0 \le t < 10` and comma-decimal student answers
 * ("29,5", "6,83") that must not be mistaken for prose.
 *
 * Only the config keys the renderer and marker read are kept (parts, criterion,
 * question number); `hints` is present because the part normaliser requires it.
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

export const MYP4_MELINA = {
  label: "MYP4 Version C — Melina OUSSOU (real production submission)",
  exam: "cd000000-0000-4000-8000-000000000002",
  attempt: "ff1cb3ba-c166-4842-af65-a44dd853b4cb",
  student: "Melina OUSSOU",
  score: 61,
  maxScore: 100,
  quizSettings: {"subject":"Mathematics","curriculum":"MYP 4","grade_level":"Grade 9"},
  criteria: [
    {
      code: "A",
      title: "Knowing and understanding",
      marksAwarded: 17,
      marksMax: 30,
    },
    {
      code: "B",
      title: "Investigating patterns",
      marksAwarded: 5,
      marksMax: 20,
    },
    {
      code: "C",
      title: "Communicating",
      marksAwarded: 16,
      marksMax: 26,
    },
    {
      code: "D",
      title: "Applying mathematics in real-life contexts",
      marksAwarded: 8,
      marksMax: 24,
    },
  ],
  rows: [
    {
      id: "cd000000-0000-4000-8000-000000001001001",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 1,
      prompt: "Which variable measured at a health clinic is **quantitative continuous**?",
      options: [
        {
          id: "1a5ea235-d4bc-4016-a7ff-9fa04a62f8e8",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Blood group (A, B, AB, O)",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "a203eb6d-7e1a-4814-a21b-25ecf1c185b1",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Number of siblings",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "7e185a4d-bcad-48e0-aba4-bf5989491936",
          label: "C",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Body mass (in kg)",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "d38d0ddf-ff90-46ba-89a3-d962781e756e",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Clinic ward code",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001031",
      type: "assess_parts",
      points: 10,
      criterion: "A",
      number: 1,
      prompt: "**QUESTION 1 · CRITERION A: KNOWING & UNDERSTANDING [10 marks]**\n**(a)** Lengths of 50 cocoa pods (measured to the nearest mm):\nLength (mm)\n | 20–29\n | 30–39\n | 40–49\n | 50–59\n\nFrequency f\n | 8\n | 20\n | 14\n | 8\n\n**(i)** State the lower and upper class boundaries of 30–39 mm. [1]\n**(ii)** State the modal class and the class containing the median. [1]\n**(iii)** Using class midpoints, **calculate** an estimate of the mean pod length. [2]\n**(b)** The cumulative frequency curve shows weekly revision hours $h$ of 80 MYP 4 students, passing through (8, 20), (12, 40), (16, 60) and (20, 72).\n\n[Figure: Weekly revision hours of 80 students]\n**(i)** Find the median, $Q_1$, $Q_3$ and IQR. [2]\n**(ii)** Find the number and percentage of students revising more than 20 hours. [1]\n**(c)** Waiting times $t$ (min) of 51 patients: $0 \\le t < 5$ $(f=10)$, $5 \\le t < 15$ $(f=25)$, $15 \\le t < 35$ $(f=16)$.\n**(i)** **Calculate** the frequency density of each class. [2]\n**(ii)** On a histogram where 1 unit of frequency density = 2 cm vertically, find the bar height (in cm) for each class. [1]",
      parts: [
        {
          id: "a1",
          label: "(a)(i)",
          kind: "text",
          points: 1,
          prompt: "Lower and upper boundaries of 30–39 mm",
          hints: [
            "Re-read what (a)(i) is asking you to find.",
            "Use the data and method named in the question for (a)(i).",
          ],
          accepted: [
            "29.5 and 39.5",
            "29.5 mm and 39.5 mm",
            "29.5, 39.5",
            "29.5 to 39.5",
          ],
        },
        {
          id: "a2",
          label: "(a)(ii)",
          kind: "text",
          points: 1,
          prompt: "Modal class and class containing the median",
          hints: [
            "Re-read what (a)(ii) is asking you to find.",
            "Use the data and method named in the question for (a)(ii).",
          ],
          accepted: [
            "30–39 and 30–39",
            "30-39 mm; 30-39 mm",
            "Both 30–39 mm",
            "30–39 mm, 30–39 mm",
          ],
        },
        {
          id: "a3",
          label: "(a)(iii) total",
          kind: "numeric",
          points: 1,
          prompt: "Weighted total using midpoints",
          hints: [
            "Re-read what (a)(iii) total is asking you to find.",
            "Use the data and method named in the question for (a)(iii) total.",
          ],
          unit: "mm",
          answer: 1945,
          tolerance: 0,
        },
        {
          id: "a4",
          label: "(a)(iii) mean",
          kind: "numeric",
          points: 1,
          prompt: "Estimated mean pod length (1 d.p.)",
          hints: [
            "Re-read what (a)(iii) mean is asking you to find.",
            "Use the data and method named in the question for (a)(iii) mean.",
          ],
          unit: "mm",
          answer: 38.9,
          tolerance: 0,
        },
        {
          id: "b1",
          label: "(b)(i) quartiles",
          kind: "text",
          points: 2,
          prompt: "Median, Q1, Q3 and IQR of revision times",
          hints: [
            "Re-read what (b)(i) quartiles is asking you to find.",
            "Use the data and method named in the question for (b)(i) quartiles.",
          ],
          accepted: [
            "median 12 h, Q1 8 h, Q3 16 h, IQR 8 h",
            "12, 8, 16, 8",
            "Med 12, Q1 8, Q3 16, IQR 8",
          ],
        },
        {
          id: "b3",
          label: "(b)(ii)",
          kind: "text",
          points: 1,
          prompt: "Number and percentage revising more than 20 hours",
          hints: [
            "Re-read what (b)(ii) is asking you to find.",
            "Use the data and method named in the question for (b)(ii).",
          ],
          accepted: [
            "8 students, 10%",
            "8 and 10%",
            "8, 10%",
            "8 students (10%)",
          ],
        },
        {
          id: "c1",
          label: "(c)(i) first two",
          kind: "text",
          points: 1,
          prompt: "Frequency densities for the first two classes",
          hints: [
            "Re-read what (c)(i) first two is asking you to find.",
            "Use the data and method named in the question for (c)(i) first two.",
          ],
          accepted: [
            "2.0 and 2.5",
            "2, 2.5",
            "2.0, 2.5",
          ],
        },
        {
          id: "c2",
          label: "(c)(i) third",
          kind: "numeric",
          points: 1,
          prompt: "Frequency density for 15 ≤ t < 35",
          hints: [
            "Re-read what (c)(i) third is asking you to find.",
            "Use the data and method named in the question for (c)(i) third.",
          ],
          answer: 0.8,
          tolerance: 0,
        },
        {
          id: "c3",
          label: "(c)(ii)",
          kind: "text",
          points: 1,
          prompt: "Bar heights in cm for the three classes",
          hints: [
            "Re-read what (c)(ii) is asking you to find.",
            "Use the data and method named in the question for (c)(ii).",
          ],
          accepted: [
            "4, 5, 1.6",
            "4.0, 5.0, 1.6",
            "4 cm, 5 cm, 1.6 cm",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001002",
      type: "single_choice",
      points: 1,
      criterion: "B",
      number: 2,
      prompt: "The stem-and-leaf plot records 11 quiz scores (key: 2 | 4 = 24):\n\n[Figure: Quiz scores]\nWhat are the **mode** and **median** of these scores?",
      options: [
        {
          id: "7c490ad0-4d0a-4f4c-8194-71a98575ed7a",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mode 18, Med 24",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "1fd34cce-51c7-4a36-bbc2-cde08526bf96",
          label: "B",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mode 18, Med 26",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "72cf06a3-61cf-4608-adfe-9a8110222a5f",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mode 26, Med 18",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "7cb3161a-e53f-43f0-bde0-e398fad39f68",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mode 8, Med 26",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001032",
      type: "assess_parts",
      points: 10,
      criterion: "B",
      number: 2,
      prompt: "**QUESTION 2 · CRITERION B: INVESTIGATING PATTERNS [10 marks]**\n**(a)** Six ordered test scores are $\\{40, 42, 44, 46, 48, 50\\}$.\n**(i)** **Calculate** the mean, median and IQR of these 6 scores. [2]\n**(ii)** A seventh student scores $y = 10$. **Find** the new mean, median and IQR of all 7 scores. [2]\n**(b)** Suppose the seventh score is any value $y$ satisfying $0 \\le y \\le 40$.\n**(i)** **Write** a formula in terms of $y$ for the mean of the 7 scores. [1]\n**(ii)** **Investigate** the median and IQR for different values of $y$ in $0 \\le y \\le 40$, **state** a general rule, and **explain** mathematically why both remain invariant across this interval. [2]\n**(c)** **Compare** two 8-value datasets (in kg):\n• Set A: $\\{1, 2, 2, 3, 4, 11, 12, 13\\}$   • Set B: $\\{3, 4, 5, 6, 7, 13, 15, 17\\}$\n**(i)** **Compute** the exact mean of Set A and of Set B. [1]\n**(ii)** Group both sets into $0 \\le x < 10$ and $10 \\le x < 20$, **show** they produce the same grouped estimated mean, and **explain** why the midpoint estimate is exact for Set B but overestimates Set A. [2]",
      parts: [
        {
          id: "a1",
          label: "(a)(i) mean",
          kind: "numeric",
          points: 1,
          prompt: "Mean of the six scores",
          hints: [
            "Re-read what (a)(i) mean is asking you to find.",
            "Use the data and method named in the question for (a)(i) mean.",
          ],
          answer: 45,
          tolerance: 0,
        },
        {
          id: "a2",
          label: "(a)(i) median & IQR",
          kind: "text",
          points: 1,
          prompt: "Median and IQR of the six scores",
          hints: [
            "Re-read what (a)(i) median & IQR is asking you to find.",
            "Use the data and method named in the question for (a)(i) median & IQR.",
          ],
          accepted: [
            "45 and 6",
            "median 45, IQR 6",
            "45, 6",
          ],
        },
        {
          id: "a3",
          label: "(a)(ii) mean",
          kind: "numeric",
          points: 1,
          prompt: "New mean of all seven scores",
          hints: [
            "Re-read what (a)(ii) mean is asking you to find.",
            "Use the data and method named in the question for (a)(ii) mean.",
          ],
          answer: 40,
          tolerance: 0,
        },
        {
          id: "a4",
          label: "(a)(ii) median & IQR",
          kind: "text",
          points: 1,
          prompt: "New median and IQR of all seven scores",
          hints: [
            "Re-read what (a)(ii) median & IQR is asking you to find.",
            "Use the data and method named in the question for (a)(ii) median & IQR.",
          ],
          accepted: [
            "44 and 8",
            "median 44, IQR 8",
            "44, 8",
          ],
        },
        {
          id: "b1",
          label: "(b)(i)",
          kind: "expression",
          points: 1,
          prompt: "Formula for the mean of the seven scores",
          hints: [
            "Re-read what (b)(i) is asking you to find.",
            "Use the data and method named in the question for (b)(i).",
          ],
          accepted: [
            "(270+y)/7",
            "(y+270)/7",
            "270/7 + y/7",
          ],
        },
        {
          id: "b2",
          label: "(b)(ii) rule",
          kind: "text",
          points: 1,
          prompt: "State the rule for the median and IQR",
          hints: [
            "Re-read what (b)(ii) rule is asking you to find.",
            "Use the data and method named in the question for (b)(ii) rule.",
          ],
          accepted: [
            "Median 44 and IQR 8 for every y",
            "Median stays 44, IQR stays 8",
            "Both remain constant: median 44, IQR 8",
          ],
        },
        {
          id: "b3",
          label: "(b)(ii) explanation",
          kind: "text",
          points: 1,
          prompt: "Explain why the median and IQR stay invariant",
          hints: [
            "Re-read what (b)(ii) explanation is asking you to find.",
            "Use the data and method named in the question for (b)(ii) explanation.",
          ],
          accepted: [
            "y is always first, so the 2nd, 4th and 6th values do not change",
            "y occupies the first position so Q1, median and Q3 are unchanged",
          ],
        },
        {
          id: "c1",
          label: "(c)(i)",
          kind: "text",
          points: 1,
          prompt: "Exact means of Set A and Set B",
          hints: [
            "Re-read what (c)(i) is asking you to find.",
            "Use the data and method named in the question for (c)(i).",
          ],
          accepted: [
            "6.0 and 8.75",
            "6 and 8.75",
            "Set A 6, Set B 8.75",
          ],
        },
        {
          id: "c2",
          label: "(c)(ii) grouped mean",
          kind: "numeric",
          points: 1,
          prompt: "Common grouped estimated mean",
          hints: [
            "Re-read what (c)(ii) grouped mean is asking you to find.",
            "Use the data and method named in the question for (c)(ii) grouped mean.",
          ],
          unit: "kg",
          answer: 8.75,
          tolerance: 0,
        },
        {
          id: "c3",
          label: "(c)(ii) explanation",
          kind: "text",
          points: 1,
          prompt: "Explain why the midpoint estimate is exact for B but overestimates A",
          hints: [
            "Re-read what (c)(ii) explanation is asking you to find.",
            "Use the data and method named in the question for (c)(ii) explanation.",
          ],
          accepted: [
            "Set B class means equal the midpoints, but Set A values cluster near the lower boundaries",
            "B's values average to the midpoints; A's are lower within each class",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001003",
      type: "single_choice",
      points: 1,
      criterion: "C",
      number: 3,
      prompt: "Daily rainfall (mm) over 7 days in Porto-Novo: 12, 18, 15, 22, 15, 10, 20. The **mean** and **range** are:",
      options: [
        {
          id: "fef5738e-1a7b-4b2e-aa1b-39ef070b0155",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 16 mm, Range 12 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "c45c5ba6-bf3a-4250-8537-6539cf580963",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 15 mm, Range 12 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "266beddb-6c2c-4b94-8f2c-8285bac8748d",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 16 mm, Range 10 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "72f65e06-597e-4df5-a004-554f97facc58",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 15.5 mm, Range 8 mm",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001033",
      type: "assess_parts",
      points: 10,
      criterion: "C",
      number: 3,
      prompt: "**QUESTION 3 · CRITERION C: COMMUNICATING [10 marks]**\n**(a)** Standing broad-jump distances (cm) of 9 athletes before and after an 8-week plyometric programme:\n• **Before:** 115, 128, 122, 131, 119, 125, 135, 124, 118\n• **After:** 129, 142, 136, 148, 133, 139, 151, 144, 128\n**(i)** **Construct** an ordered back-to-back stem-and-leaf diagram (stems 11 to 15 in the centre) with a clear dual key. [3]\n**(ii)** **State** the median and range of each group and **write** two concise statistical sentences comparing performance. [2]\n**(b)** Kofi surveyed delivery distances $d$ (km) for 50 orders: $0 \\le d < 10$ $(f=12)$, $10 \\le d < 20$ $(f=18)$, $20 \\le d < 40$ $(f=20)$, and drew the chart shown.\n\n[Figure: Kofi's delivery-distance chart]\n**(i)** **Identify** two statistical errors in Kofi's chart. [2]\n**(ii)** **Calculate** the frequency densities and **draw** a correctly scaled histogram on your paper. [3]",
      parts: [
        {
          id: "a2",
          label: "(a)(ii) medians and ranges",
          kind: "text",
          points: 1,
          prompt: "Median and range for each group",
          hints: [
            "Re-read what (a)(ii) medians and ranges is asking you to find.",
            "Use the data and method named in the question for (a)(ii) medians and ranges.",
          ],
          accepted: [
            "Before 124 cm range 20 cm; after 139 cm range 23 cm",
            "Before median 124, range 20; After median 139, range 23",
          ],
        },
        {
          id: "a3",
          label: "(a)(ii) comparison",
          kind: "text",
          points: 1,
          prompt: "Two concise statistical sentences comparing performance",
          hints: [
            "Re-read what (a)(ii) comparison is asking you to find.",
            "Use the data and method named in the question for (a)(ii) comparison.",
          ],
          accepted: [
            "The median increased by 15 cm, so typical performance improved; the range increased by 3 cm, so spread increased slightly",
            "Median improved by 15 cm but range is 3 cm larger",
          ],
        },
        {
          id: "b1",
          label: "(b)(i) error 1",
          kind: "text",
          points: 1,
          prompt: "First statistical error in Kofi's chart",
          hints: [
            "Re-read what (b)(i) error 1 is asking you to find.",
            "Use the data and method named in the question for (b)(i) error 1.",
          ],
          accepted: [
            "Gaps between bars / equal bar widths for continuous unequal classes",
            "The bars have gaps and equal widths although the classes are continuous and unequal",
          ],
        },
        {
          id: "b2",
          label: "(b)(i) error 2",
          kind: "text",
          points: 1,
          prompt: "Second statistical error in Kofi's chart",
          hints: [
            "Re-read what (b)(i) error 2 is asking you to find.",
            "Use the data and method named in the question for (b)(i) error 2.",
          ],
          accepted: [
            "Raw frequency plotted instead of frequency density",
            "The vertical axis should be frequency density",
          ],
        },
        {
          id: "b3",
          label: "(b)(ii) frequency densities",
          kind: "text",
          points: 2,
          prompt: "Frequency densities for the three classes",
          hints: [
            "Re-read what (b)(ii) frequency densities is asking you to find.",
            "Use the data and method named in the question for (b)(ii) frequency densities.",
          ],
          accepted: [
            "1.2, 1.8, 1.0",
            "1.2 1.8 1.0",
            "1.2, 1.8 and 1.0",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001004",
      type: "single_choice",
      points: 1,
      criterion: "D",
      number: 4,
      prompt: "Bolt lengths measured to the nearest millimetre are grouped in the class 50–59 mm. Its actual **class width** and **midpoint** are:",
      options: [
        {
          id: "6bc7e0a6-f8be-4fa0-834f-45c730a78431",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Width 9 mm, Mid 54.5 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "00d0bb1f-9f32-4aa9-a5a0-a6325736a561",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Width 10 mm, Mid 55 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "bdc630f9-66ec-4eb1-93a7-10eff990b620",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Width 10 mm, Mid 54.5 mm",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "dcb0c6bd-368e-4ac1-976c-f7f5a1284264",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Width 9 mm, Mid 54 mm",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001034",
      type: "assess_parts",
      points: 10,
      criterion: "D",
      number: 4,
      prompt: "**QUESTION 4 · CRITERION D: REAL-LIFE CONTEXTS [10 marks]**\n**(a)** An Allada pineapple cannery checks a population batch of 8 cans:\nNet mass x (g)\n | 398\n | 399\n | 400\n | 401\n | 402\n\nNumber of cans f\n | 1\n | 2\n | 2\n | 2\n | 1\n\nQuality control requires $399.5 \\le \\mu \\le 400.5$ g and $\\sigma \\le 1.20$ g. **Calculate** $\\mu$ and $\\sigma$ (to 2 d.p.) and **determine** whether the batch passes both rules. [4]\n**(b)** Daily solar energy generated over 30 days at a Cotonou clinic:\nOutput E (kWh)\n | 8 ≤ E < 12\n | 12 ≤ E < 16\n | 16 ≤ E < 20\n | 20 ≤ E < 24\n\nNumber of days\n | 5\n | 13\n | 9\n | 3\n\nThe clinic requires at least 450 kWh over the 30 days to run its vaccine refrigerators without grid backup. **Estimate** the total energy generated and daily mean, and **advise** the clinic director. [3]\n**(c)** A coastal weather station must choose between two sensor-battery brands (lifetimes in months) and requires at least 34 months of uninterrupted operation before scheduled maintenance:\n• Brand Alpha: $\\mu = 36.4$, $\\sigma = 0.9$, IQR = 1.4\n• Brand Beta: $\\mu = 38.0$, $\\sigma = 3.4$, IQR = 5.2\n**Recommend** one brand using both centre and spread, and **state** one real-world limitation of relying only on summary statistics. [3]",
      parts: [
        {
          id: "a1",
          label: "(a) mean",
          kind: "numeric",
          points: 1,
          prompt: "Population mean μ (2 d.p.)",
          hints: [
            "Re-read what (a) mean is asking you to find.",
            "Use the data and method named in the question for (a) mean.",
          ],
          unit: "g",
          answer: 400,
          tolerance: 0,
        },
        {
          id: "a2",
          label: "(a) variance",
          kind: "numeric",
          points: 1,
          prompt: "Population variance σ²",
          hints: [
            "Re-read what (a) variance is asking you to find.",
            "Use the data and method named in the question for (a) variance.",
          ],
          unit: "g²",
          answer: 1.5,
          tolerance: 0,
        },
        {
          id: "a3",
          label: "(a) standard deviation",
          kind: "numeric",
          points: 1,
          prompt: "Population standard deviation σ (2 d.p.)",
          hints: [
            "Re-read what (a) standard deviation is asking you to find.",
            "Use the data and method named in the question for (a) standard deviation.",
          ],
          unit: "g",
          answer: 1.22,
          tolerance: 0,
        },
        {
          id: "a4",
          label: "(a) decision",
          kind: "text",
          points: 1,
          prompt: "Does the batch pass both rules?",
          hints: [
            "Re-read what (a) decision is asking you to find.",
            "Use the data and method named in the question for (a) decision.",
          ],
          accepted: [
            "No, σ = 1.22 g > 1.20 g",
            "No — standard deviation exceeds 1.20 g",
            "Fails because σ exceeds 1.20 g",
          ],
        },
        {
          id: "b1",
          label: "(b) total",
          kind: "numeric",
          points: 1,
          prompt: "Estimated 30-day total energy",
          hints: [
            "Re-read what (b) total is asking you to find.",
            "Use the data and method named in the question for (b) total.",
          ],
          unit: "kWh",
          answer: 460,
          tolerance: 0,
        },
        {
          id: "b2",
          label: "(b) daily mean",
          kind: "numeric",
          points: 1,
          prompt: "Estimated daily mean energy (2 d.p.)",
          hints: [
            "Re-read what (b) daily mean is asking you to find.",
            "Use the data and method named in the question for (b) daily mean.",
          ],
          unit: "kWh/day",
          answer: 15.33,
          tolerance: 0,
        },
        {
          id: "b3",
          label: "(b) advice",
          kind: "text",
          points: 1,
          prompt: "Advice to the clinic director",
          hints: [
            "Re-read what (b) advice is asking you to find.",
            "Use the data and method named in the question for (b) advice.",
          ],
          accepted: [
            "The target is met (460 kWh ≥ 450 kWh), but the margin is small",
            "Yes, 460 kWh exceeds 450 kWh; only a 10 kWh margin",
          ],
        },
        {
          id: "c1",
          label: "(c) recommendation",
          kind: "text",
          points: 1,
          prompt: "Recommended brand",
          hints: [
            "Re-read what (c) recommendation is asking you to find.",
            "Use the data and method named in the question for (c) recommendation.",
          ],
          accepted: [
            "Brand Alpha",
            "Alpha",
          ],
        },
        {
          id: "c2",
          label: "(c) reason",
          kind: "text",
          points: 1,
          prompt: "Reason using both centre and spread",
          hints: [
            "Re-read what (c) reason is asking you to find.",
            "Use the data and method named in the question for (c) reason.",
          ],
          accepted: [
            "Beta has a higher mean but much larger spread, so Alpha is more reliable above 34 months",
            "Alpha has a slightly lower mean but much smaller σ and IQR, so fewer batteries fall below 34 months",
          ],
        },
        {
          id: "c3",
          label: "(c) limitation",
          kind: "text",
          points: 1,
          prompt: "One real-world limitation of relying only on summary statistics",
          hints: [
            "Re-read what (c) limitation is asking you to find.",
            "Use the data and method named in the question for (c) limitation.",
          ],
          accepted: [
            "Summary statistics hide the shape of the distribution and the test conditions",
            "They do not show sample size, distribution shape, cost or coastal conditions",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001005",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 5,
      prompt: "The histogram shows waiting times $t$ (min) of customers at a pharmacy (intervals $a \\le t < b$). **How many waited at least 10 minutes?**\n\n[Figure: Waiting times at a pharmacy]",
      options: [
        {
          id: "b243a892-d744-465c-824e-0570e1e72fb9",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "12",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "7fb4e00c-8706-4969-8679-4207fdaa5951",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "14",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "a64f9382-5cc4-4d22-920a-10ba28828ab9",
          label: "C",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "20",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "88d58c44-dccc-4eac-80d1-d166c253c1f8",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "34",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001006",
      type: "single_choice",
      points: 1,
      criterion: "C",
      number: 6,
      prompt: "Heights $h$ (cm) of 40 seedlings: $0 \\le h < 10$ $(f=5)$, $10 \\le h < 20$ $(f=12)$, $20 \\le h < 30$ $(f=16)$, $30 \\le h < 40$ $(f=7)$. Which statement is true?",
      options: [
        {
          id: "fb598906-e148-4b6d-a168-263e1e7b53b5",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Modal 10–20; Med 20–30",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "39407ba6-adb4-43f9-aecd-5a022a7d2e91",
          label: "B",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Both are 20 ≤ h < 30",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "50f1c98a-3191-4b9e-851a-bb43325180a9",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Modal 20–30; Med 10–20",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "1fab2450-413a-48d7-be34-c8a91f3a7c52",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Both are 10 ≤ h < 20",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001007",
      type: "single_choice",
      points: 1,
      criterion: "A",
      number: 7,
      prompt: "The box-and-whisker plot summarises battery lifetimes (hours):\n\n[Figure: Battery lifetimes]\nWhat is the **IQR**, and what percentage of batteries lasted **less than 50 hours**?",
      options: [
        {
          id: "0a4d47db-144c-4c83-a977-7735c9bd8b1f",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "IQR = 56, 75%",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "5a999ac7-4282-42c1-a08f-8207efa96bc3",
          label: "B",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "IQR = 26, 75%",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "b47b145a-348a-43d8-be66-e61ced7525dd",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "IQR = 26, 50%",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "0d8502b1-cee5-49aa-9e26-e9a1d46b3dfb",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "IQR = 16, 75%",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001008",
      type: "single_choice",
      points: 1,
      criterion: "C",
      number: 8,
      prompt: "Five parcels weigh 3, 4, 4, 5, 6 kg. A sixth parcel of 26 kg is added. How do the **mean** and **median** change?",
      options: [
        {
          id: "f0c04f44-eb08-4717-90dc-d4eac8544b2f",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 4.4→8; Med 4→4.5",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "d9dc577a-3db6-4b61-b73d-95404ad6e202",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean 4.4→6; Med stays 4",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "e94744dc-dab6-49d5-b751-7215c17f466a",
          label: "C",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Mean stays 4.4; Med 4→8",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "09206380-0216-4e87-9201-e510bb769951",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Both increase by 3.6 kg",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001009",
      type: "single_choice",
      points: 1,
      criterion: "D",
      number: 9,
      prompt: "The population $\\{3, 6, 9, 12, 15\\}$ has mean $\\mu = 9$. Its exact population standard deviation $\\sigma$ is:",
      options: [
        {
          id: "fcbf37df-2043-4572-a4f4-9f98f6f81012",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "18",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "34edb9db-6120-4854-918e-b321d54f2f2f",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "3",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "234f8a10-d7b8-428e-aa32-745380827386",
          label: "C",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "mathInline",
                    attrs: {
                      latex: "3\\sqrt{2}",
                    },
                  },
                ],
              },
            ],
          },
        },
        {
          id: "9340aa26-079f-4827-9f27-addf1a8228fe",
          label: "D",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "mathInline",
                    attrs: {
                      latex: "\\sqrt{15}",
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001010",
      type: "true_false",
      points: 1,
      criterion: "A",
      number: 10,
      prompt: "For the continuous class $15 \\le x < 25$, the class width is 10 and the midpoint is 20",
      options: [
        {
          id: "f7842dd1-d688-4338-bd94-de08cbadce91",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "True",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "404929e8-3f07-4f14-a3ca-e032a38d6bd8",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "False",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001011",
      type: "true_false",
      points: 1,
      criterion: "A",
      number: 11,
      prompt: "In an unequal-width histogram, vertical bar height represents frequency density so bar area is proportional to frequency.",
      options: [
        {
          id: "8569c7f4-2c0f-4b5e-bca7-75160adc477e",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "True",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "ce019866-12b7-4aff-88f4-d51c996653a6",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "False",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001012",
      type: "true_false",
      points: 1,
      criterion: "C",
      number: 12,
      prompt: "Adding 5 marks to every score in a class increases both the mean $\\mu$ and standard deviation $\\sigma$ by 5.",
      options: [
        {
          id: "3b850e0f-109b-43d2-8cb1-4feb07278d17",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "True",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "deac8976-356b-4ef5-b05e-92aea1484102",
          label: "B",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "False",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001013",
      type: "true_false",
      points: 1,
      criterion: "B",
      number: 13,
      prompt: "The interquartile range (IQR) is directly affected if the maximum value is replaced by an extreme outlier.",
      options: [
        {
          id: "7ce6b068-d17c-4f76-95b6-560bf2ddf4cd",
          label: "A",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "True",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "b08b84a5-f65d-4885-aad2-a00416a4b3f1",
          label: "B",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "False",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001014",
      type: "true_false",
      points: 1,
      criterion: "A",
      number: 14,
      prompt: "A bar graph with gaps between bars is suitable for qualitative or ungrouped discrete data.",
      options: [
        {
          id: "33f71eb3-8e3e-47e6-8b61-0bcfa96ed10a",
          label: "A",
          is_correct: true,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "True",
                  },
                ],
              },
            ],
          },
        },
        {
          id: "a72001b2-d32f-4c98-a012-e81908299450",
          label: "B",
          is_correct: false,
          content_doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "False",
                  },
                ],
              },
            ],
          },
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001015",
      type: "matching",
      points: 4,
      criterion: "C",
      number: 15,
      prompt: "MATCHING Q15–18 · write one letter, P to T, in each box · 1 mark each\\n\\n[Figure: table]\\n\\n15. Ordered display retaining every exact raw value\\n16. Quantity plotted vertically on an unequal-width histogram\\n17. Smooth curve plotted at upper class boundaries to estimate quartiles\\n18. Average of the squared deviations of all data values from μ",
    },
    {
      id: "cd000000-0000-4000-8000-000000001001019",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 19,
      prompt: "Six mangoes have a mean mass of 240 g. A seventh mango is added, raising the mean of all seven to 250 g. [3]\n**(a)** Total mass of the six  **(b)** Mass of the seventh mango",
      parts: [
        {
          id: "a",
          label: "(a)",
          kind: "numeric",
          points: 1,
          prompt: "Total mass of the six mangoes",
          hints: [
            "Re-read what (a) is asking you to find.",
            "Use the data and method named in the question for (a).",
          ],
          unit: "g",
          answer: 1440,
          tolerance: 0,
        },
        {
          id: "b",
          label: "(b)",
          kind: "numeric",
          points: 2,
          prompt: "Mass of the seventh mango",
          hints: [
            "Re-read what (b) is asking you to find.",
            "Use the data and method named in the question for (b).",
          ],
          unit: "g",
          answer: 310,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001020",
      type: "assess_parts",
      points: 4,
      criterion: "A",
      number: 20,
      prompt: "Masses $m$ (g) of 20 tilapia fillets: 8 fillets in $120 \\le m < 160$ and 12 fillets in $160 \\le m < 200$. [4]\n**(a)** Midpoints of the two classes  **(b)** Estimated mean mass",
      parts: [
        {
          id: "a1",
          label: "Midpoint 1",
          kind: "numeric",
          points: 1,
          prompt: "Midpoint of $120 \\le m < 160$",
          hints: [
            "Re-read what Midpoint 1 is asking you to find.",
            "Use the data and method named in the question for Midpoint 1.",
          ],
          unit: "g",
          answer: 140,
          tolerance: 0,
        },
        {
          id: "a2",
          label: "Midpoint 2",
          kind: "numeric",
          points: 1,
          prompt: "Midpoint of $160 \\le m < 200$",
          hints: [
            "Re-read what Midpoint 2 is asking you to find.",
            "Use the data and method named in the question for Midpoint 2.",
          ],
          unit: "g",
          answer: 180,
          tolerance: 0,
        },
        {
          id: "b1",
          label: "Weighted total",
          kind: "numeric",
          points: 1,
          prompt: "Calculate $\\Sigma fm$",
          hints: [
            "Re-read what Weighted total is asking you to find.",
            "Use the data and method named in the question for Weighted total.",
          ],
          answer: 3280,
          tolerance: 0,
        },
        {
          id: "b2",
          label: "Estimated mean",
          kind: "numeric",
          points: 1,
          prompt: "Estimated mean mass",
          hints: [
            "Re-read what Estimated mean is asking you to find.",
            "Use the data and method named in the question for Estimated mean.",
          ],
          unit: "g",
          answer: 164,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001021",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 21,
      prompt: "The ogive shows test scores (out of 80) of 120 students, passing through (40, 30), (50, 60) and (60, 90). Distinction requires **more than 60 marks**. [3]\n\n[Figure: Test scores of 120 students]\n**Median:**   **$Q_1$:**   **Distinction students:**",
      parts: [
        {
          id: "q1",
          label: "Q1",
          kind: "numeric",
          points: 1,
          prompt: "Lower quartile",
          hints: [
            "Re-read what Q1 is asking you to find.",
            "Use the data and method named in the question for Q1.",
          ],
          unit: "marks",
          answer: 40,
          tolerance: 0,
        },
        {
          id: "med",
          label: "Median",
          kind: "numeric",
          points: 1,
          prompt: "Median score",
          hints: [
            "Re-read what Median is asking you to find.",
            "Use the data and method named in the question for Median.",
          ],
          unit: "marks",
          answer: 50,
          tolerance: 0,
        },
        {
          id: "dist",
          label: "Distinction students",
          kind: "numeric",
          points: 1,
          prompt: "Number of students with more than 60 marks",
          hints: [
            "Re-read what Distinction students is asking you to find.",
            "Use the data and method named in the question for Distinction students.",
          ],
          unit: "students",
          answer: 30,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001022",
      type: "assess_parts",
      points: 3,
      criterion: "D",
      number: 22,
      prompt: "The unequal-width histogram shows trunk diameters $d$ (cm) in a teak plot across 0–10, 10–25 and 25–45 cm. [3]\n\n[Figure: Trunk diameters in a teak plot]\n**(a)** Trees in 10–25 cm  **(b)** Total trees in the plot",
      parts: [
        {
          id: "a",
          label: "(a)",
          kind: "numeric",
          points: 1,
          prompt: "Number of trees in 10–25 cm",
          hints: [
            "Re-read what (a) is asking you to find.",
            "Use the data and method named in the question for (a).",
          ],
          unit: "trees",
          answer: 30,
          tolerance: 0,
        },
        {
          id: "b1",
          label: "Outer classes",
          kind: "numeric",
          points: 1,
          prompt: "Total trees in 0–10 cm and 25–45 cm",
          hints: [
            "Re-read what Outer classes is asking you to find.",
            "Use the data and method named in the question for Outer classes.",
          ],
          unit: "trees",
          answer: 32,
          tolerance: 0,
        },
        {
          id: "b2",
          label: "(b)",
          kind: "numeric",
          points: 1,
          prompt: "Total trees in the plot",
          hints: [
            "Re-read what (b) is asking you to find.",
            "Use the data and method named in the question for (b).",
          ],
          unit: "trees",
          answer: 62,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001023",
      type: "assess_parts",
      points: 5,
      criterion: "A",
      number: 23,
      prompt: "Five maize plants have heights (cm): 11, 14, 15, 17, 18 (treat as a complete population). Find: [5]\n**Range:**   **Median:**   **Mean $\\mu$:**   **Variance $\\sigma^2$:**   **SD $\\sigma$ (2 d.p.):**",
      parts: [
        {
          id: "range",
          label: "Range",
          kind: "numeric",
          points: 1,
          prompt: "Range",
          hints: [
            "Re-read what Range is asking you to find.",
            "Use the data and method named in the question for Range.",
          ],
          unit: "cm",
          answer: 7,
          tolerance: 0,
        },
        {
          id: "median",
          label: "Median",
          kind: "numeric",
          points: 1,
          prompt: "Median",
          hints: [
            "Re-read what Median is asking you to find.",
            "Use the data and method named in the question for Median.",
          ],
          unit: "cm",
          answer: 15,
          tolerance: 0,
        },
        {
          id: "mean",
          label: "Mean",
          kind: "numeric",
          points: 1,
          prompt: "Population mean μ",
          hints: [
            "Re-read what Mean is asking you to find.",
            "Use the data and method named in the question for Mean.",
          ],
          unit: "cm",
          answer: 15,
          tolerance: 0,
        },
        {
          id: "var",
          label: "Variance",
          kind: "numeric",
          points: 1,
          prompt: "Population variance σ²",
          hints: [
            "Re-read what Variance is asking you to find.",
            "Use the data and method named in the question for Variance.",
          ],
          unit: "cm²",
          answer: 6,
          tolerance: 0,
        },
        {
          id: "sd",
          label: "SD",
          kind: "numeric",
          points: 1,
          prompt: "Population standard deviation σ (2 d.p.)",
          hints: [
            "Re-read what SD is asking you to find.",
            "Use the data and method named in the question for SD.",
          ],
          unit: "cm",
          answer: 2.45,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001024",
      type: "assess_parts",
      points: 4,
      criterion: "D",
      number: 24,
      prompt: "Daily solar output (kWh) summary: Min = 140, $Q_1$ = 200, Median = 225, $Q_3$ = 240, Max = 315. Using the $1.5 \\times IQR$ criterion: [4]\n**IQR:**   **Lower fence:**   **Upper fence:**   **Are any values outliers? (Yes/No + value):**",
      parts: [
        {
          id: "iqr",
          label: "IQR",
          kind: "numeric",
          points: 1,
          prompt: "Interquartile range",
          hints: [
            "Re-read what IQR is asking you to find.",
            "Use the data and method named in the question for IQR.",
          ],
          unit: "kWh",
          answer: 40,
          tolerance: 0,
        },
        {
          id: "low",
          label: "Lower fence",
          kind: "numeric",
          points: 1,
          prompt: "Lower fence",
          hints: [
            "Re-read what Lower fence is asking you to find.",
            "Use the data and method named in the question for Lower fence.",
          ],
          unit: "kWh",
          answer: 140,
          tolerance: 0,
        },
        {
          id: "high",
          label: "Upper fence",
          kind: "numeric",
          points: 1,
          prompt: "Upper fence",
          hints: [
            "Re-read what Upper fence is asking you to find.",
            "Use the data and method named in the question for Upper fence.",
          ],
          unit: "kWh",
          answer: 300,
          tolerance: 0,
        },
        {
          id: "out",
          label: "Outliers",
          kind: "text",
          points: 1,
          prompt: "Are there outliers? Write Yes or No and the value.",
          hints: [
            "Re-read what Outliers is asking you to find.",
            "Use the data and method named in the question for Outliers.",
          ],
          accepted: [
            "Yes, 315",
            "Yes 315 kWh",
            "Yes — 315",
            "Yes (315)",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001025",
      type: "assess_parts",
      points: 4,
      criterion: "A",
      number: 25,
      prompt: "**Complete** the missing entries in this continuous grouped table: [4]\nTime t (min)\n | Class width\n | Frequency\n | Freq. density\n\n0 ≤ t < 10\n | 10\n | 15\n | (a) ________\n\n10 ≤ t < 25\n | (b) ________\n | 36\n | (c) ________\n\n25 ≤ t < 45\n | 20\n | (d) ________\n | 0.6\n\n**(a)** Frequency density   **(b)** Class width   **(c)** Frequency density   **(d)** Frequency",
      parts: [
        {
          id: "a",
          label: "(a)",
          kind: "numeric",
          points: 1,
          prompt: "Frequency density for 0 ≤ t < 10",
          hints: [
            "Re-read what (a) is asking you to find.",
            "Use the data and method named in the question for (a).",
          ],
          answer: 1.5,
          tolerance: 0,
        },
        {
          id: "b",
          label: "(b)",
          kind: "numeric",
          points: 1,
          prompt: "Class width for 10 ≤ t < 25",
          hints: [
            "Re-read what (b) is asking you to find.",
            "Use the data and method named in the question for (b).",
          ],
          unit: "min",
          answer: 15,
          tolerance: 0,
        },
        {
          id: "c",
          label: "(c)",
          kind: "numeric",
          points: 1,
          prompt: "Frequency density for 10 ≤ t < 25",
          hints: [
            "Re-read what (c) is asking you to find.",
            "Use the data and method named in the question for (c).",
          ],
          answer: 2.4,
          tolerance: 0,
        },
        {
          id: "d",
          label: "(d)",
          kind: "numeric",
          points: 1,
          prompt: "Frequency for 25 ≤ t < 45",
          hints: [
            "Re-read what (d) is asking you to find.",
            "Use the data and method named in the question for (d).",
          ],
          answer: 12,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001026",
      type: "assess_parts",
      points: 3,
      criterion: "B",
      number: 26,
      prompt: "Commute times: $0 \\le t < 10$ $(f=6)$, $10 \\le t < 20$ $(f=k)$, $20 \\le t < 30$ $(f=9)$. Given the estimated mean is 16 min: [3]\n$6(5) + 9(25) =$ ______  $\\Rightarrow$  $k =$ ______",
      parts: [
        {
          id: "sum",
          label: "Weighted total",
          kind: "numeric",
          points: 1,
          prompt: "Calculate $6(5) + 9(25)$",
          hints: [
            "Re-read what Weighted total is asking you to find.",
            "Use the data and method named in the question for Weighted total.",
          ],
          answer: 255,
          tolerance: 0,
        },
        {
          id: "k",
          label: "k",
          kind: "numeric",
          points: 2,
          prompt: "Find k",
          hints: [
            "Re-read what k is asking you to find.",
            "Use the data and method named in the question for k.",
          ],
          answer: 15,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001027",
      type: "assess_parts",
      points: 3,
      criterion: "B",
      number: 27,
      prompt: "Sensor readings $x$ have mean $\\mu_x = 30$ and SD $\\sigma_x = 2.5$. Each value is rescaled by $y = 2x - 10$. **Find:** [3]\n**$\\mu_y$:**   **$\\sigma_y$:**   **Variance $\\sigma_y^2$:**",
      parts: [
        {
          id: "mean",
          label: "Mean",
          kind: "numeric",
          points: 1,
          prompt: "Mean μy",
          hints: [
            "Re-read what Mean is asking you to find.",
            "Use the data and method named in the question for Mean.",
          ],
          answer: 50,
          tolerance: 0,
        },
        {
          id: "sd",
          label: "SD",
          kind: "numeric",
          points: 1,
          prompt: "Standard deviation σy",
          hints: [
            "Re-read what SD is asking you to find.",
            "Use the data and method named in the question for SD.",
          ],
          answer: 5,
          tolerance: 0,
        },
        {
          id: "var",
          label: "Variance",
          kind: "numeric",
          points: 1,
          prompt: "Variance σy²",
          hints: [
            "Re-read what Variance is asking you to find.",
            "Use the data and method named in the question for Variance.",
          ],
          answer: 25,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001028",
      type: "assess_parts",
      points: 3,
      criterion: "B",
      number: 28,
      prompt: "Five equally spaced integers $\\{12, 16, 20, 24, 28\\}$ (step $d = 4$): [3]\n**μ:**   **Exact σ:**   **Step $d>0$ for $\\sigma = 5\\sqrt{2}$:**",
      parts: [
        {
          id: "mean",
          label: "Mean",
          kind: "numeric",
          points: 1,
          prompt: "Mean μ",
          hints: [
            "Re-read what Mean is asking you to find.",
            "Use the data and method named in the question for Mean.",
          ],
          answer: 20,
          tolerance: 0,
        },
        {
          id: "sd",
          label: "Exact σ",
          kind: "text",
          points: 1,
          prompt: "Exact population standard deviation",
          hints: [
            "Re-read what Exact σ is asking you to find.",
            "Use the data and method named in the question for Exact σ.",
          ],
          accepted: [
            "4√2",
            "4 sqrt 2",
            "4root2",
            "√32",
            "5.66",
          ],
        },
        {
          id: "d",
          label: "Step",
          kind: "numeric",
          points: 1,
          prompt: "Step d for σ = 5√2",
          hints: [
            "Re-read what Step is asking you to find.",
            "Use the data and method named in the question for Step.",
          ],
          answer: 5,
          tolerance: 0,
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001029",
      type: "assess_parts",
      points: 4,
      criterion: "C",
      number: 29,
      prompt: "Parallel box plots compare delivery times (min) of Fast and Express couriers: [4]\n\n[Figure: Fast courier delivery times]\n\n[Figure: Express courier delivery times]\n**Fast Med:**   **Fast IQR:**   **Express IQR:**   **More consistent:**",
      parts: [
        {
          id: "med",
          label: "Fast Med",
          kind: "numeric",
          points: 1,
          prompt: "Fast median delivery time",
          hints: [
            "Re-read what Fast Med is asking you to find.",
            "Use the data and method named in the question for Fast Med.",
          ],
          unit: "min",
          answer: 22,
          tolerance: 0,
        },
        {
          id: "fast",
          label: "Fast IQR",
          kind: "numeric",
          points: 1,
          prompt: "Fast interquartile range",
          hints: [
            "Re-read what Fast IQR is asking you to find.",
            "Use the data and method named in the question for Fast IQR.",
          ],
          unit: "min",
          answer: 10,
          tolerance: 0,
        },
        {
          id: "express",
          label: "Express IQR",
          kind: "numeric",
          points: 1,
          prompt: "Express interquartile range",
          hints: [
            "Re-read what Express IQR is asking you to find.",
            "Use the data and method named in the question for Express IQR.",
          ],
          unit: "min",
          answer: 20,
          tolerance: 0,
        },
        {
          id: "more",
          label: "More consistent",
          kind: "text",
          points: 1,
          prompt: "Which courier is more consistent?",
          hints: [
            "Re-read what More consistent is asking you to find.",
            "Use the data and method named in the question for More consistent.",
          ],
          accepted: [
            "Fast",
            "Fast courier",
            "Fast is more consistent",
          ],
        },
      ],
    },
    {
      id: "cd000000-0000-4000-8000-000000001001030",
      type: "assess_parts",
      points: 3,
      criterion: "C",
      number: 30,
      prompt: "**Classify** each variable (Qualitative / Discrete / Continuous) and **state** an appropriate display (Bar graph or Histogram): [3]\nVariable\n | Data Type\n | Suitable Display\n\nFavourite sport\n | ________\n | ________\n\nGoals per match\n | ________\n | ________\n\n100 m time (s)\n | ________\n | ________",
      parts: [
        {
          id: "sport",
          label: "Favourite sport",
          kind: "text",
          points: 1,
          prompt: "Data type and suitable display for favourite sport",
          hints: [
            "Re-read what Favourite sport is asking you to find.",
            "Use the data and method named in the question for Favourite sport.",
          ],
          accepted: [
            "Qualitative, Bar graph",
            "Qualitative bar graph",
            "Qualitative; bar chart",
          ],
        },
        {
          id: "goals",
          label: "Goals per match",
          kind: "text",
          points: 1,
          prompt: "Data type and suitable display for goals per match",
          hints: [
            "Re-read what Goals per match is asking you to find.",
            "Use the data and method named in the question for Goals per match.",
          ],
          accepted: [
            "Discrete, Bar graph",
            "Discrete bar graph",
            "Discrete; bar chart",
          ],
        },
        {
          id: "time",
          label: "100 m time (s)",
          kind: "text",
          points: 1,
          prompt: "Data type and suitable display for 100 m time",
          hints: [
            "Re-read what 100 m time (s) is asking you to find.",
            "Use the data and method named in the question for 100 m time (s).",
          ],
          accepted: [
            "Continuous, Histogram",
            "Continuous histogram",
            "Continuous; histogram",
          ],
        },
      ],
    },
  ],
  answers: {
    "cd000000-0000-4000-8000-000000001001001": {
      answer: {
        option_id: "d38d0ddf-ff90-46ba-89a3-d962781e756e",
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001031": {
      answer: {
        parts: {
          a1: "lower 29,5  and upper 39,5",
          a2: "30-39",
          a3: "1945",
          a4: "38,9",
        },
      },
      points_awarded: 4,
      marker_note: "MYP4 C B Q1: (a)(i) boundaries \"29,5 and 39,5\" (comma decimal) exact A1; (a)(ii) 30-39 A1; (a)(iii) weighted total 1945 M1, mean 38.9 A1. Awarded 4/10.",
    },
    "cd000000-0000-4000-8000-000000001001002": {
      answer: {
        option_id: "1fd34cce-51c7-4a36-bbc2-cde08526bf96",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001032": {
      answer: {
        parts: {
          a1: "45",
          a2: "median is 45 and IQR is 6",
          a3: "40",
          a4: "new median 46 IQR is  8",
          b1: "summation of freaquency times midpoint over summation of frequency",
          b2: "to find the median you calculate the position by doing n+1/2  then you look fo the number a tha position. To find the IQR  you divide the data set into two equal side without considerind the median at the middle then you look for the lower quartile in the data at the left and the upper quartile for the data at the right and after you upper quanrtile -  lower quartile",
          b3: "they stay invariant because something change in the data set it changes also",
          c1: "set A: 6     Set B: 8,75",
          c2: "7,375",
          c3: "becuse the summation of all daata set in b is exact",
        },
      },
      points_awarded: 4,
      marker_note: "MYP4 C B Q2: (a)(i) 45 A1, Med 45 & IQR 6 A1; (a)(ii) 40 A1; (c)(i) Set A=6, Set B=8,75 (comma decimal) A1 (generic b2 definition not credited). Awarded 4/10.",
    },
    "cd000000-0000-4000-8000-000000001001003": {
      answer: {
        option_id: "72f65e06-597e-4df5-a004-554f97facc58",
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001033": {
      answer: {
        parts: {
          a2: "range before 20 range after 20 median before 124 median after 139",
          a3: "range before 20 range after 20 median before 124 median after 139",
          b1: "The error is that his data was suppose to be on a histogram not bar chat",
          b2: "The error is that his data was suppose to be on a histogram not bar chat",
          b3: "1,2--1,8--1",
        },
      },
      points_awarded: 6,
      marker_note: "MYP4 C B Q3: (a)(i) Complete ordered back-to-back stem-and-leaf in working.a2 (3/3); (a)(ii) After range 20 wrong (0); (b)(ii) FDs 1.2, 1.8, 1 (comma decimals) (2/2) + corrected histogram in working.b3 (1/1). Awarded 6/10.",
    },
    "cd000000-0000-4000-8000-000000001001004": {
      answer: {
        option_id: "bdc630f9-66ec-4eb1-93a7-10eff990b620",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001034": {
      answer: {
        parts: {
          b3: "the clinic director should use brand with the lowest Iqr",
          c1: "the recommended brand is brand alpha",
        },
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001005": {
      answer: {
        option_id: "a64f9382-5cc4-4d22-920a-10ba28828ab9",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001006": {
      answer: {
        option_id: "39407ba6-adb4-43f9-aecd-5a022a7d2e91",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001007": {
      answer: {
        option_id: "0a4d47db-144c-4c83-a977-7735c9bd8b1f",
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001008": {
      answer: {
        option_id: "f0c04f44-eb08-4717-90dc-d4eac8544b2f",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001009": {
      answer: {
        option_id: "234f8a10-d7b8-428e-aa32-745380827386",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001010": {
      answer: {
        option_id: "f7842dd1-d688-4338-bd94-de08cbadce91",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001011": {
      answer: {
        option_id: "8569c7f4-2c0f-4b5e-bca7-75160adc477e",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001012": {
      answer: {
        option_id: "3b850e0f-109b-43d2-8cb1-4feb07278d17",
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001013": {
      answer: {
        option_id: "7ce6b068-d17c-4f76-95b6-560bf2ddf4cd",
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001014": {
      answer: {
        option_id: "33f71eb3-8e3e-47e6-8b61-0bcfa96ed10a",
      },
      points_awarded: 1,
    },
    "cd000000-0000-4000-8000-000000001001015": {
      answer: {
        pairs: [
          {
            left: "Smooth curve plotted at upper class boundaries to estimate quartiles",
            right: "S",
          },
          {
            left: "Average of the squared deviations of all data values from μ",
            right: "R",
          },
          {
            left: "Ordered display retaining every exact raw value",
            right: "T",
          },
          {
            left: "Quantity plotted vertically on an unequal-width histogram",
            right: "P",
          },
        ],
      },
      points_awarded: 3,
    },
    "cd000000-0000-4000-8000-000000001001019": {
      answer: {
        parts: {
          a: "1440",
          b: "1750",
        },
      },
      points_awarded: 2,
      marker_note: "MYP4 C A Q19: (a) 1440 g A1; (b) computed new 7-mango total 7×250 = 1750 g M1 (omitted final subtraction 1750−1440 = 310 g). Awarded 2/3.",
    },
    "cd000000-0000-4000-8000-000000001001020": {
      answer: {
        parts: {
          a1: "140",
          a2: "180",
          b1: "20",
          b2: "164",
        },
      },
      points_awarded: 3,
    },
    "cd000000-0000-4000-8000-000000001001021": {
      answer: {
        parts: {
          q1: "30",
          med: "60",
          dist: "20",
        },
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001022": {
      answer: {
        parts: {
          a: "30",
          b1: "18 and 14",
          b2: "32",
        },
      },
      points_awarded: 2,
      marker_note: "MYP4 C A Q22: (a) 30 A1; (b) outer frequencies \"18 and 14\" M1 (total 32 incorrect). Awarded 2/3.",
    },
    "cd000000-0000-4000-8000-000000001001023": {
      answer: {
        parts: {
          sd: "6,83",
          var: "1155",
          mean: "169",
          range: "7",
          median: "15",
        },
      },
      points_awarded: 2,
    },
    "cd000000-0000-4000-8000-000000001001024": {
      answer: {
        parts: {
          iqr: "40",
          low: "160",
          out: "Yes 315",
          high: "280",
        },
      },
      points_awarded: 2,
    },
    "cd000000-0000-4000-8000-000000001001025": {
      answer: {
        parts: {
          a: "1,5",
          b: "15",
          c: "2,4",
          d: "12",
        },
      },
      points_awarded: 4,
    },
    "cd000000-0000-4000-8000-000000001001026": {
      answer: {
        parts: {
          k: "33",
          sum: "30+225 is equal to 255",
        },
      },
      points_awarded: 1,
      marker_note: "MYP4 C A Q26: Known sum \"30+225 is equal to 255\" exact A1 (auto-grader missed prose); k = 33 incorrect. Awarded 1/3.",
    },
    "cd000000-0000-4000-8000-000000001001027": {
      answer: {
        parts: {
          sd: "7,07",
          mean: "21,6",
        },
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001028": {
      answer: {
        parts: {
          sd: "7,07",
          mean: "21,6",
        },
      },
      points_awarded: 0,
    },
    "cd000000-0000-4000-8000-000000001001029": {
      answer: {
        parts: {
          med: "23",
          fast: "11",
          more: "the courier that is more consistent is the fast one because it has a lower median",
          express: "20",
        },
      },
      points_awarded: 2,
    },
    "cd000000-0000-4000-8000-000000001001030": {
      answer: {
        parts: {
          time: "QUANTITATIVE DISCRETE  ,    HISTOGRAM",
          goals: "QUANTITATIVE CONTINUOUS  ,   HISTOGRAM   ",
          sport: "QUALITATIVE  ,    BAR GRAPH",
        },
      },
      points_awarded: 1,
    },
  },
};
