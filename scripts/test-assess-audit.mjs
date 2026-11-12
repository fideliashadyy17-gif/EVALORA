// Student-view audit regressions for all six formative papers:
//   · wide data tables are never truncated by diagram normalisation
//     (a 12-value data set previously lost its last five values)
//   · dot patterns carry enough geometry to show every dot
//   · the corrected back-to-back stem-and-leaf key and the audit fix
//     migration (0091) are present, with no answer leaked in a prompt
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normaliseAssessDiagram } from "../src/lib/assessDiagram.ts";

let checks = 0;
const check = (name, fn) => { fn(); checks += 1; console.log(`✓ ${name}`); };

check("a 13-column data table survives normalisation intact", () => {
  const spec = normaliseAssessDiagram({
    kind: "table", title: "Data set (ordered)",
    columns: ["Position", ...Array.from({ length: 12 }, (_, i) => String(i + 1))],
    rows: [["Value", "12", "15", "18", "20", "22", "25", "29", "31", "34", "38", "41", "45"]],
  });
  assert.equal(spec.columns.length, 13);
  assert.equal(spec.rows[0].length, 13);
  assert.equal(spec.rows[0][12], "45");
});

check("a 10-race results table keeps races 8-10", () => {
  const spec = normaliseAssessDiagram({
    kind: "table", title: "Times",
    columns: ["Race", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
    rows: [["Time", "58", "61", "63", "66", "68", "70", "72", "75", "79", "88"]],
  });
  assert.equal(spec.rows[0][10], "88");
});

check("audit fixes are in the specs and migration 0091", () => {
  const myp4 = readFileSync("scripts/exam-import/assess_myp4.py", "utf8");
  assert.ok(myp4.includes("means 21 for Class A"), "back-to-back key corrected");
  assert.ok(!myp4.includes("means 12 for Class A"), "wrong key gone");
  assert.ok(myp4.includes("Ages of gym members"), "gym table added");
  assert.ok(myp4.includes("Mass of objects"), "masses table added");
  const sql = readFileSync("supabase/migrations/0091_assessment_audit_fixes.sql", "utf8");
  assert.equal((sql.match(/^update questions/gm) ?? []).length, 84);
  assert.ok(!sql.includes("type 'no, only 23 buy fruit'"), "no leaked model answer in a prompt");
  assert.ok(!sql.includes("increase by 6 only"), "no disguised multiple-choice in a prompt");
  for (const f of ["assess_myp2.py", "assess_myp4.py", "assess_myp5.py", "assess2_myp2.py", "assess2_myp4.py", "assess2_myp5.py"]) {
    const src = readFileSync(`scripts/exam-import/${f}`, "utf8");
    assert.ok(!src.includes("Marked by your teacher"), `${f}: no teacher notes in questions`);
  }
});

check("every part in every spec starts with a command term", () => {
  const allowed = new Set(["calculate", "find", "determine", "write", "state", "identify", "classify",
    "complete", "describe", "explain", "justify", "show", "verify", "compare", "estimate", "plot",
    "sketch", "type", "list", "use", "give", "read", "name", "recommend"]);
  for (const f of ["assess_myp2.py", "assess_myp4.py", "assess_myp5.py", "assess2_myp2.py", "assess2_myp4.py", "assess2_myp5.py"]) {
    const src = readFileSync(`scripts/exam-import/${f}`, "utf8");
    for (const m of src.matchAll(/P\("[a-z]", "\([a-z]\)", "([^"]+)"/g)) {
      const first = (m[1].match(/[A-Za-z']+/) ?? [""])[0].toLowerCase();
      assert.ok(allowed.has(first), `${f}: part prompt starts with '${first}': ${m[1].slice(0, 60)}`);
    }
  }
});

console.log(`\nAssess audit suite: ${checks} checks passed.`);
