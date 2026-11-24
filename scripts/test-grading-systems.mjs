// Configurable grading engine (§ Flexible grading engine): Beninese /20 with
// coefficients, custom boundaries, AP section weights with NO fabricated 1–5
// scale, MYP pointer — plus the org configuration UI wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  GRADING_CURRICULA,
  BENIN_DEFAULT_LETTERS,
  gradeBenin,
  weightedAverage,
  gradeFromBoundaries,
  gradeAp,
  gradeCambridge,
  cambridgeSectionsPercent,
  applyGrading,
} from "../src/lib/gradingSystems.ts";

// ── curriculum families ──────────────────────────────────────────────────
assert.deepEqual([...GRADING_CURRICULA], ["myp", "ap", "beninese", "custom", "cambridge", "british"]);
assert.ok(BENIN_DEFAULT_LETTERS.length >= 5, "default francophone letter ladder present");

// ── Beninese /20 ─────────────────────────────────────────────────────────
const benin = gradeBenin(15, {});
assert.equal(benin.mark20, 15, "mark already on /20 stays /20");
assert.equal(benin.percent, 75);
assert.equal(benin.letter, "Assez Bien", "15/20 → Assez Bien with the default ladder");

const scaled = gradeBenin(30, { scale_max: 40 });
assert.equal(scaled.mark20, 15, "40-scale mark converted to /20");
assert.equal(scaled.letter, "Assez Bien");

const customLetters = gradeBenin(17, { scale_max: 20, benin_letters: [{ min: 16, label: "B+" }, { min: 0, label: "E" }] });
assert.equal(customLetters.letter, "B+", "org-configured letters win over defaults");

assert.equal(gradeBenin("n/a", {}).mark20, null, "non-numeric mark → null, never NaN");

// ── weighted average (subject coefficients) ──────────────────────────────
assert.equal(weightedAverage([{ mark: 15, coefficient: 3 }, { mark: 12, coefficient: 1 }]), 14.25, "Σ(mark×coef)÷Σcoef");
assert.equal(weightedAverage([{ mark: 10 }, { mark: 20 }]), 15, "missing coefficient defaults to 1");
assert.equal(weightedAverage([]), null, "no rows → null");
assert.equal(weightedAverage([{ mark: 15, coefficient: 0 }]), null, "invalid coefficients ignored");

// ── custom boundaries ────────────────────────────────────────────────────
const boundaries = [
  { min_percent: 0, label: "F" },
  { min_percent: 50, label: "D" },
  { min_percent: 60, label: "C" },
  { min_percent: 70, label: "B" },
  { min_percent: 80, label: "A" },
];
assert.equal(gradeFromBoundaries(85, boundaries), "A");
assert.equal(gradeFromBoundaries(70, boundaries), "B", "inclusive threshold");
assert.equal(gradeFromBoundaries(49.9, boundaries), "F");
assert.equal(gradeFromBoundaries(85, []), null, "no boundaries → null, not a guess");

// ── AP: never fabricates the 1–5 scale ───────────────────────────────────
const apConfig = {
  ap_course: "AP Calculus AB",
  ap_sections: [
    { name: "Section I — Multiple choice", weight_percent: 50 },
    { name: "Section II — Free response", weight_percent: 50 },
  ],
};
const apScored = gradeAp(
  [
    { name: "Section I — Multiple choice", raw: 40, max: 50 },
    { name: "Section II — Free response", raw: 14, max: 20 },
  ],
  apConfig,
);
assert.equal(apScored.percent, 75, "weighted section percent (80×50 + 70×50)/100");
assert.equal(apScored.score, null, "no thresholds configured → NO invented score");
assert.equal(apScored.note, "score_thresholds_not_configured");

const apWithThresholds = gradeAp(
  [
    { name: "Section I — Multiple choice", raw: 45, max: 50 },
    { name: "Section II — Free response", raw: 18, max: 20 },
  ],
  { ...apConfig, ap_score_thresholds: [{ score: 5, min_percent: 90 }, { score: 4, min_percent: 80 }] },
);
assert.equal(apWithThresholds.percent, 90);
assert.equal(apWithThresholds.score, 5, "organisation-supplied threshold applied");

const apPartial = gradeAp([{ name: "Section I — Multiple choice", raw: 40, max: 50 }], apConfig);
assert.equal(apPartial.percent, 80, "unscored section renormalised (provisional)");
assert.equal(apPartial.score, null);

assert.equal(gradeAp([], {}).note, "no_sections_configured", "empty config reported honestly");

// ── dispatcher ───────────────────────────────────────────────────────────
const beninOutcome = applyGrading({ id: "g1", organization_id: "o", name: "Grade 10", curriculum: "beninese", config: {} }, { mark: 16 });
assert.equal(beninOutcome.mark20, 16);
assert.equal(beninOutcome.label, "Bien");
assert.equal(beninOutcome.curriculum, "beninese");

const weightedOutcome = applyGrading(
  { id: "g2", organization_id: "o", name: "Benin weighted", curriculum: "beninese", config: {} },
  { rows: [{ mark: 15, coefficient: 3 }, { mark: 12, coefficient: 1 }] },
);
assert.equal(weightedOutcome.mark20, 14.25);

const customOutcome = applyGrading(
  { id: "g3", organization_id: "o", name: "Custom", curriculum: "custom", config: { boundaries } },
  { mark: 85, scale_max: 100 },
);
assert.equal(customOutcome.percent, 85);
assert.equal(customOutcome.label, "A");

const mypOutcome = applyGrading(
  { id: "g4", organization_id: "o", name: "MYP", curriculum: "myp", config: {} },
  { mark: 42, scale_max: 60 },
);
assert.equal(mypOutcome.percent, 70, "MYP reports percent only");
assert.equal(mypOutcome.label, null, "MYP levels come from myp results, never guessed here");
assert.equal(mypOutcome.note, "see_myp_results_for_levels");

const camOutcome = applyGrading(
  { id: "g5", organization_id: "o", name: "British", curriculum: "british", config: { boundaries } },
  { mark: 72, scale_max: 100 },
);
assert.equal(camOutcome.label, "B", "cambridge/british fall through to boundaries");

const emptyOutcome = applyGrading(
  { id: "g6", organization_id: "o", name: "Empty", curriculum: "custom", config: {} },
  {},
);
assert.equal(emptyOutcome.note, "no_marks", "missing marks reported, not invented");

// ── configuration UI + persistence wiring ────────────────────────────────
const page = readFileSync("src/app/dashboard/grading/page.tsx", "utf8");
assert.ok(page.includes("grading_systems"), "org grading systems page reads stored configs");
assert.ok(page.includes("GradingSystemsClient"), "configurator rendered");

const client = readFileSync("src/components/grading/GradingSystemsClient.tsx", "utf8");
assert.ok(client.includes("beninese") && client.includes("ap") && client.includes("custom"), "families offered");
assert.ok(client.includes("scale_max"), "Beninese scale configured");
assert.ok(client.includes("ap_score_thresholds") || client.includes("ap_threshold"), "AP thresholds optional and explicit");
assert.ok(client.includes("never invented") || client.includes("never"), "AP scale honesty stated in UI");

const actions = readFileSync("src/app/dashboard/grading/actions.ts", "utf8");
assert.ok(actions.includes("MANAGER_ROLES"), "manager-only configuration");
assert.ok(actions.includes("audit("), "configuration changes audited");
assert.ok(actions.includes("setExamGradingSystem"), "per-examination attachment action");
assert.ok(actions.includes("setQuizGradingSystem"), "per-quiz attachment action");
assert.ok(actions.includes("eq(\"organization_id\", org.id)"), "tenant-scoped everywhere");

const workspace = readFileSync("src/app/dashboard/exams/[id]/page.tsx", "utf8");
assert.ok(workspace.includes("Grading configuration"), "exam workspace hosts the selection");
assert.ok(workspace.includes("grading_system_id"), "exam settings store the chosen system");

const quizPage = readFileSync("src/app/dashboard/quizzes/[id]/page.tsx", "utf8");
assert.ok(quizPage.includes("quiz-grading-config"), "quiz workspace hosts the selection");

const migration = readFileSync("supabase/migrations/20261124200000_formula_library_teacher_subjects_grading_systems.sql", "utf8");
assert.ok(migration.includes("create table if not exists public.grading_systems"), "grading_systems table exists");
assert.ok(migration.includes("curriculum text not null"), "curriculum column present");


// ══════════════════════════════════════════════════════════════════════
// PART 1 — curriculum dropdown behaviour + save/reload workflow (executed)
// ══════════════════════════════════════════════════════════════════════
import { Module } from "node:module";
import { randomUUID } from "node:crypto";
import path from "node:path";
import ts from "typescript";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let extra = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); extra += 1; };

// ── A. Interactive curriculum dropdown (real component, real state) ──────
const clientFile = path.resolve("scripts/__grading_client.cjs");
const loadTranspiled = (srcPath, outFile, stubFor) => {
  const orig = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === outFile || parent?.filename === srcPath) {
      const stub = stubFor(req);
      if (stub !== undefined) return stub;
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
  return m.exports;
};

const uiStub = {
  Badge: ({ children, tone }) => React.createElement("span", { "data-tone": tone }, children),
  Button: ({ children, ...p }) => React.createElement("button", { type: p.type ?? "button", ...p }, children),
  Field: ({ label, children }) => React.createElement("label", null, label, children),
  Input: (p) => React.createElement("input", p),
  Select: (p) => React.createElement("select", p),
  Textarea: (p) => React.createElement("textarea", p),
  Card: ({ children, ...p }) => React.createElement("div", p, children),
};
const clientExports = loadTranspiled(
  "src/components/grading/GradingSystemsClient.tsx",
  clientFile,
  (req) => {
    if (req === "@/components/ui") return uiStub;
    if (req === "@/app/dashboard/grading/actions") return { saveGradingSystem: () => {}, archiveGradingSystem: () => {} };
    if (req === "lucide-react") return { Plus: () => null, Pencil: () => null };
    return undefined;
  },
);
const GradingSystemsClient = clientExports.GradingSystemsClient;

const textOf = (node) => {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (typeof node === "object") return `${textOf(node.props?.children ?? "")}`;
  return "";
};
const findAll = (node, pred, out = []) => {
  if (node && typeof node === "object") {
    if (Array.isArray(node)) { node.forEach((x) => findAll(x, pred, out)); return out; }
    if (node.props !== undefined && pred(node)) out.push(node);
    if (node.props) findAll(node.props, pred, out);
    if (node.children) findAll(node.children, pred, out);
  }
  return out;
};
const existingRow = { id: "g1", name: "Benin /20", curriculum: "beninese", subject_id: null, grade_label: null, assessment_kind: "any", config: { scale_max: 20, pass_percent: 50 }, status: "active" };
let tree;
const mount = (systems) => {
  act(() => { tree = TestRenderer.create(React.createElement(GradingSystemsClient, { systems, subjects: [], canEdit: true })); });
};
const click = (node) => act(() => { node.props.onClick(); });

mount([existingRow]);
// New → editor opens, dropdown enabled with every curriculum option
const newBtn = findAll(tree.root, (n) => n.type === "button" && textOf(n).includes("New grading system"))[0];
ok(!!newBtn, "New grading system button renders");
click(newBtn);
let sel = tree.root.findAll((n) => n.type === "select" && n.props.name === "curriculum")[0];
ok(!!sel, "curriculum select renders in the editor");
ok(!sel.props.disabled, "curriculum select is ENABLED when creating");
const optionValues = (sel.props.children ?? []).map((o) => o?.props?.value);
assert.deepEqual(optionValues, ["beninese", "custom", "ap", "myp", "cambridge", "british"], "all six curricula offered");
extra += 1;
// Changing curriculum actually drives the form (sections switch)
act(() => { sel.props.onChange({ target: { value: "myp" } }); });
sel = tree.root.findAll((n) => n.type === "select" && n.props.name === "curriculum")[0];
ok(sel.props.value === "myp", "controlled value follows the selection");
ok(findAll(tree.root, (n) => n.type === "p").some((p) => textOf(p).includes("MYP achievement levels")), "framework-specific section switches to MYP");
act(() => { sel.props.onChange({ target: { value: "beninese" } }); });
ok(findAll(tree.root, (n) => n.type === "p").some((p) => textOf(p).includes("Beninese /20 rules")), "switching back restores Beninese rules");

// Edit → the curriculum select must stay ENABLED (a disabled select posts
// nothing, which was the root cause of every edit-save failing).
act(() => { tree.unmount(); });
mount([existingRow]);
const editBtn = findAll(tree.root, (n) => n.type === "button" && n.props["aria-label"] === "Edit Benin /20")[0];
ok(!!editBtn, "edit button renders for the stored system");
click(editBtn);
const editSel = tree.root.findAll((n) => n.type === "select" && n.props.name === "curriculum")[0];
ok(!!editSel && !editSel.props.disabled, "curriculum select is ENABLED when editing (regression: was disabled → empty POST → ?e=fields)");
ok(editSel.props.value === "beninese", "edit reopens with the persisted curriculum selected");
const editFields = tree.root.findAll((n) => n.type === "input" || n.type === "select").map((n) => ({ name: n.props.name, disabled: !!n.props.disabled }));
ok(editFields.every((f) => !f.disabled), "no form field is disabled on edit — every value submits");
ok(editFields.some((f) => f.name === "curriculum"), "curriculum field present in the edit POST");

// ── B. saveGradingSystem executed against a fake persistence layer ──────
const authStub = {
  requireUser: async () => ({ user: { id: "u-test" }, profile: { platform_role: "user", status: "active" } }),
  activeOrg: () => ({ id: "org-1", role: "owner", status: "active" }),
  can: () => true,
  CREATOR_ROLES: ["owner", "admin", "teacher", "organizer"],
  MANAGER_ROLES: ["owner", "admin"],
};
const auditCalls = [];
const adminStub = { audit: async (...args) => { auditCalls.push(args); } };
const realGrading = await import("../src/lib/gradingSystems.ts");
const realMypExam = await import("../src/lib/mypExamConfig.ts");

function makeDb() {
  const tables = { grading_systems: [], subjects: [] };
  const match = (row, f) => {
    if (f[0] === "__in") return f[2].includes(row[f[1]]);
    return row[f[0]] === f[1];
  };
  const from = (table) => {
    const st = { op: "select", filters: [], nots: [], patch: null, rows: null, head: false };
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
        return { data: st.head ? null : rows, count: st.head ? rows.length : null, error: null };
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
          // Mirror the DB default so tests read the same row production does.
          if (table === "grading_systems" && !stored.status) stored.status = "active";
          (tables[table] ??= []).push(stored);
          written.push(stored);
        }
        return { data: written, error: null };
      }
      if (st.op === "update") {
        const rows = apply();
        rows.forEach((r) => Object.assign(r, st.patch));
        return { data: rows, error: null };
      }
      if (st.op === "delete") {
        const rows = apply();
        tables[table] = (tables[table] ?? []).filter((r) => !rows.includes(r));
        return { data: rows, error: null };
      }
      return { data: null, error: { message: "unsupported" } };
    };
    const q = {
      select(cols, opts) { if (st.op !== "insert" && st.op !== "upsert") st.op = "select"; st.head = !!opts?.head; return q; },
      insert(rows) { st.op = "insert"; st.rows = Array.isArray(rows) ? rows : [rows]; return q; },
      upsert(rows) { st.op = "upsert"; st.rows = Array.isArray(rows) ? rows : [rows]; return q; },
      update(patch) { st.op = "update"; st.patch = patch; return q; },
      delete() { st.op = "delete"; return q; },
      eq(k, v) { st.filters.push([k, v]); return q; },
      in(k, arr) { st.filters.push(["__in", k, arr]); return q; },
      not(k, op, val) { st.nots.push([k, op, val]); return q; },
      order() { return q; },
      async maybeSingle() {
        const res = await run();
        return { data: res.data?.[0] ?? null, error: res.error ?? null };
      },
      async single() {
        const res = await run();
        const first = Array.isArray(res.data) ? res.data[0] : res.data;
        if (res.error || first == null) return { data: null, error: res.error ?? { message: "no rows" } };
        return { data: first, error: null };
      },
      then(resolve, reject) {
        return run().then(resolve, reject);
      },
    };
    return q;
  };
  return { from, tables };
}

const db = makeDb();
const serverStub = { createClient: async () => db };
const navStub = {
  redirect: (url) => { const e = new Error(`REDIRECT:${url}`); e.isRedirect = true; e.url = url; throw e; },
};
const cacheStub = { revalidatePath: () => {} };

const actionsFile = path.resolve("scripts/__grading_actions.cjs");
const gradingActionsExec = (() => {
  const orig = Module._load;
  Module._load = function (req, parent) {
    if (parent?.filename === actionsFile) {
      if (req === "@/lib/auth") return authStub;
      if (req === "@/lib/admin") return adminStub;
      if (req === "@/lib/supabase/server") return serverStub;
      if (req === "@/lib/gradingSystems") return realGrading;
      if (req === "@/lib/mypExamConfig") return realMypExam;
      if (req === "next/cache") return cacheStub;
      if (req === "next/navigation") return navStub;
    }
    return orig.apply(this, arguments);
  };
  const js = ts.transpileModule(readFileSync("src/app/dashboard/grading/actions.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const m = new Module(actionsFile);
  m.filename = actionsFile;
  m.paths = Module._nodeModulePaths(path.dirname(actionsFile));
  m._compile(js, actionsFile);
  Module._load = orig;
  return m.exports;
})();

const runSave = async (fields) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const item of v) fd.append(k, String(item));
    else fd.append(k, String(v));
  }
  try {
    await gradingActionsExec.saveGradingSystem(fd);
    return { url: null };
  } catch (e) {
    if (e?.isRedirect) return { url: e.url };
    throw e;
  }
};

// B1. CREATE succeeds and the row persists (reload = read the stored row).
const created = await runSave({ name: "Grade 10 /20", curriculum: "beninese", assessment_kind: "exam", pass_percent: "50", scale_max: "20", benin_min: ["18", "0"], benin_label: ["Très Bien", "Insuffisant"] });
assert.equal(created.url, "/dashboard/grading?ok=saved", "create redirects to ok=saved");
extra += 1;
const row1 = db.tables.grading_systems[0];
ok(!!row1, "create inserted a grading_systems row");
ok(row1.curriculum === "beninese" && row1.status === "active" && row1.organization_id === "org-1", "row stores curriculum/status/org");
ok(row1.config.scale_max === 20 && Array.isArray(row1.config.benin_letters) && row1.config.benin_letters[0].label === "Très Bien", "rule config persisted");
ok(auditCalls.some((c) => c[1] === "grading_system.created"), "creation audited");

// B2. EDIT with NO curriculum field in the POST (the old disabled-select
//     payload) must NOT fail — it falls back to the stored curriculum.
const editNoCurriculum = await runSave({ id: row1.id, name: "Grade 10 /20 (edited)", assessment_kind: "any", pass_percent: "45" });
assert.equal(editNoCurriculum.url, "/dashboard/grading?ok=saved", "edit without curriculum field still saves (regression: ?e=fields)");
extra += 1;
ok(db.tables.grading_systems[0].name === "Grade 10 /20 (edited)", "edited name persisted");
ok(db.tables.grading_systems[0].curriculum === "beninese", "curriculum preserved via stored-row fallback");
ok(db.tables.grading_systems[0].config.pass_percent === 45, "config updated on edit");

// B3. EDIT that genuinely changes curriculum applies the new framework.
const editChange = await runSave({ id: row1.id, name: "Custom scheme", curriculum: "custom", assessment_kind: "any", pass_percent: "50", boundary_min: ["80", "0"], boundary_label: ["A", "F"] });
assert.equal(editChange.url, "/dashboard/grading?ok=saved", "curriculum change on edit saves");
extra += 1;
ok(db.tables.grading_systems[0].curriculum === "custom", "curriculum switch persisted");
ok(Array.isArray(db.tables.grading_systems[0].config.boundaries) && db.tables.grading_systems[0].config.boundaries.length === 2, "custom boundaries persisted");

// B4. CREATE without a curriculum is genuinely invalid.
const noCurriculum = await runSave({ name: "No framework", assessment_kind: "any" });
assert.equal(noCurriculum.url, "/dashboard/grading?e=fields", "create without curriculum rejected with fields");
extra += 1;

// B5. Editing a foreign/unknown id fails cleanly.
const unknown = await runSave({ id: "11111111-2222-3333-4444-555555555555", name: "Ghost", curriculum: "ap" });
assert.equal(unknown.url, "/dashboard/grading?e=missing", "unknown id rejected with missing");
extra += 1;

// B6. Subject must belong to the acting organisation.
const foreignSubjectId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
db.tables.subjects.push({ id: foreignSubjectId, organization_id: "org-other", name: "Maths" });
const foreignSubject = await runSave({ name: "With subject", curriculum: "myp", subject_id: foreignSubjectId });
assert.equal(foreignSubject.url, "/dashboard/grading?e=subject", "foreign subject rejected");
extra += 1;

// B7. Archive / restore round-trip keeps the row (no deletion).
const archiveRun = async (id) => {
  const fd = new FormData();
  fd.append("id", id);
  try { await gradingActionsExec.archiveGradingSystem(fd); return null; } catch (e) { if (e?.isRedirect) return e.url; throw e; }
};
const archivedUrl = await archiveRun(row1.id);
assert.equal(archivedUrl, "/dashboard/grading?ok=archived", "archive redirects ok=archived");
extra += 1;
ok(db.tables.grading_systems[0].status === "archived", "row archived, not deleted");
const restoredUrl = await archiveRun(row1.id);
assert.equal(restoredUrl, "/dashboard/grading?ok=restored", "restore redirects ok=restored");
extra += 1;
ok(db.tables.grading_systems[0].status === "active", "row restored to active");

// ── Cambridge as a DISTINCT framework (Part 4.5) ───────────────────────
const camThresholds = [
  { min_percent: 80, grade: "A*" },
  { min_percent: 70, grade: "A" },
  { min_percent: 60, grade: "B" },
  { min_percent: 0, grade: "E" },
];
ok(gradeCambridge(85, { cambridge_thresholds: camThresholds }).grade === "A*", "cambridge own thresholds → A*");
ok(gradeCambridge(72, { cambridge_thresholds: camThresholds }).grade === "A", "cambridge own thresholds → A (inclusive)");
ok(gradeCambridge(5, { cambridge_thresholds: camThresholds }).grade === "E", "cambridge own thresholds → lowest grade");
const belowAll = gradeCambridge(30, { cambridge_thresholds: camThresholds.filter((t) => t.min_percent > 0) });
ok(belowAll.grade === null && belowAll.note === "no_matching_threshold", "below every threshold reported honestly, never guessed");
const camFallback = gradeCambridge(72, { boundaries: [{ min_percent: 70, label: "B" }, { min_percent: 0, label: "C" }] });
ok(camFallback.grade === "B", "legacy cambridge configs using boundaries keep working");
const camNone = gradeCambridge(72, {});
ok(camNone.grade === null && camNone.note === "thresholds_not_configured", "no thresholds → thresholds_not_configured, no fabricated grade");
ok(gradeCambridge(null, {}).note === "no_marks", "no marks → no_marks");

const camComponents = [
  { name: "Paper 1", weight_percent: 60 },
  { name: "Paper 2", weight_percent: 40 },
];
const weightedCam = cambridgeSectionsPercent(
  [
    { name: "Paper 1", raw: 40, max: 50 },
    { name: "Paper 2", raw: 14, max: 20 },
  ],
  { cambridge_components: camComponents },
);
ok(weightedCam === 76, `component weighting 80%×60 + 70%×40 = 76 (got ${weightedCam})`);
const partialCam = cambridgeSectionsPercent([{ name: "Paper 1", raw: 45, max: 50 }], { cambridge_components: camComponents });
ok(partialCam === 90, "unscored component renormalised away, never counted as zero");

const camApplied = applyGrading(
  { id: "g7", organization_id: "o", name: "IGCSE", curriculum: "cambridge", config: { cambridge_thresholds: camThresholds, cambridge_components: camComponents } },
  { sections: [{ name: "Paper 1", raw: 40, max: 50 }, { name: "Paper 2", raw: 14, max: 20 }] },
);
ok(camApplied.curriculum === "cambridge" && camApplied.percent === 76 && camApplied.label === "A", `applyGrading cambridge path: weighted percent 76 → grade A (got ${camApplied.percent}/${camApplied.label})`);
ok(camApplied.score === null, "cambridge never invents a 1–5 style score");

// Executed: creating a Cambridge system persists its qualification structure.
const camSave = await runSave({
  name: "Cambridge IGCSE",
  curriculum: "cambridge",
  assessment_kind: "exam",
  pass_percent: "50",
  cambridge_qualification: "Cambridge IGCSE",
  cambridge_level: "Grade 10",
  cambridge_component_code: ["P1", "P2"],
  cambridge_component_name: ["Paper 1", "Paper 2"],
  cambridge_component_weight: ["60", "40"],
  cambridge_min: ["80", "0"],
  cambridge_grade: ["A*", "E"],
});
assert.equal(camSave.url, "/dashboard/grading?ok=saved", "cambridge grading system saves");
extra += 1;
const camRow = db.tables.grading_systems.find((r) => r.name === "Cambridge IGCSE");
ok(Boolean(camRow), "cambridge row persisted");
ok(camRow.config.cambridge_qualification === "Cambridge IGCSE" && camRow.config.cambridge_level === "Grade 10", "qualification & level persisted");
ok(camRow.config.cambridge_components?.length === 2 && camRow.config.cambridge_components[0].weight_percent === 60, "components with weighting persisted");
ok(camRow.config.cambridge_thresholds?.length === 2 && camRow.config.cambridge_thresholds[0].grade === "A*", "institution thresholds persisted (sorted desc)");
ok(validateCamLike(camRow.config), "stored cambridge config re-reads cleanly");

function validateCamLike(cfg) {
  return Array.isArray(cfg.cambridge_thresholds) && cfg.cambridge_thresholds.every((t) => typeof t.min_percent === "number" && t.grade);
}

console.log(`grading-systems: ${52 + extra} checks passed`);

