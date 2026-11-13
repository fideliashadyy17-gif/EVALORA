// MYP2 / MYP4 / MYP5 mock examinations — guarantees:
//   · three papers, 45 questions each, Section A objective before Section B
//   · marks reconcile from part to question to paper
//   · every key is complete (one key per objective item, answers on parts)
//   · multi-mark justifications carry a rubric the model answer passes
//   · migrations 0097–0108: fixed UUIDs, idempotent, cover page, publication
//     manual, split into per-paper parts a–d so each file fits the SQL editor
//   · the papers reuse the existing question model (no new question type)
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// The suites compile the TypeScript sources themselves (the repository has no
// build step for tests), bundling the relative imports in one directory so
// `./assessParts` resolves without the Next.js alias.
const LIB_FILES = [
  "content", "mathExpr", "graphSpec", "geometrySpec", "statsSpec", "dataTableSpec", "vennSpec",
  "assessDiagram",
  "assessParts", "scoring", "responseTools",
].map((name) => `src/lib/${name}.ts`);

const compile = (files) => {
  const dir = mkdtempSync(path.join(tmpdir(), "myp-mock-"));
  for (const file of files) {
    const source = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    // `.js` so that the extensionless relative imports between the modules
    // ("…/assessParts") resolve the way Node's CommonJS loader expects.
    writeFileSync(path.join(dir, path.basename(file, ".ts") + ".js"), source);
  }
  // Link the repository's dependencies so the compiled modules can require
  // `katex` (used by content.ts) from /tmp.
  symlinkSync(process.cwd() + "/node_modules", path.join(dir, "node_modules"), "dir");
  return dir;
};
const libDir = compile(LIB_FILES);
const require = createRequire(import.meta.url);
const assessParts = require(path.join(libDir, "assessParts.js"));
const scoring = require(path.join(libDir, "scoring.js"));
const responseTools = require(path.join(libDir, "responseTools.js"));
const { publicAssessParts, scoreAssessParts, assessPartsFromConfig } = assessParts;
const { scoreAnswer } = scoring;
const { responseWorkspaceFor } = responseTools;

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

const PAPERS = [
  { key: "myp2", files: ["0097_myp2_mock_a.sql", "0098_myp2_mock_b.sql", "0099_myp2_mock_c.sql", "0100_myp2_mock_d.sql"], title: "MYP2 Mathematics — Mock Examination", code: "MYP2-MOCK-2026", quiz: "d2000000-0000-4000-8000-000000000001", exam: "d2000000-0000-4000-8000-000000000002", prefix: "d2000000-0000-4000-8000" },
  { key: "myp4", files: ["0101_myp4_mock_a.sql", "0102_myp4_mock_b.sql", "0103_myp4_mock_c.sql", "0104_myp4_mock_d.sql"], title: "MYP4 Mathematics — Mock Examination", code: "MYP4-MOCK-2026", quiz: "d4000000-0000-4000-8000-000000000001", exam: "d4000000-0000-4000-8000-000000000002", prefix: "d4000000-0000-4000-8000" },
  { key: "myp5", files: ["0105_myp5_mock_a.sql", "0106_myp5_mock_b.sql", "0107_myp5_mock_c.sql", "0108_myp5_mock_d.sql"], title: "MYP5 Mathematics — Mock Examination", code: "MYP5-MOCK-2026", quiz: "d5000000-0000-4000-8000-000000000001", exam: "d5000000-0000-4000-8000-000000000002", prefix: "d5000000-0000-4000-8000" },
];

// Each part carries its own payload; the paper is the concatenation of the
// question parts (the last file is the assembly / cover-page block).
const payloadOf = (files) =>
  (Array.isArray(files) ? files : [files])
    .map((file) => (existsSync(file) ? readFileSync(file, "utf8") : ""))
    .filter((sql) => sql.includes("jsonb_array_elements("))
    .flatMap((sql) =>
      [...sql.matchAll(/jsonb_array_elements\('(.*?)'::jsonb\)/gs)].map((m) =>
        JSON.parse(m[1].replace(/''/g, "'"))))
    .flat();

for (const paper of PAPERS) {
  const sql = paper.files
    .map((name) => readFileSync(`supabase/migrations/${name}`, "utf8"))
    .join("\n");
  const payload = payloadOf(paper.files.map((name) => `supabase/migrations/${name}`));

  check(`${paper.code}: 45 questions, 22 objective first, no new question type`, () => {
    assert.equal(payload.length, 45);
    assert.deepEqual(payload.map((q) => q.n), Array.from({ length: 45 }, (_, i) => i + 1));
    const objective = payload.filter((q) => q.t !== "assess_parts");
    assert.equal(objective.length, 22);
    assert.deepEqual(payload.slice(0, 22).map((q) => q.t !== "assess_parts"),
      Array(22).fill(true));
    assert.deepEqual(payload.slice(22).map((q) => q.t), Array(23).fill("assess_parts"));
    for (const q of payload) {
      assert.ok(["single_choice", "numeric", "short_answer", "assess_parts"].includes(q.t), q.t);
    }
  });

  check(`${paper.code}: marks reconcile and every paper has a workable total`, () => {
    let total = 0;
    for (const q of payload) {
      total += q.m;
      assert.ok(Number.isInteger(q.m) && q.m > 0, `Q${q.n} marks`);
      if (q.t === "assess_parts") {
        const parts = q.cfg.parts;
        assert.ok(parts.length >= 2, `Q${q.n} needs at least two parts`);
        assert.equal(parts.reduce((n, p) => n + p.points, 0), q.m, `Q${q.n} part total`);
      }
    }
    assert.ok(total >= 100 && total <= 260, `paper total ${total}`);
    const sectionA = payload.slice(0, 22).reduce((n, q) => n + q.m, 0);
    const sectionB = payload.slice(22).reduce((n, q) => n + q.m, 0);
    assert.equal(sectionA + sectionB, total);
    assert.ok(sectionB > sectionA, "Section B must carry the greater share of marks");
  });

  check(`${paper.code}: objective keys complete (4 options, exactly one key)`, () => {
    for (const q of payload.filter((x) => x.t === "single_choice" || x.t === "multiple_select")) {
      assert.equal(q.cfg.option_labels.length, 4, `Q${q.n} option count`);
      assert.equal(q.cfg.option_key.length, 1, `Q${q.n} key count`);
      const [index] = q.cfg.option_key;
      assert.ok(index >= 1 && index <= 4, `Q${q.n} key index`);
      const labels = q.cfg.option_labels.map((l) => l.trim());
      assert.ok(labels.every(Boolean), `Q${q.n} empty option`);
      assert.equal(new Set(labels).size, 4, `Q${q.n} duplicate options`);
    }
    for (const q of payload.filter((x) => x.t === "numeric")) {
      assert.equal(typeof q.cfg.numeric_answer, "number", `Q${q.n} numeric answer`);
      assert.ok(q.cfg.tolerance >= 0, `Q${q.n} tolerance`);
    }
    for (const q of payload.filter((x) => x.t === "short_answer")) {
      assert.ok(q.cfg.accepted.length >= 1, `Q${q.n} accepted`);
      assert.ok(q.cfg.accepted.every((a) => typeof a === "string" && a.trim()), `Q${q.n} accepted text`);
    }
  });

  check(`${paper.code}: parts are typed, hinted, and markable`, () => {
    for (const q of payload.filter((x) => x.t === "assess_parts")) {
      for (const part of q.cfg.parts) {
        assert.ok(["numeric", "text", "expression"].includes(part.kind), `Q${q.n}(${part.id}) kind`);
        assert.ok(part.points > 0, `Q${q.n}(${part.id}) marks`);
        assert.equal(part.hints.length, 2, `Q${q.n}(${part.id}) hints`);
        assert.ok(part.hints.every((h) => h.trim().length >= 8), `Q${q.n}(${part.id}) hint text`);
        assert.ok(part.strand && /^[A-D]\(/.test(part.strand), `Q${q.n}(${part.id}) strand`);
        if (part.kind === "numeric") {
          assert.equal(typeof part.answer, "number", `Q${q.n}(${part.id}) answer`);
        } else {
          assert.ok(part.accepted.length >= 1, `Q${q.n}(${part.id}) accepted`);
        }
        if (part.keywords) {
          assert.ok(part.minKeywordGroups >= 1, `Q${q.n}(${part.id}) threshold`);
          assert.ok(part.minKeywordGroups <= part.keywords.length, `Q${q.n}(${part.id}) threshold range`);
          const model = part.accepted.join(" ").toLowerCase();
          // Groups are either a flat vocabulary list or a [terms, partners]
          // pair (a term only counts alongside its reason).
          const hits = part.keywords.filter((group) => {
            if (Array.isArray(group[0])) {
              const [terms, partners] = group;
              return terms.some((w) => model.includes(String(w).toLowerCase()))
                && partners.some((w) => model.includes(String(w).toLowerCase()));
            }
            return group.some((w) => model.includes(String(w).toLowerCase()));
          }).length;
          assert.ok(hits >= part.minKeywordGroups, `Q${q.n}(${part.id}) model answer must satisfy its rubric`);
        }
      }
    }
  });

  check(`${paper.code}: feedback is complete on every question`, () => {
    for (const q of payload) {
      assert.ok(q.e && q.e.trim().length > 40, `Q${q.n} worked solution`);
      assert.ok(q.cfg.next_time_hint && q.cfg.next_time_hint.trim(), `Q${q.n} next-time hint`);
      assert.ok(q.tp && q.st, `Q${q.n} topic/subtopic`);
      assert.ok(["easy", "medium", "hard", "competition"].includes(q.df), `Q${q.n} difficulty`);
      assert.ok(q.cfg.myp_criterion && "ABCD".includes(q.cfg.myp_criterion), `Q${q.n} criterion`);
      if (q.t === "assess_parts") {
        assert.ok(q.cfg.marking && q.cfg.marking.trim().length > 30, `Q${q.n} marking scheme`);
        assert.equal(q.cfg.marking_criteria, q.cfg.marking);
        for (const part of q.cfg.parts) {
          assert.ok(q.cfg.marking.includes(`(${part.id})`), `Q${q.n} marking scheme mentions (${part.id})`);
        }
      }
    }
  });

  check(`${paper.code}: migration is idempotent, ships the cover page, publishes manually`, () => {
    assert.ok(sql.includes(`'${paper.title}'`));
    assert.ok(sql.includes(paper.code));
    assert.ok(sql.includes(paper.quiz) && sql.includes(paper.exam));
    assert.ok((sql.match(/on conflict \(id\) do nothing/g) ?? []).length >= 4);
    assert.ok(sql.includes("on conflict (quiz_id, question_id) do nothing"));
    assert.ok(sql.includes("begin;") && sql.includes("commit;"));
    assert.ok(sql.includes("raise exception"), "self-check must abort an incomplete paper");
    assert.ok(sql.includes("MYP"), "curriculum tag");
    const cover = sql.match(/values \('[0-9a-f-]{36}', '[0-9a-f-]{36}', '[0-9a-f-]{36}', '[0-9a-f-]{36}', 'MYP\d Mathematics — Mock Examination',.*?\n/s);
    assert.ok(cover, "exams insert");
    assert.ok(sql.includes("assessment_kind") && sql.includes('"mock"'), "assessment kind");
    assert.ok(sql.includes('"results_published":false'), "results stay unpublished");
    assert.ok(sql.includes('"pass_mark_percent":50'));
    assert.ok(sql.includes('"sections"'), "section structure in settings");
    assert.ok(sql.includes("Section A") && sql.includes("Section B"), "cover describes both sections");
    assert.ok(!/insert into questions[\s\S]*?'assess_parts'[\s\S]*?alter table/.test(sql));
  });

  check(`${paper.code}: prompt docs are TipTap JSON and never embed a key`, () => {
    for (const q of payload) {
      assert.equal(q.d.type, "doc");
      assert.ok(Array.isArray(q.d.content) && q.d.content.length >= 1);
      const text = JSON.stringify(q.d);
      assert.ok(!text.includes("\"key\""), `Q${q.n} prompt doc carries a key`);
    }
  });
}

// ── scoring behaviour on the shipped payload ─────────────────────────────────
const myp2 = payloadOf(PAPERS.find((p) => p.key === "myp2").files.map((n) => `supabase/migrations/${n}`));
const partsQuestion = myp2.find((q) => q.t === "assess_parts" && q.cfg.parts.some((p) => p.keywords));
const numericQuestion = myp2.find((q) => q.t === "assess_parts" && q.cfg.parts.some((p) => p.kind === "numeric"));

check("a justification in the candidate's own words earns its marks", () => {
  const parts = assessPartsFromConfig(partsQuestion.cfg);
  const rubricPart = partsQuestion.cfg.parts.find((p) => p.keywords);
  const model = rubricPart.accepted[0];
  const perfect = Object.fromEntries(parts.map((p) => [p.id, p.kind === "numeric" ? String(p.answer) : p.accepted[0]]));
  const full = scoreAssessParts(parts, { parts: perfect });
  assert.equal(full.points, partsQuestion.m);
  const reworded = { ...perfect, [rubricPart.id]: model.split(" ").reverse().join(" ") };
  assert.ok(scoreAssessParts(parts, { parts: reworded }).points >= rubricPart.points);
  const empty = Object.fromEntries(parts.map((p) => [p.id, ""]));
  assert.equal(scoreAssessParts(parts, { parts: empty }).points, 0);
});

check("numeric parts accept a tolerance and reject a wrong value", () => {
  const parts = assessPartsFromConfig(numericQuestion.cfg);
  const target = numericQuestion.cfg.parts.find((p) => p.kind === "numeric");
  const key = target.id;
  const base = Object.fromEntries(parts.map((p) => [p.id, p.kind === "numeric" ? String(p.answer) : p.accepted[0]]));
  assert.ok(scoreAssessParts(parts, { parts: base }).points >= target.points);
  const off = { ...base, [key]: String((target.answer ?? 0) + 1e6) };
  assert.ok(scoreAssessParts(parts, { parts: off }).points < numericQuestion.m);
});

check("candidate projection never leaks keys, rubrics or model answers", () => {
  const parts = assessPartsFromConfig(partsQuestion.cfg);
  const pub = JSON.stringify(publicAssessParts(parts));
  assert.ok(!pub.includes("\"answer\""));
  assert.ok(!pub.includes("\"accepted\""));
  assert.ok(!pub.includes("keywords"));
  assert.ok(!pub.includes("minKeywordGroups"));
  assert.ok(pub.includes("\"hints\""));
  assert.ok(pub.includes("\"strand\""));
});

check("an objective key scores through the server scorer, and a wrong pick scores zero", () => {
  const choice = myp2.find((q) => q.t === "single_choice");
  const options = choice.cfg.option_labels.map((label, i) => ({
    id: `o${i + 1}`, label, is_correct: choice.cfg.option_key.includes(i + 1),
  }));
  const key = options.find((o) => o.is_correct);
  const question = { type: "single_choice", points: choice.m, config: choice.cfg };
  assert.equal(scoreAnswer(question, options, { option_id: key.id }).points, choice.m);
  const wrong = options.find((o) => !o.is_correct);
  assert.equal(scoreAnswer(question, options, { option_id: wrong.id }).points, 0);
});

check("every structured question opts into a per-part working workspace", () => {
  for (const paper of PAPERS) {
    const rows = payloadOf(paper.files.map((n) => `supabase/migrations/${n}`));
    for (const q of rows.filter((x) => x.t === "assess_parts")) {
      assert.ok(Array.isArray(q.cfg.response_tools) && q.cfg.response_tools.length > 0, `Q${q.n} tools`);
      assert.ok(["any", "text", "graph", "statistics", "data_table", "venn"].includes(q.cfg.response_requirement),
        `Q${q.n} requirement`);
      const workspace = responseWorkspaceFor({
        type: "assess_parts", prompt: q.p, prompt_doc: q.d, config: q.cfg,
      });
      assert.ok(workspace.tools.length > 0, `Q${q.n} workspace tools`);
      assert.ok(workspace.guidance.length > 0, `Q${q.n} workspace guidance`);
    }
  }
});

check("no objective question carries a working workspace (native interface kept)", () => {
  for (const paper of PAPERS) {
    const rows = payloadOf(paper.files.map((n) => `supabase/migrations/${n}`));
    for (const q of rows.filter((x) => x.t !== "assess_parts")) {
      assert.equal(q.cfg.response_tools, undefined, `Q${q.n} must not carry tools`);
      const workspace = responseWorkspaceFor({ type: q.t, prompt: q.p, prompt_doc: q.d, config: q.cfg });
      assert.equal(workspace.source, "native");
      assert.equal(workspace.tools.length, 0);
    }
  }
});

check("pass threshold is stored as a platform setting with an org override", () => {
  const sql = PAPERS[0].files
    .map((n) => readFileSync(`supabase/migrations/${n}`, "utf8")).join("\n");
  assert.ok(sql.includes("exam_pass_threshold"));
  assert.ok(sql.includes('"default_percent":50'));
  assert.ok(sql.includes("organization_overrides"));
  assert.ok(sql.includes("on conflict (key) do nothing"));
});

check("papers share no question with each other and no duplicate stem inside a paper", () => {
  const stems = new Map();
  for (const paper of PAPERS) {
    const rows = payloadOf(paper.files.map((n) => `supabase/migrations/${n}`));
    const seen = new Set();
    for (const q of rows) {
      const stem = q.p.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ").trim();
      assert.ok(!seen.has(stem), `${paper.code} Q${q.n} repeats a stem`);
      seen.add(stem);
      assert.ok(!stems.has(stem), `${paper.code} Q${q.n} duplicates ${stems.get(stem)}`);
      stems.set(stem, `${paper.code} Q${q.n}`);
    }
  }
});

console.log(`\n${checks} checks passed`);
