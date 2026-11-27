// ══════════════════════════════════════════════════════════════════════
// Question-level assessment mapping — Paper Builder → Examination → Marking
// Part 9 coverage: pure mapping library, saveQuiz persistence (executed
// against an in-memory store), the Paper Builder panel workflow (real
// component, real state), marking badges, and integration wiring.
// ══════════════════════════════════════════════════════════════════════
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { compileRealModule } from "./__platform_config_stubs.mjs";
import { renderToStaticMarkup } from "react-dom/server";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

import {
  QUESTION_ASSESSMENT_VERSION,
  ORG_CONFIG_REFERENCE,
  parseQuestionAssessment,
  validateQuestionAssessment,
  assessmentEquals,
  buildQuestionAssessment,
  summarizeQuestionAssessment,
} from "../src/lib/questionAssessment.ts";
import { buildMypExamConfigFromForm, MYP_REFERENCE_SNAPSHOT } from "../src/lib/mypExamConfig.ts";
import { MYP_SUBJECT_GROUP_REFERENCE } from "../src/lib/mypReference.ts";

let n = 0;
const check = (cond, msg) => { assert.ok(cond, msg); n += 1; };

// ── helpers ──────────────────────────────────────────────────────────────
const mathGroup = MYP_SUBJECT_GROUP_REFERENCE.find((g) => g.key === "mathematics");
check(Boolean(mathGroup), "mathematics reference group present");

function mypSnapshot(criterionCodes, strandCodes, savedAt = "2026-11-24T00:00:00.000Z") {
  const fields = { myp_criterion: criterionCodes, myp_strand: strandCodes };
  const result = buildMypExamConfigFromForm(
    { getAll: (k) => fields[k] ?? [], get: (k) => fields[k]?.[0] ?? null },
    "mathematics",
    savedAt,
  );
  assert.equal(result.ok, true, `snapshot builds for ${criterionCodes.join("+")}`);
  return result.config;
}

const mappingA = buildQuestionAssessment({
  curriculum: "myp",
  gradingSystemId: null,
  myp: mypSnapshot(["A", "C"], ["A(i)", "A(iii)", "C(ii)"]),
});

// ── 1. pure library ──────────────────────────────────────────────────────
check(mappingA.version === QUESTION_ASSESSMENT_VERSION && mappingA.curriculum === "myp", "mapping version + curriculum");
check(mappingA.reference === MYP_REFERENCE_SNAPSHOT, "MYP mapping carries the reference snapshot label");
check(mappingA.myp.criteria.length === 2, "two selected criteria");
check(mappingA.myp.criteria[0].code === "A" && mappingA.myp.criteria[0].strands.map((s) => s.code).join(",") === "A(i),A(iii)", "criterion A strands");
check(mappingA.myp.criteria[1].code === "C" && mappingA.myp.criteria[1].strands[0].code === "C(ii)", "criterion C strand");
// Titles/descriptions are copied from the reference (snapshot content)
const refA = mathGroup.criteria.find((c) => c.code === "A");
check(mappingA.myp.criteria[0].title === refA.title && mappingA.myp.criteria[0].description === refA.description, "criterion A content copied from reference");
check(mappingA.myp.criteria[0].strands[0].title === refA.strands[0].title, "strand content copied from reference");

check(validateQuestionAssessment(mappingA).ok === true, "valid MYP mapping passes save-time validation");

// Round-trip
const reparsed = parseQuestionAssessment(JSON.parse(JSON.stringify(mappingA)));
check(Boolean(reparsed) && assessmentEquals(reparsed, mappingA), "parse round-trip is lossless and order-insensitive");

// jsonb key-order insensitivity (Postgres normalises key order)
const shuffled = { saved_at: mappingA.saved_at, reference: mappingA.reference, myp: mappingA.myp, curriculum: "myp", grading_system_id: null, version: 1 };
check(assessmentEquals(mappingA, shuffled) === true, "key order does not affect equality (jsonb safe)");
check(assessmentEquals(mappingA, { ...mappingA, saved_at: "other" }) === false, "saved_at is content-distinct");

// Rejected shapes
check(parseQuestionAssessment({ version: 2, curriculum: "myp" }) === null, "unknown version rejected");
check(parseQuestionAssessment({ version: 1, curriculum: "viking", reference: "x", saved_at: "y" }) === null, "unknown curriculum rejected");
check(validateQuestionAssessment({ ...mappingA, curriculum: "nope" }).ok === false, "invalid curriculum fails validation");

// Strand outside the live reference → rejected at save time
const forged = JSON.parse(JSON.stringify(mappingA));
forged.myp.criteria[0].strands.push({ code: "A(zix)", title: "Fake", description: "Not in reference" });
const forgedResult = validateQuestionAssessment(forged);
check(forgedResult.ok === false && forgedResult.error === "strand", "unknown strand rejected against live reference");

// Criterion outside the group → rejected
const forgedC = JSON.parse(JSON.stringify(mappingA));
forgedC.myp.criteria[0].code = "Z";
check(validateQuestionAssessment(forgedC).ok === false, "unknown criterion rejected");

// Non-MYP elements mapping
const elementsMapping = buildQuestionAssessment({
  curriculum: "ap",
  gradingSystemId: "sys-1",
  elements: [{ code: "S1", label: "Section I — Multiple choice", description: "Weight 50%" }],
});
check(elementsMapping.reference === ORG_CONFIG_REFERENCE, "non-MYP mapping uses org-config reference");
check(validateQuestionAssessment(elementsMapping).ok === true, "AP elements mapping valid");
check(parseQuestionAssessment(JSON.parse(JSON.stringify(elementsMapping))) !== null, "AP mapping round-trips");
check(validateQuestionAssessment({ ...elementsMapping, myp: mappingA.myp }).ok === false, "MYP snapshot on a non-MYP mapping rejected");

// Summary lines for marking
const summary = summarizeQuestionAssessment(mappingA);
check(summary.framework.includes("IB MYP") && summary.framework.includes(mathGroup.group), "summary framework label");
check(summary.lines.length === 2 && summary.lines[0].includes("Criterion A") && summary.lines[0].includes("A(i)"), "summary lines list criteria and strands");

// ── 2. saveQuiz executed (in-memory persistence layer) ───────────────────
const authStub = {
  requireUser: async () => ({ user: { id: "u-test" }, profile: { platform_role: "user", status: "active" } }),
  activeOrg: () => ({ id: "org-1", role: "owner", status: "active" }),
  can: () => true,
  CREATOR_ROLES: ["owner", "admin", "teacher", "organizer"],
};
const entitlementStub = {
  getEntitlementFor: async () => ({ limits: { max_quizzes: 100 }, planName: "Test", withinLimit: true }),
  isFeatureEnabledFor: () => false,
  planLimitMessage: () => "limit",
  withinLimit: () => true,
};
const liveStub = { defaultLiveSessionSettings: {}, loadQuizQuestions: async () => [] };
const platformStub = { isFeatureEnabledFor: () => true };
const utilsStub = { genCode: () => "CODE1" };
const cacheStub = { revalidatePath: () => {} };
const navStub = { redirect: (url) => { const e = new Error(`REDIRECT:${url}`); e.isRedirect = true; e.url = url; throw e; } };

const realQuestionAssessment = await import("../src/lib/questionAssessment.ts");
const realMypExamConfig = await import("../src/lib/mypExamConfig.ts");
const realGradingSystems = await import("../src/lib/gradingSystems.ts");
const realMypReference = await import("../src/lib/mypReference.ts");

function makeDb() {
  const tables = {
    quizzes: [],
    questions: [
      { id: "q1", organization_id: "org-1", config: {}, points: 10 },
      { id: "q2", organization_id: "org-1", config: {}, points: 5 },
    ],
    quiz_questions: [],
  };
  const log = [];
  const match = (row, f) => (f[0] === "__in" ? f[2].includes(row[f[1]]) : row[f[0]] === f[1]);
  const from = (table) => {
    const st = { op: "select", filters: [], nots: [], patch: null, rows: null, head: false, count: false };
    const apply = () => {
      let rows = [...(tables[table] ?? [])];
      rows = rows.filter((r) => st.filters.every((f) => match(r, f)));
      for (const [k, op, val] of st.nots) {
        if (op === "in") {
          const ids = String(val).replace(/[()]/g, "").split(",").filter(Boolean);
          rows = rows.filter((r) => !ids.includes(r[k]));
        }
      }
      return rows;
    };
    const run = async () => {
      if (st.op === "select") {
        const rows = apply();
        return { data: st.head || st.count ? null : rows, count: rows.length, error: null };
      }
      if (st.op === "insert" || st.op === "upsert") {
        const written = [];
        for (const row of st.rows) {
          if (st.op === "upsert" && table === "quiz_questions") {
            const existing = (tables[table] ?? []).find((r) => r.quiz_id === row.quiz_id && r.question_id === row.question_id);
            if (existing) { Object.assign(existing, row); written.push(existing); continue; }
          }
          const stored = { ...row };
          if (!stored.id) stored.id = randomUUID();
          (tables[table] ??= []).push(stored);
          written.push(stored);
        }
        log.push({ table, op: st.op, rows: written });
        return { data: written, error: null };
      }
      if (st.op === "update") {
        const rows = apply();
        rows.forEach((r) => Object.assign(r, st.patch));
        log.push({ table, op: "update", patch: st.patch, ids: rows.map((r) => r.id ?? r.question_id) });
        return { data: rows, error: null };
      }
      if (st.op === "delete") {
        const rows = apply();
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
        log.push({ table, op: "delete", ids: rows.map((r) => r.id ?? r.question_id) });
        return { data: rows, error: null };
      }
      return { data: null, error: { message: "unsupported" } };
    };
    const q = {
      select(cols, opts) {
        if (st.op !== "insert" && st.op !== "upsert") st.op = "select";
        st.head = !!opts?.head;
        st.count = opts?.count === "exact";
        return q;
      },
      insert(rows) { st.op = "insert"; st.rows = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(rows) { st.op = "upsert"; st.rows = Array.isArray(rows) ? rows : [rows]; return q; },
      update(patch) { st.op = "update"; st.patch = patch; return q; },
      delete() { st.op = "delete"; return q; },
      eq(k, v) { st.filters.push([k, v]); return q; },
      in(k, arr) { st.filters.push(["__in", k, arr]); return q; },
      not(k, op, val) { st.nots.push([k, op, val]); return q; },
      order() { return q; },
      async maybeSingle() { const res = await run(); return { data: res.data?.[0] ?? null, error: res.error ?? null }; },
      async single() { const res = await run(); const first = Array.isArray(res.data) ? res.data[0] : res.data; if (res.error || first == null) return { data: null, error: res.error ?? { message: "no rows" } }; return { data: first, error: null }; },
      then(res, rej) { return run().then(res, rej); },
    };
    return q;
  };
  return { from, tables, log };
}

const db = makeDb();
const serverStub = { createClient: async () => db };

const quizActionsFile = path.resolve("scripts/__quiz_actions.cjs");
const paperServiceFile = path.resolve("scripts/__paper_authoring_service.cjs");
const quizActions = (() => {
  const orig = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === quizActionsFile) {
      // The paper save body moved into a shared authoring service (the AI core
      // writes papers through it). Compile the REAL module under this suite's
      // stubs so the persistence assertions still exercise shipped code.
      if (req === "@/lib/services/paperAuthoring") return compileRealModule(paperServiceFile, "src/lib/services/paperAuthoring.ts");
      if (req === "@/lib/auth") return authStub;
      if (req === "@/lib/admin") return { audit: async () => {} };
      if (req === "@/lib/capabilities") return { getCapabilities: async () => ({ entitlement: { modules: null } }), requireModule: () => {} };
      if (req === "@/lib/operationalAccess") return { canOperate: async () => true };
      if (req === "@/lib/entitlements") return entitlementStub;
      if (req === "@/lib/live") return liveStub;
      if (req === "@/lib/platform") return platformStub;
      if (req === "@/lib/supabase/server") return serverStub;
      if (req === "@/lib/utils") return utilsStub;
      if (req === "@/lib/questionAssessment") return realQuestionAssessment;
      if (req === "@/lib/mypExamConfig") return realMypExamConfig;
      if (req === "@/lib/gradingSystems") return realGradingSystems;
      if (req === "@/lib/mypReference") return realMypReference;
      if (req === "next/cache") return cacheStub;
      if (req === "next/navigation") return navStub;
    }
    if (parent?.filename === paperServiceFile) {
      if (req === "server-only") return {};
      if (req === "../operationalAccess") return { canOperate: async () => true };
      if (req === "../entitlements") return entitlementStub;
      if (req === "../questionAssessment") return realQuestionAssessment;
      if (req === "../mypExamConfig") return realMypExamConfig;
      if (req === "../gradingSystems") return realGradingSystems;
      if (req === "../mypReference") return realMypReference;
    }
    return orig.apply(this, arguments);
  };
  const js = ts.transpileModule(readFileSync("src/app/dashboard/quizzes/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const m = new Module(quizActionsFile);
  m.filename = quizActionsFile;
  m.paths = Module._nodeModulePaths(path.dirname(quizActionsFile));
  m._compile(js, quizActionsFile);
  Module._load = orig;
  return m.exports;
})();

const basePayload = {
  title: "MYP Mathematics Paper",
  description: "",
  status: "draft",
  randomize_questions: false,
  randomize_options: false,
  time_per_question_seconds: 30,
  question_ids: ["q1", "q2"],
  calculator: true,
};

// 2a. Create a paper carrying a mapping for q1 only (q2 unmapped).
const createRes = await quizActions.saveQuiz({
  ...basePayload,
  assessment_of: { q1: mappingA },
});
check(createRes.ok === true && Boolean(createRes.id), `paper created: ${createRes.error ?? "ok"}`);
const quizId = createRes.id;
const rowsAfterCreate = db.tables.quiz_questions.filter((r) => r.quiz_id === quizId);
check(rowsAfterCreate.length === 2, "both questions on the paper");
const storedQ1 = rowsAfterCreate.find((r) => r.question_id === "q1");
const storedQ2 = rowsAfterCreate.find((r) => r.question_id === "q2");
check(Boolean(storedQ1?.assessment), "mapping persisted on quiz_questions.assessment");
check(storedQ2?.assessment == null, "question without mapping stays NULL — valid, untouched");

// 2b. Reload (what the edit page reads): mapping round-trips.
const reloaded = parseQuestionAssessment(storedQ1.assessment);
check(Boolean(reloaded) && assessmentEquals(reloaded, mappingA), "reopen paper → saved mapping intact");
const refCii = mathGroup.criteria.find((c) => c.code === "C").strands.find((x) => x.code === "C(ii)");
check(reloaded.myp.criteria[1].strands[0].title === refCii.title && reloaded.myp.criteria[1].strands[0].description === refCii.description, "reference titles survive the round-trip");

// 2c. Re-save with the SAME mapping → no assessment write (attempt-lock safe).
db.log.length = 0;
const unchangedRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { q1: JSON.parse(JSON.stringify(reloaded)) },
});
check(unchangedRes.ok === true, `unchanged re-save ok: ${unchangedRes.error ?? ""}`);
const assessWrites = db.log.filter((e) => e.table === "quiz_questions" && e.op === "update" && e.patch && "assessment" in e.patch);
check(assessWrites.length === 0, "unchanged mapping performs ZERO quiz_questions writes (guard-safe)");

// 2d. Change the mapping (deselect a strand) → single targeted write.
const changed = buildQuestionAssessment({
  curriculum: "myp",
  myp: mypSnapshot(["A", "C"], ["A(i)", "C(ii)"]),
});
db.log.length = 0;
const changeRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { q1: changed },
});
check(changeRes.ok === true, `changed mapping saves: ${changeRes.error ?? ""}`);
const changeWrites = db.log.filter((e) => e.table === "quiz_questions" && e.op === "update" && e.patch && "assessment" in e.patch);
check(changeWrites.length === 1, "exactly one targeted assessment write");
check(assessmentEquals(parseQuestionAssessment(storedQ1.assessment), changed), "stored mapping updated to the deselection");

// 2e. Clear a mapping with null.
const clearRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { q1: null },
});
check(clearRes.ok === true && storedQ1.assessment == null, "null clears the mapping");

// 2f. Restore, then reject an invalid (forged strand) mapping without writing.
const restoreRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { q1: mappingA },
});
check(restoreRes.ok === true && Boolean(storedQ1.assessment), "mapping restorable");
const forgedMapping = JSON.parse(JSON.stringify(mappingA));
forgedMapping.myp.criteria[0].strands.push({ code: "A(nope)", title: "Fake", description: "x" });
db.log.length = 0;
const badRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { q1: forgedMapping },
});
check(Boolean(badRes.error) && badRes.error.includes("(strand)", 0), `invalid mapping rejected with strand code: ${badRes.error ?? ""}`);
check(db.log.filter((e) => e.table === "quiz_questions" && e.op === "update").length === 0, "rejected mapping never writes");

// 2g. assessment_of keys for questions NOT on the paper are ignored.
const foreignRes = await quizActions.saveQuiz({
  ...basePayload,
  id: quizId,
  assessment_of: { "not-on-paper": mappingA },
});
check(foreignRes.ok === true, "foreign assessment keys ignored");

// 2h. Legacy save (no assessment_of at all) — existing papers keep working.
const legacyRes = await quizActions.saveQuiz({ ...basePayload, id: quizId });
check(legacyRes.ok === true, "save without assessment_of still works (existing integrations)");

// ── 3. Paper Builder panel workflow (real components) ────────────────────
const uiStub = {
  Badge: ({ children, tone }) => React.createElement("span", { "data-tone": tone }, children),
  Button: ({ children, ...p }) => React.createElement("button", { type: p.type ?? "button", ...p }, children),
  Field: ({ label, children }) => React.createElement("label", null, label, children),
  Input: (p) => React.createElement("input", p),
  Select: (p) => React.createElement("select", p),
  Textarea: (p) => React.createElement("textarea", p),
  Card: ({ children, ...p }) => React.createElement("div", p, children),
};
const compiledCache = new Map();
function loadTsx(srcPath, outFile, stubFor) {
  if (compiledCache.has(outFile)) return compiledCache.get(outFile);
  const orig = Module._load;
  Module._load = function (req) {
    if (req.startsWith("@/") || req.startsWith("../") || req === "next/navigation" || req === "lucide-react") {
      const stub = stubFor(req);
      if (stub !== undefined) {
        if (stub && stub.__tsx) return loadTsx(stub.__tsx, stub.outFile, stubFor);
        return stub;
      }
    }
    return orig.apply(this, arguments);
  };
  const js = ts.transpileModule(readFileSync(srcPath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const m = new Module(outFile);
  m.filename = outFile;
  m.paths = Module._nodeModulePaths(path.dirname(outFile));
  m._compile(js, outFile);
  Module._load = orig;
  compiledCache.set(outFile, m.exports);
  return m.exports;
}

const captured = { saves: [], pushes: [] };
const routerStub = { push: (u) => captured.pushes.push(u), refresh: () => {}, back: () => {} };
const pbStubFor = (req) => {
  if (req === "@/components/ui") return uiStub;
  if (req === "@/components/RichContent") return { RichContent: ({ text }) => React.createElement("span", null, text) };
  if (req === "../quizzes/actions") return { saveQuiz: async (payload) => { captured.saves.push(payload); return { ok: true, id: "paper-1" }; } };
  if (req === "next/navigation") return { useRouter: () => routerStub };
  if (req === "lucide-react") return { ArrowDown: () => null, ArrowUp: () => null, X: () => null, Plus: () => null, Trash2: () => null };
  if (req === "@/components/grading/QuestionAssessmentPanel") return { __tsx: "src/components/grading/QuestionAssessmentPanel.tsx", outFile: path.resolve("scripts/__qa_panel.cjs") };
  if (req === "@/lib/gradingSystems") return realGradingSystems;
  if (req === "@/lib/mypReference") return realMypReference;
  if (req === "@/lib/mypExamConfig") return realMypExamConfig;
  if (req === "@/lib/questionAssessment") return realQuestionAssessment;
  return undefined;
};
const PaperBuilder = loadTsx(
  "src/app/dashboard/paper-builder/PaperBuilder.tsx",
  path.resolve("scripts/__paper_builder.cjs"),
  pbStubFor,
).PaperBuilder;

const bank = [
  { id: "q1", type: "open_ended", prompt: "Solve the quadratic", points: 10, status: "published", topic: null },
  { id: "q2", type: "single_choice", prompt: "2 + 2 = ?", points: 5, status: "published", topic: null },
];
const gradingSystems = [
  { id: "sys-myp", name: "MYP Assessment Framework", curriculum: "myp", config: { pass_percent: 50 } },
  { id: "sys-ap", name: "AP Calculus", curriculum: "ap", config: { ap_sections: [{ name: "Section I — Multiple choice", weight_percent: 50 }] } },
];
const findAll = (node, pred, out = []) => {
  if (node && typeof node === "object") {
    if (Array.isArray(node)) { node.forEach((x) => findAll(x, pred, out)); return out; }
    if (node.props !== undefined && pred(node)) out.push(node);
    if (node.props) findAll(node.props, pred, out);
    if (node.children) findAll(node.children, pred, out);
  }
  return out;
};
const textOf = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (typeof node === "object") {
    const fromProps = node.props && "children" in node.props ? textOf(node.props.children) : "";
    const fromInstances = Array.isArray(node.children) ? node.children.map(textOf).join("") : "";
    return `${fromProps}${fromInstances}`;
  }
  return "";
};
const byTestId = (tree, id) => tree.root.findAll((x) => x.props?.["data-testid"] === id)[0];

const initial = {
  id: "paper-1",
  title: "MYP Mathematics Paper",
  description: "",
  status: "draft",
  randomize_questions: false,
  randomize_options: false,
  time_per_question_seconds: 30,
  question_ids: ["q1", "q2"],
  sections: [
    { id: "A", title: "SECTION A", instructions: "" },
    { id: "B", title: "SECTION B", instructions: "" },
  ],
  calculator: true,
  calculator_mode: "scientific",
  calculator_angle_mode: "deg",
  exam_period: "",
  academic_year: "",
  grade_label: "",
  subject: "",
  instructions: "",
  template_id: "",
};

let tree;
act(() => {
  tree = TestRenderer.create(
    React.createElement(PaperBuilder, { initial, bank, templates: [], gradingSystems }),
  );
});

// Panel present per selected question, distinct from content/marks/section
check(!!byTestId(tree, "assessment-mapping-1"), "question 1 has an Assessment mapping panel");
check(!!byTestId(tree, "assessment-mapping-2"), "question 2 has an Assessment mapping panel");
check(textOf(tree.root).includes("Assessment mapping"), "panel is clearly labelled");

// Open framework → IB MYP
const curriculumSel = byTestId(tree, "assessment-curriculum");
check(!!curriculumSel, "framework select exists inside the panel");
act(() => { curriculumSel.props.onChange({ target: { value: "myp" } }); });
check(!!byTestId(tree, "assessment-myp"), "MYP subject-group + criteria UI appears");

// Subject group = Mathematics (reference-driven,8 groups)
const groupSel = byTestId(tree, "assessment-group");
check(!!groupSel, "subject group select present");
const groupOptions = (groupSel.props.children ?? []).map((o) => o?.props?.value);
check(groupOptions.includes("mathematics") && groupOptions.length === MYP_SUBJECT_GROUP_REFERENCE.length, "every reference subject group offered");
check(groupSel.props.value === "mathematics" || groupOptions.includes(groupSel.props.value), "group selection state valid");

// Criteria A–D come from the reference with descriptions
const refCodes = mathGroup.criteria.map((c) => c.code);
for (const code of refCodes) {
  check(Boolean(byTestId(tree, `assessment-criterion-check-${code}`)), `criterion ${code} checkbox rendered from reference`);
}
const critA = byTestId(tree, "assessment-criterion-check-A");
const mypText = textOf(tree.root);
check(mypText.includes(`Criterion A — ${mathGroup.criteria[0].title}`), "criterion A labelled with its reference title");
// Strand checkboxes appear only after selecting a criterion? (rendered inside selected block)
check(!byTestId(tree, "assessment-strand-check-A(i)"), "strands hidden until criterion selected");

// Select Criterion A → strands with real descriptions become available
act(() => { critA.props.onChange({ target: { checked: true } }); });
const strandAi = byTestId(tree, "assessment-strand-check-A(i)");
check(!!strandAi, "criterion A expands its strands");
check(textOf(tree.root).includes(mathGroup.criteria[0].strands[0].description), "strand shows its actual reference description");

// Select specific strands (more than one)
act(() => { strandAi.props.onChange({ target: { checked: true } }); });
act(() => { byTestId(tree, "assessment-strand-check-A(iii)").props.onChange({ target: { checked: true } }); });

// Criterion marks input (allocation where relevant)
const marksA = byTestId(tree, "assessment-marks-A");
check(!!marksA, "criterion marks input available");
act(() => { marksA.props.onChange({ target: { value: "8" } }); });

// Add Criterion C + its strand (multiple criteria per question)
act(() => { byTestId(tree, "assessment-criterion-check-C").props.onChange({ target: { checked: true } }); });
check(!!byTestId(tree, "assessment-criterion-C"), "criterion C block visible after selection");
act(() => { byTestId(tree, "assessment-strand-check-C(ii)").props.onChange({ target: { checked: true } }); });

// Save the paper → payload carries the mapping for q1 only
const saveBtn = findAll(tree.root, (x) => x.type === "button" && textOf(x).includes("Save paper"))[0];
check(!!saveBtn, "Save paper button present");
await act(async () => { saveBtn.props.onClick(); });
await new Promise((r) => setTimeout(r, 0));
check(captured.saves.length === 1, "saveQuiz invoked once");
const payload = captured.saves[0];
check(payload.question_ids.join(",") === "q1,q2", "question order preserved in save");
const pMap = payload.assessment_of?.q1;
check(Boolean(pMap) && pMap.curriculum === "myp", "payload carries q1 MYP mapping");
check(pMap.myp.subject_group === "mathematics", "payload subject group mathematics");
check(pMap.myp.criteria.map((c) => c.code).join(",") === "A,C", "payload criteria A+C (multiple criteria per question)");
check(pMap.myp.criteria[0].strands.map((s) => s.code).join(",") === "A(i),A(iii)", "payload strands A(i)+A(iii) (multiple strands)");
check(pMap.myp.criteria[0].marks === 8, "payload criterion marks allocation");
check(pMap.reference === MYP_REFERENCE_SNAPSHOT, "payload snapshot label");
check(!("q2" in payload.assessment_of) || payload.assessment_of.q2 == null, "unmapped question has no mapping in payload — remains valid");
check(validateQuestionAssessment(pMap).ok === true, "payload passes server-side validation");

// Deselect a strand → payload reflects removal
act(() => { byTestId(tree, "assessment-strand-check-A(i)").props.onChange({ target: { checked: false } }); });
await act(async () => { saveBtn.props.onClick(); });
await new Promise((r) => setTimeout(r, 0));
const payload2 = captured.saves[1];
check(payload2.assessment_of.q1.myp.criteria[0].strands.map((s) => s.code).join(",") === "A(iii)", "deselected strand removed from payload");

// Clear the whole mapping
const clearBtn = byTestId(tree, "assessment-clear");
check(!!clearBtn, "Remove mapping control present");
act(() => { clearBtn.props.onClick(); });
await act(async () => { saveBtn.props.onClick(); });
await new Promise((r) => setTimeout(r, 0));
const payload3 = captured.saves[2];
check(payload3.assessment_of.q1 === null, "clearing emits null (mapping removed)");

// Reopen: saved mapping restores panel state (criteria/strands pre-checked)
act(() => { tree.unmount(); });
act(() => {
  tree = TestRenderer.create(
    React.createElement(PaperBuilder, {
      initial: { ...initial, assessment_of: { q1: mappingA } },
      bank,
      templates: [],
      gradingSystems,
    }),
  );
});
check(textOf(tree.root).includes("IB MYP"), "reopened paper shows the mapped framework in the summary");
const reopenedA = byTestId(tree, "assessment-criterion-check-A");
check(Boolean(reopenedA) && reopenedA.props.checked === true, "criterion A pre-checked on reopen");
const reopenedStrand = byTestId(tree, "assessment-strand-check-A(i)");
check(Boolean(reopenedStrand) && reopenedStrand.props.checked === true, "strand A(i) pre-checked on reopen");
const reopenedC = byTestId(tree, "assessment-criterion-check-C");
check(Boolean(reopenedC) && reopenedC.props.checked === true, "criterion C pre-checked on reopen");

// Existing paper WITHOUT mappings reopens cleanly (assessment_of empty)
act(() => { tree.unmount(); });
act(() => {
  tree = TestRenderer.create(
    React.createElement(PaperBuilder, { initial: { ...initial, assessment_of: {} }, bank, templates: [], gradingSystems }),
  );
});
check(!!byTestId(tree, "assessment-mapping-1"), "unmapped existing paper still renders its panels");
check(textOf(tree.root).includes("not mapped"), "unmapped summary states 'not mapped'");

// Non-MYP framework: AP with elements (Part 4 extensibility)
act(() => { tree.unmount(); });
act(() => {
  tree = TestRenderer.create(
    React.createElement(PaperBuilder, { initial, bank, templates: [], gradingSystems }),
  );
});
act(() => { byTestId(tree, "assessment-curriculum").props.onChange({ target: { value: "ap" } }); });
check(!!byTestId(tree, "assessment-elements"), "AP framework shows the generic elements editor");
// Attach the org's AP grading system so its configured sections can be imported.
const apSystemSel = byTestId(tree, "assessment-system");
check(!!apSystemSel, "grading-system selector offered for the AP framework");
act(() => { apSystemSel.props.onChange({ target: { value: "sys-ap" } }); });
const importBtn = byTestId(tree, "assessment-import-sections");
check(!!importBtn, "AP grading-system sections can be imported as elements");
act(() => { importBtn.props.onClick(); });
const addBtn = byTestId(tree, "assessment-element-add");
check(!!addBtn, "add-element control present");
act(() => { addBtn.props.onClick(); });
const labelInput = byTestId(tree, "assessment-element-label-0");
act(() => { labelInput.props.onChange({ target: { value: "CED Unit 1" } }); });
await act(async () => { findAll(tree.root, (x) => x.type === "button" && textOf(x).includes("Save paper"))[0].props.onClick(); });
await new Promise((r) => setTimeout(r, 0));
const apPayload = captured.saves[captured.saves.length - 1];
check(apPayload.assessment_of.q1.curriculum === "ap", "AP mapping saved with its own curriculum");
check(apPayload.assessment_of.q1.elements?.some((e) => e.label === "CED Unit 1"), "teacher-defined element persisted (no invented official wording)");
check(validateQuestionAssessment(apPayload.assessment_of.q1).ok === true, "AP mapping passes validation");

// ── 4. Marking badges render ─────────────────────────────────────────────
const badgesFile = path.resolve("scripts/__badges.cjs");
const Badges = loadTsx(
  "src/components/grading/QuestionAssessmentBadges.tsx",
  badgesFile,
  (req) => {
    if (req === "@/components/ui") return uiStub;
    if (req === "@/lib/questionAssessment") return realQuestionAssessment;
    return undefined;
  },
).QuestionAssessmentBadges;

const badgeHtml = renderToStaticMarkup(React.createElement(Badges, { assessment: mappingA }));
check(badgeHtml.includes("IB MYP"), "badges show the framework");
check(badgeHtml.includes(`question-assessment-strand-A(i)`), "marked strand A(i) visible to the marker");
check(badgeHtml.includes(`question-assessment-strand-C(ii)`), "marked strand C(ii) visible to the marker");
check(badgeHtml.includes("Criterion A"), "criterion visible in marking");
check(badgeHtml.includes(MYP_REFERENCE_SNAPSHOT), "snapshot label visible (historical integrity)");
const emptyBadge = renderToStaticMarkup(React.createElement(Badges, { assessment: null }));
check(emptyBadge === "", "no mapping → no badge (nothing decorative forced on the marker)");

// ── 5. Integration wiring (source assertions) ────────────────────────────
const examPage = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
check(examPage.includes('select("question_id, points, assessment")'), "exam page loads question-level assessment from the paper");
check(examPage.includes("assessmentByQuestion"), "exam page indexes assessment per question");
check((examPage.match(/<QuestionAssessmentBadges/g) ?? []).length >= 2, "badges rendered in BOTH marking queue and moderation list");

const paperEditPage = readFileSync("src/app/dashboard/paper-builder/[id]/page.tsx", "utf8");
check(paperEditPage.includes("quiz_questions(question_id, position, assessment)"), "edit page reloads saved mappings");
check(paperEditPage.includes("parseQuestionAssessment"), "edit page parses stored snapshots");
check(paperEditPage.includes("grading_systems"), "edit page loads org grading systems for the mapping UI");

const paperNewPage = readFileSync("src/app/dashboard/paper-builder/new/page.tsx", "utf8");
check(paperNewPage.includes("grading_systems"), "new-paper page loads grading systems too");

// The save body moved into the shared authoring service (the AI core writes
// papers through the same guards), so the mapping contract is asserted there.
// The action must still be the thin browser adapter for that service.
const quizActionsSrc = readFileSync("src/app/dashboard/quizzes/actions.ts", "utf8");
const paperServiceSrc = readFileSync("src/lib/services/paperAuthoring.ts", "utf8");
check(paperServiceSrc.includes("assessment_of"), "saveQuiz schema accepts assessment_of");
check(paperServiceSrc.includes("validateQuestionAssessment"), "saveQuiz validates mappings server-side");
check(paperServiceSrc.includes("assessmentEquals"), "saveQuiz skips unchanged mappings (attempt-lock safe)");
check(paperServiceSrc.includes("friendlySaveError"), "guard errors stay friendly after mapping writes");
check(quizActionsSrc.includes("savePaperForActor"), "the workspace save delegates to that one implementation");

const examActionsSrc = readFileSync("src/app/dashboard/exams/actions.ts", "utf8");
check(examActionsSrc.includes('from("quiz_questions")'), "exam workflow reads the paper through quiz_questions (mapping carries over)");
check(!examActionsSrc.includes("assessment_of"), "exam creation does NOT require re-entering mappings (paper carries them)");

const pbSrc = readFileSync("src/app/dashboard/paper-builder/PaperBuilder.tsx", "utf8");
check(pbSrc.includes("QuestionAssessmentPanel"), "panel integrated into the builder");
check(pbSrc.includes("assessment_of"), "builder submits assessment_of");
check(pbSrc.includes("assessment-mapping-"), "panel testid per question");

const migration = readFileSync("supabase/migrations/20261124210000_question_assessment_mapping.sql", "utf8");
check(migration.includes("add column if not exists assessment jsonb"), "migration is additive");
check(migration.includes("No existing column, row, constraint, policy or trigger is"), "migration states non-destructive scope");

console.log(`question-assessment-mapping: ${n} checks passed`);
