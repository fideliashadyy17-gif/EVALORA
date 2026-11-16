/**
 * The four Summative B papers as the candidate will SEE them.
 *
 * The migration is the artefact that actually reaches production, so this
 * suite reads the JSON payload straight out of the SQL and inspects every
 * node the renderer will draw. It guards the two ways a printed paper ends up
 * showing its own markup:
 *
 *   1. a stray or unpaired `$` left in ordinary prose — the candidate reads
 *      "invests $5 000" where the paper prints "invests 5 000";
 *   2. prose swallowed into a maths node by a mis-placed delimiter — the
 *      candidate reads a whole clause set as an equation.
 *
 * Diagram labels are checked too: a `$` inside a diagram spec is rendered as
 * mathematics by the diagram renderer, so an unpaired one would print raw.
 *
 * Run: node scripts/test-summative-b-prompt-rendering.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const PAPERS = [
  ["MYP 2 (Grade 7)", "supabase/migrations/0116_myp2_grade7_term1_summative_b.sql"],
  ["MYP 3 (Grade 8)", "supabase/migrations/0117_myp3_grade8_term1_summative_b.sql"],
  ["MYP 4 (Grade 9)", "supabase/migrations/0118_myp4_grade9_term1_summative_b.sql"],
  ["MYP 5 (Grade 10)", "supabase/migrations/0119_myp5_grade10_sequences_summative.sql"],
];

let passed = 0;
const ok = (name, condition, detail = "") => {
  assert.ok(condition, `FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  \u2713 ${name}`);
};

/** Pull the `jsonb_array_elements('[…]')` literal that carries the given key. */
function payload(sql, key) {
  for (const line of sql.split("\n")) {
    const match = line.match(/^ {2}from jsonb_array_elements\('(\[.*\])'::jsonb\) as \w+$/);
    if (!match || !match[1].includes(key)) continue;
    return JSON.parse(match[1].replace(/''/g, "'"));
  }
  throw new Error(`no payload carrying ${key}`);
}

/** Walk every node of a document, including nested list/table content. */
function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const child of node.content ?? []) walk(child, visit);
}

/** Every string inside a diagram / graph / stats spec, whatever its shape. */
function specStrings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) specStrings(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) specStrings(item, out);
  return out;
}

/**
 * Prose hiding inside a maths node. LaTeX commands and `\text{…}` are removed
 * first, so `P(\text{no prize})` is legitimate; what is left must be
 * notation — at most a couple of stray words, never a sentence.
 */
function proseInMath(latex) {
  const stripped = String(latex ?? "")
    .replace(/\\text\s*\{[^}]*\}/g, " ")
    .replace(/\\mathrm\s*\{[^}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, " ");
  const words = (stripped.match(/[A-Za-z]{2,}/g) ?? []).filter((word) => !/^(sin|cos|tan|log|ln|pi)$/i.test(word));
  return words.length;
}

for (const [paper, file] of PAPERS) {
  const sql = readFileSync(file, "utf8");
  const questions = payload(sql, '"t":');
  const options = payload(sql, '"c":');

  ok(`${paper}: the paper payload carries 45 questions`, questions.length === 45, `got ${questions.length}`);

  const strayInProse = [];
  const prose = [];
  const strayInSpecs = [];
  for (const q of questions) {
    const where = `question ${q.cfg?.question_number ?? q.n}`;
    walk(q.d, (node) => {
      if (node.type === "text" && String(node.text ?? "").includes("$")) {
        strayInProse.push(`${where}: ${String(node.text).slice(0, 60)}`);
      }
      if (node.type === "mathInline" || node.type === "mathBlock") {
        const latex = node.attrs?.latex ?? "";
        if (proseInMath(latex) >= 3) prose.push(`${where}: ${String(latex).slice(0, 60)}`);
      }
      if (typeof node.attrs?.spec === "object" && node.attrs.spec) {
        for (const text of specStrings(node.attrs.spec)) {
          if (text.includes("$") && !/\$[^$\n]+\$/.test(text)) strayInSpecs.push(`${where}: ${text.slice(0, 60)}`);
        }
      }
    });
  }

  ok(`${paper}: no stray $ is left in the prose`, strayInProse.length === 0, strayInProse.join(" | "));
  ok(`${paper}: no sentence is set as an equation`, prose.length === 0, prose.join(" | "));
  ok(`${paper}: every $ inside a diagram label is a maths delimiter`,
    strayInSpecs.length === 0, strayInSpecs.join(" | "));

  const optionStray = [];
  for (const o of options) {
    walk(o.doc, (node) => {
      if (node.type === "text" && String(node.text ?? "").includes("$")) optionStray.push(String(node.text).slice(0, 60));
      if (node.type === "mathInline" && proseInMath(node.attrs?.latex ?? "") >= 3) optionStray.push(String(node.attrs?.latex).slice(0, 60));
    });
  }
  ok(`${paper}: the printed options carry no stray $`, optionStray.length === 0, optionStray.join(" | "));

  // A question that asks "which graph shows…" must show graphs. Guarded here
  // because the defect is invisible in the database: the option text reads
  // perfectly well and only the missing figure gives the question away.
  const graphQuestions = questions.filter((q) => /which graph (best )?shows/i.test(String(q.p ?? "")));
  for (const q of graphQuestions) {
    const its = options.filter((o) => o.n === q.n);
    const withGraph = its.filter((o) => {
      let found = false;
      walk(o.doc, (node) => {
        if (node.type === "graphBlock" || node.type === "assessDiagramBlock") found = true;
      });
      return found;
    });
    ok(`${paper}: question ${q.cfg?.question_number ?? q.n} shows a figure on every option`,
      its.length > 0 && withGraph.length === its.length,
      `${withGraph.length}/${its.length} options carry a figure`);
  }
}

console.log(`\n${passed} checks passed (the four papers as the candidate sees them).`);
