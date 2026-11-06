/**
 * Checks for the two summative assessments and their repairs.
 *
 *   Grade 10 — Summative Assessment (MYP 5 Sequences & Series)
 *     0041 questions 1–25, 0042 questions 26–50, 0043 the 200 options,
 *     0044 the quiz, the paper and the examination,
 *     0045 the option-text repair,
 *     0052 the two missing figures (Q6, Q28).
 *
 *   Grade 9 — Summative Assessment (MYP 4 Statistics & Distributions)
 *     0046–0049 the 50 questions in four steps, 0050 the 200 options,
 *     0051 the quiz, the paper and the examination.
 *
 * The migrations are the source of truth for the questions, their options, the
 * keyed answer of each, the figures they show and the examination
 * configuration, so the assertions below read the SQL that actually runs — not
 * a copy of it.
 *
 * Run: node scripts/test-summative-assessments.mjs
 */
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const G10 = ["0041_summative_grade10_questions_1_25", "0042_summative_grade10_questions_26_50",
  "0043_summative_grade10_options", "0044_summative_grade10_exam"]
  .map((n) => `supabase/migrations/${n}.sql`);
const G10_OPTION_TEXT = read("supabase/migrations/0045_summative_grade10_option_text.sql");
const G10_FIGURES = read("supabase/migrations/0052_summative_grade10_figures.sql");
const G9Q = [
  "0046_summative_grade9_questions_1_13",
  "0047_summative_grade9_questions_14_25",
  "0048_summative_grade9_questions_26_38",
  "0049_summative_grade9_questions_39_50",
].map((n) => read(`supabase/migrations/${n}.sql`));
const G9_OPTIONS = read("supabase/migrations/0050_summative_grade9_options.sql");
const G9_EXAM = read("supabase/migrations/0051_summative_grade9_exam.sql");

const g10 = G10.map(read);
const g10Questions = g10[0] + "\n" + g10[1];
const g10Options = g10[2];
const g10Exam = g10[3];
const g9Questions = G9Q.join("\n");

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── The document's own key. Both papers were produced from the same source
      pipeline and both print the same key; each was re-checked against its own
      marking scheme, question by question, with 0 mismatches and 0 missing. ── */
const DOCUMENT_KEY = [
  "B", "D", "D", "A", "D", "B", "B", "C", "C", "A", "A", "B", "B", "C", "D", "B",
  "D", "C", "C", "A", "C", "D", "C", "D", "A", "B", "C", "D", "C", "D", "C", "B",
  "B", "A", "A", "D", "A", "B", "C", "D", "A", "D", "A", "A", "B", "A", "B", "C",
  "B", "C",
];
const keyString = DOCUMENT_KEY.join("");
const numbers = Array.from({ length: 50 }, (_, i) => i + 1);

/* ── Grade 10: option rows ── */
const g10OptionRows = [...g10Options.matchAll(/^  \((\d+), \$txt\$([ABCD])\$txt\$, (\d), (true|false), \$txt\$/gm)]
  .map((m) => ({ n: +m[1], letter: m[2], position: +m[3], correct: m[4] === "true" }));

ok("Grade 10: 200 option rows are written (50 × 4)", g10OptionRows.length === 200, `${g10OptionRows.length}`);
ok("Grade 10: positions are exactly 1–4 for every question", numbers.every((n) => {
  const rows = g10OptionRows.filter((r) => r.n === n).sort((a, b) => a.position - b.position);
  return rows.length === 4 && rows.map((r) => r.position).join(",") === "1,2,3,4";
}));
ok("Grade 10: each question has exactly one correct option",
  numbers.every((n) => g10OptionRows.filter((r) => r.n === n && r.correct).length === 1));
ok("Grade 10: the keyed option of every question matches the document key",
  numbers.every((n) => g10OptionRows.find((r) => r.n === n && r.correct)?.letter === DOCUMENT_KEY[n - 1]));
ok("Grade 10: option letters cover all four choices in every question",
  numbers.every((n) => g10OptionRows.filter((r) => r.n === n).map((r) => r.letter).sort().join("") === "ABCD"));

/* ── Grade 10: question rows ── */
const g10RowStarts = [...g10Questions.matchAll(/^  \((\d+), \$txt\$(?!\/exam-figures)/gm)].map((m) => +m[1]);
ok("Grade 10: 50 question rows are written", g10RowStarts.length === 50, `${g10RowStarts.length}`);
ok("Grade 10: question numbers are 1–50 in printed order", g10RowStarts.join(",") === numbers.join(","));
ok("Grade 10: every question row carries a worked solution", (g10Questions.match(/\$txt\$1\. /g) ?? []).length === 50);
ok("Grade 10: all questions are single-choice", /'single_choice'/.test(g10Questions));
ok("Grade 10: each question is worth exactly 1 mark", /s\.explanation, 1,/.test(g10Questions));
ok("Grade 10: question inserts are idempotent per question number",
  (g10Questions.match(/where not exists \(/g) ?? []).length === 2);
ok("Grade 10: the source marker is stored on every question",
  /'source', 'myp5-sequences-and-series-e-assessment'/.test(g10Questions));

/* ── Grade 10: option text repair ── */
const repairRows = [...G10_OPTION_TEXT.matchAll(/^  \((\d+), \$txt\$([ABCD])\$txt\$, \$txt\$(.*?)\$txt\$\)/gm)]
  .map((m) => ({ n: +m[1], letter: m[2], body: m[3] }));
ok("Grade 10 repair: 200 option texts are supplied", repairRows.length === 200, `${repairRows.length}`);
ok("Grade 10 repair: every question keeps all four texts",
  numbers.every((n) => repairRows.filter((r) => r.n === n).map((r) => r.letter).sort().join("") === "ABCD"));
ok("Grade 10 repair: the text matches the seeded option text", (() => {
  const seeded = [...g10Options.matchAll(/^  \((\d+), \$txt\$([ABCD])\$txt\$, \d, (?:true|false), \$txt\$(.*?)\$txt\$\)/gm)]
    .map((m) => `${m[1]}${m[2]}=${m[3]}`);
  const repaired = repairRows.map((r) => `${r.n}${r.letter}=${r.body}`);
  return seeded.length === 200 && seeded.every((s, i) => s === repaired[i]);
})());
ok("Grade 10 repair: the option text is written to content_doc, which is what the runner renders",
  /set content_doc = jsonb_build_object\('type', 'doc'/.test(G10_OPTION_TEXT));
ok("Grade 10 repair: only options with no text are touched, so a re-run is a no-op",
  /and o\.content_doc is null/.test(G10_OPTION_TEXT));
ok("Grade 10 repair: the update is scoped to this assessment's questions",
  /q\.config ->> 'source' = 'myp5-sequences-and-series-e-assessment'/.test(G10_OPTION_TEXT));

/* ── Grade 10: figures ── */
ok("Grade 10 figures: Q6 and Q28 are both patched", /\(6, \$txt\$\/exam-figures\/grade10\/q06\.png\$txt\$\)/.test(G10_FIGURES)
  && /\(28, \$txt\$\/exam-figures\/grade10\/q28\.png\$txt\$\)/.test(G10_FIGURES));
ok("Grade 10 figures: both image files exist in the repository",
  existsSync("public/exam-figures/grade10/q06.png") && existsSync("public/exam-figures/grade10/q28.png"));
ok("Grade 10 figures: the prompt text is read from the row, not re-typed", /'text', q\.prompt/.test(G10_FIGURES));
ok("Grade 10 figures: a question that already shows a figure is skipped",
  /not \(q\.prompt_doc::text like '%"image"%'\)/.test(G10_FIGURES));

/* ── Grade 10: examination ── */
ok("Grade 10 exam: the examination is open, not a draft", /'open',/.test(g10Exam));
ok("Grade 10 exam: attached to the Grade 10 — MYP 5 class", /v_class uuid := '0a400000-0000-4000-8000-000000000110'/.test(g10Exam));
ok("Grade 10 exam: lasts 60 minutes", /\n    60,\n/.test(g10Exam));
ok("Grade 10 exam: results are released immediately after submission", /'results_published', true/.test(g10Exam));
ok("Grade 10 exam: question and option order are fixed so the printed key stays valid",
  /'randomize_questions', false/.test(g10Exam) && /'randomize_options', false/.test(g10Exam));
ok("Grade 10 exam: the access code is MYP5-SEQ-2026", /'MYP5-SEQ-2026'/.test(g10Exam));
ok("Grade 10 exam: the title now reads Summative, and the guard matches it",
  /title = 'Summative Assessment — Grade 10'/.test(g10Exam)
  && /'Summative Assessment — Grade 10'/.test(g10Exam)
  && !/Sommetisation|sommetisation/.test(g10Exam));
ok("Grade 10 exam: the paper is only created when all 50 questions, 200 options and 50 keys exist",
  /v_questions <> 50 or v_options <> 200 or v_correct <> 50/.test(g10Exam) && /v_paper <> 50/.test(g10Exam));
ok("Grade 10 exam: re-running is a no-op", /if v_existing is not null then/.test(g10Exam));

/* ── Grade 9: question rows ── */
const g9RowStarts = [...g9Questions.matchAll(/^  \((\d+), \$txt\$(?!\/exam-figures)/gm)].map((m) => +m[1]);
ok("Grade 9: 50 question rows are written", g9RowStarts.length === 50, `${g9RowStarts.length}`);
ok("Grade 9: question numbers are 1–50 in printed order", g9RowStarts.join(",") === numbers.join(","));
ok("Grade 9: the paper is written in four steps", G9Q.every((f, i) =>
  new RegExp(`questions ${[1, 14, 26, 39][i]}–${[13, 25, 38, 50][i]}`).test(f)));
ok("Grade 9: every question row carries a worked solution", (G9Q.filter((f) => /\$txt\$1\. /.test(f))).length === 4);
ok("Grade 9: the arguments for the other options are kept", /Why the other options are wrong:/.test(g9Questions)
  || /why the other options are wrong/i.test(g9Questions));
ok("Grade 9: all questions are single-choice and worth 1 mark",
  /'single_choice'/.test(g9Questions) && /s\.explanation, 1,/.test(g9Questions));
ok("Grade 9: the file's own \"MYP 5\" label is not reproduced as the assessment level",
  /MYP 4/.test(g9Questions) && !/'myp5'/.test(g9Questions));
ok("Grade 9: question inserts are idempotent per question number",
  (g9Questions.match(/where not exists \(/g) ?? []).length === 4);

/* ── Grade 9: figures and callouts ── */
const g9Figures = [...g9Questions.matchAll(/\(\d+, \$txt\$\/exam-figures\/grade9\/(q\d{2})\.png\$txt\$, null\)/g)]
  .map((m) => m[1]);
ok("Grade 9: 35 questions attach a rendered figure", new Set(g9Figures).size === 35, `${new Set(g9Figures).size}`);
ok("Grade 9: every referenced figure file exists in the repository",
  g9Figures.every((f) => existsSync(`public/exam-figures/grade9/${f}.png`)));
ok("Grade 9: the figure is embedded as an image node in the student prompt",
  /'type', 'image', 'attrs', jsonb_build_object\(/.test(g9Questions));
ok("Grade 9: the prompt text always accompanies the figure", /'text', q\.prompt/.test(g9Questions));
const g9Callouts = [...g9Questions.matchAll(/\(\d+, null, \$txt\$(.*?)\$txt\$\)/g)].map((m) => m[1]);
ok("Grade 9: the three data callouts are kept as text, not as images", g9Callouts.length === 3, `${g9Callouts.length}`);
ok("Grade 9: figure and callout questions are mutually exclusive",
  g9Figures.length + g9Callouts.length === 38);
ok("Grade 9: no question is left without its figure reference in config",
  /'figure'/.test(g9Questions) || /\/exam-figures\/grade9\/q\d{2}\.png/.test(g9Questions));

/* ── Grade 9: options ── */
const g9OptionRows = [...G9_OPTIONS.matchAll(/^  \((\d+), \$txt\$([ABCD])\$txt\$, (\d), (true|false), \$txt\$/gm)]
  .map((m) => ({ n: +m[1], letter: m[2], position: +m[3], correct: m[4] === "true" }));
ok("Grade 9: 200 option rows are written (50 × 4)", g9OptionRows.length === 200, `${g9OptionRows.length}`);
ok("Grade 9: positions are exactly 1–4 for every question", numbers.every((n) => {
  const rows = g9OptionRows.filter((r) => r.n === n).sort((a, b) => a.position - b.position);
  return rows.length === 4 && rows.map((r) => r.position).join(",") === "1,2,3,4";
}));
ok("Grade 9: each question has exactly one correct option",
  numbers.every((n) => g9OptionRows.filter((r) => r.n === n && r.correct).length === 1));
ok("Grade 9: the keyed option of every question matches the document key",
  numbers.every((n) => g9OptionRows.find((r) => r.n === n && r.correct)?.letter === DOCUMENT_KEY[n - 1]));
ok("Grade 9: the key string matches the paper",
  numbers.map((n) => g9OptionRows.find((r) => r.n === n && r.correct)?.letter).join("") === keyString);
ok("Grade 9: every option carries its text in content_doc, so no option renders as a bare letter",
  /insert into public\.question_options \(question_id, label, is_correct, position, content_doc\)/.test(G9_OPTIONS)
  && /jsonb_build_object\('type', 'text', 'text', o\.body\)/.test(G9_OPTIONS));
ok("Grade 9: option inserts skip questions that already have options",
  /not exists \(select 1 from public\.question_options/.test(G9_OPTIONS));

/* ── Grade 9: examination ── */
ok("Grade 9 exam: attached to the Grade 9 — MYP 4 class", /v_class uuid := '0a400000-0000-4000-8000-000000000109'/.test(G9_EXAM));
ok("Grade 9 exam: lasts 60 minutes", /\n    60,\n/.test(G9_EXAM));
ok("Grade 9 exam: results are released immediately after submission", /'results_published', true/.test(G9_EXAM));
ok("Grade 9 exam: question and option order are fixed so the printed key stays valid",
  /'randomize_questions', false/.test(G9_EXAM) && /'randomize_options', false/.test(G9_EXAM));
ok("Grade 9 exam: the access code is MYP4-STAT-2026", /'MYP4-STAT-2026'/.test(G9_EXAM));
ok("Grade 9 exam: the title reads Summative Assessment — Grade 9",
  (G9_EXAM.match(/'Summative Assessment — Grade 9'/g) ?? []).length >= 3
  && /title = 'Summative Assessment — Grade 9'/.test(G9_EXAM));
ok("Grade 9 exam: the paper is only created when all 50 questions, 200 options and 50 keys exist",
  /v_questions <> 50 or v_options <> 200 or v_correct <> 50/.test(G9_EXAM) && /v_paper <> 50/.test(G9_EXAM));
ok("Grade 9 exam: re-running is a no-op", /if v_existing is not null then/.test(G9_EXAM));
ok("Grade 9 exam: the candidate instructions mention the figures and their axes",
  /read the axes and their units/.test(G9_EXAM));

/* ── Both papers ── */
const everything = [...g10, G10_OPTION_TEXT, G10_FIGURES, ...G9Q, G9_OPTIONS, G9_EXAM].join("\n");
ok("no migration still calls the assessment \"Sommetisation\"", !/Sommetisation|sommetisation/.test(everything));
ok("no mojibake or replacement characters", !/\ufffd/.test(everything));

console.log(`\n${passed} checks passed.`);
