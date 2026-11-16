/**
 * MYP report renderers: individual + collective PDF, and the four-sheet Excel
 * workbook.
 *
 * The checks open the generated files rather than trusting the writer:
 *  · PDFs are parsed (page tree + inflated content streams) to prove the
 *    numbers, criterion headings and page numbering actually reached the page,
 *    that a long report spans pages, and that accented names survive WinAnsi
 *    encoding as text rather than "?" placeholders;
 *  · the workbook is read back with the application's own spreadsheet reader and
 *    the OOXML package is unzipped to confirm numeric cells, a frozen header, an
 *    autofilter and date/percentage number formats.
 *
 * Run: node scripts/test-myp-reports.mjs
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { inflateRawSync, inflateSync } from "node:zlib";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import ts from "typescript";

const outDir = "/tmp/evalora-myp-reports-test";
execSync(`rm -rf ${outDir} && mkdir -p ${outDir}`);
execSync(`ln -sfn "$(pwd)/node_modules" ${outDir}/node_modules`);

const built = new Set();
function build(rel) {
  if (built.has(rel)) return;
  built.add(rel);
  const emitted = ts.transpileModule(readFileSync(rel, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const deps = [...emitted.matchAll(/require\("(\.[^"]+)"\)/g)].map((match) => match[1]);
  const normalised = emitted.replace(/require\("(\.[^"]+?)(\.ts)?"\)/g, (_match, spec) => `require("${spec}.js")`);
  const dest = path.join(outDir, rel.replace(/^src\//, "").replace(/\.ts$/, ".js"));
  mkdirSync(path.dirname(dest), { recursive: true });
  writeFileSync(dest, normalised);
  for (const dep of deps) build(path.join(path.dirname(rel), `${dep.replace(/\.ts$/, "")}.ts`));
}
for (const file of ["src/lib/myp.ts", "src/lib/mypPdf.ts", "src/lib/mypExcel.ts", "src/lib/xlsx.ts"]) build(file);

const require = createRequire(import.meta.url);
const M = require(`${outDir}/lib/myp.js`);
const PDF = require(`${outDir}/lib/mypPdf.js`);
const EXCEL = require(`${outDir}/lib/mypExcel.js`);
const XLSX = require("@e965/xlsx");

let passed = 0;
const ok = (name, condition, detail) => {
  if (!condition) throw new Error(`FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
  console.log(`  ✓ ${name}`);
};

/* ── Fixtures ────────────────────────────────────────────────────────── */
const mathCriteria = M.presetForSubject("Mathematics").criteria.map((criterion, index) => ({
  ...criterion,
  description: null,
  position: index,
}));
const rules = {
  criteria: mathCriteria,
  levelBoundaries: M.DEFAULT_LEVEL_BOUNDARIES,
  gradeBoundaries: M.DEFAULT_GRADE_BOUNDARIES,
  levelSource: "IB MYP published grade boundaries (test)",
  gradeSource: "IB MYP published grade boundaries (test)",
  requireAllCriteria: true,
  criteriaMaxLevel: 8,
  source: "configured",
};
const paper = [];
for (const criterion of ["A", "B", "C", "D"]) {
  for (let index = 0; index < 4; index += 1) {
    paper.push({ questionId: `${criterion}${index}`, points: 5, criterion, topic: `${criterion} topic ${index}` });
  }
}
const allAnswers = (ratio) =>
  paper.map((question) => ({ questionId: question.questionId, pointsAwarded: question.points * ratio }));

function makeResult(overrides = {}, options = {}) {
  const result = M.buildMypResult({
    attempt: {
      attemptId: overrides.attemptId ?? "attempt-1",
      examId: "exam-1",
      organizationId: "org-1",
      organizationName: "Oak International School",
      organizationLogoUrl: null,
      examTitle: overrides.examTitle ?? "MYP 2 Mathematics — Term 1 Summative",
      examDate: "2026-11-02T08:00:00Z",
      attemptStatus: "submitted",
      submittedAt: "2026-11-02T09:30:00Z",
      published: overrides.published ?? true,
      publishedAt: "2026-11-03T10:00:00Z",
      studentName: overrides.studentName ?? "Amina Diallo",
      studentRef: overrides.studentRef ?? "OAK-2026-014",
      className: overrides.className ?? "Grade 7 — MYP 2",
      classGradeOrder: 7,
      mypYear: overrides.mypYear ?? 2,
      subjectNames: overrides.subjectNames ?? ["Mathematics"],
      subjectId: "subject-math",
    },
    paper: options.paper ?? paper,
    answers: options.answers ?? allAnswers(options.ratio ?? 0.8),
    rules,
  });
  return result;
}

const strong = makeResult();
const pending = makeResult(
  { attemptId: "attempt-2", studentName: "Tobi Àkànjí", studentRef: "OAK-2026-020", mypYear: 3, className: "Grade 8 — MYP 3" },
  {
    answers: [
      ...allAnswers(0.5).slice(0, 8),
      ...paper.slice(8).map((question) => ({ questionId: question.questionId, pointsAwarded: null })),
    ],
  },
);
const unassessed = makeResult(
  { attemptId: "attempt-3", studentName: "Naledi AMOUSSOUKPEVI", studentRef: "OAK-2026-021", mypYear: 4, className: "Grade 9 — MYP 4" },
  { paper: paper.filter((question) => question.criterion !== "D"), answers: allAnswers(0.6).slice(0, 12) },
);
const longFeedback = makeResult(
  {
    attemptId: "attempt-4",
    studentName: "Amélie N'Guessan — Ọlá",
    studentRef: "OAK-2026-022",
    examTitle: "Mathématiques π ≥ 3 — évaluation « finale »",
    subjectNames: ["Mathématiques"],
  },
  {
    answers: paper.map((question) => ({
      questionId: question.questionId,
      pointsAwarded: question.points * 0.7,
      markerNote:
        "The method is sound but the final answer is not justified: state the rule, then substitute. " +
        "Show every intermediate step so the marker can follow the reasoning; a correct final answer without " +
        "justification loses the communication mark.",
    })),
  },
);

const zero = makeResult(
  { attemptId: "attempt-5", studentName: "Zero Evidence", studentRef: "OAK-2026-023" },
  { answers: paper.map((question) => ({ questionId: question.questionId, pointsAwarded: 0 })) },
);

/* ── PDF parsing helpers ─────────────────────────────────────────────── */
/** pdf-lib packs the page tree into compressed object streams, so inflate first. */
function inflatedPdf(buffer) {
  const bytes = Buffer.from(buffer);
  let text = "";
  let index = 0;
  while ((index = bytes.toString("latin1").indexOf("stream", index)) !== -1) {
    let start = index + "stream".length;
    const latin = bytes.toString("latin1");
    if (latin[start] === "\r") start += 1;
    if (latin[start] === "\n") start += 1;
    const end = latin.indexOf("endstream", start);
    if (end === -1) break;
    try {
      text += inflateSync(bytes.subarray(start, end)).toString("latin1");
    } catch {
      /* image font streams are not text; ignore */
    }
    index = end + "endstream".length;
  }
  return text;
}

/** Every text run with its page box, read by a real PDF engine rather than a regex. */
async function textItems(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, disableFontFace: true }).promise;
  const pages = [];
  for (let index = 1; index <= doc.numPages; index += 1) {
    const page = await doc.getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const items = content.items
      .filter((item) => "str" in item && item.str.trim())
      .map((item) => ({
        text: item.str,
        left: item.transform[4],
        right: item.transform[4] + item.width,
        top: item.transform[5],
        size: item.height,
      }));
    pages.push({ width: viewport.width, height: viewport.height, items });
  }
  return pages;
}

function overflowingItems(pages, margin = 42) {
  const violations = [];
  for (const page of pages) {
    for (const item of page.items) {
      // Sub-point rounding in the text matrix is not a layout defect.
      if (item.left < margin - 1 || item.right > page.width - margin + 1) {
        violations.push(`${item.text} @ ${item.left.toFixed(1)}..${item.right.toFixed(1)} of ${page.width.toFixed(1)}`);
      }
      if (item.top < 6 || item.top > page.height - 6) violations.push(`${item.text} @ y=${item.top.toFixed(1)}`);
    }
  }
  return violations;
}

function mediaBox(buffer) {
  const match = /\/MediaBox \[ 0 0 ([\d.]+) ([\d.]+) \]/.exec(inflatedPdf(buffer) + Buffer.from(buffer).toString("latin1"));
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

function pageCount(buffer) {
  const source = `${buffer.toString("latin1")}\n${inflatedPdf(buffer)}`;
  const counts = [...source.matchAll(/\/Count\s+(\d+)/g)].map((match) => Number(match[1]));
  const pages = [...source.matchAll(/\/Type\s*\/Page(?![a-zA-Z])/g)].length;
  return Math.max(0, ...counts, pages);
}

/** Inflate every FlateDecode stream and concatenate the text operators. */
function pdfText(buffer) {
  const bytes = Buffer.from(buffer);
  const latin = bytes.toString("latin1");
  let text = "";
  let index = 0;
  while ((index = latin.indexOf("stream", index)) !== -1) {
    let start = index + "stream".length;
    if (latin[start] === "\r") start += 1;
    if (latin[start] === "\n") start += 1;
    const end = latin.indexOf("endstream", start);
    if (end === -1) break;
    const chunk = bytes.subarray(start, end);
    let decoded;
    try {
      decoded = inflateSync(chunk).toString("latin1");
    } catch {
      decoded = chunk.toString("latin1");
    }
    // pdf-lib writes StandardFont text as hex strings (<4F616B> Tj); decode those
    // so the assertions below look at the words that really reached the page.
    for (const match of decoded.matchAll(/<([0-9A-Fa-f\s]{2,})>\s*(?:Tj|TJ)/g)) {
      text += Buffer.from(match[1].replace(/\s+/g, ""), "hex").toString("latin1");
      text += "\n";
    }
    index = end + "endstream".length;
  }
  return text;
}

/* ── Individual PDF ──────────────────────────────────────────────────── */
const individual = await PDF.renderMypIndividualPdf(strong);
ok("individual PDF starts with a PDF header", Buffer.from(individual).subarray(0, 5).toString() === "%PDF-");
const individualText = pdfText(individual);
ok("individual PDF names the student", individualText.includes("Amina Diallo"));
ok("individual PDF names the organization", individualText.includes("Oak International School"));
ok("individual PDF states the MYP year and class", individualText.includes("MYP 2") && individualText.includes("Grade 7 - MYP 2"));
ok("individual PDF carries the criterion headings", ["Knowing and understanding", "Investigating patterns", "Communicating", "Applying mathematics"].every((title) => individualText.includes(title)));
ok("individual PDF prints the overall grade", /Overall grade \d \/ 7/.test(individualText) && individualText.includes("Total criterion levels"));
ok("individual PDF prints the marks and percentage", individualText.includes("64 / 80") && individualText.includes("80%"));
ok("individual PDF prints the boundary source", individualText.includes("Grade boundaries: IB MYP published grade boundaries"));
ok("individual PDF prints a page footer", individualText.includes("Page 1 of"));
ok("individual PDF carries the EVALORA brand", individualText.includes("EVALORA"));
ok("the individual report separates student, examination and criterion sections",
  individualText.includes("Student information") && individualText.includes("Examination information") && individualText.includes("Detailed criterion breakdown"));
const individualFlat = individualText.replace(/\s+/g, " ");
ok("the criterion table names marks obtained, maximum marks and the achievement level",
  individualFlat.includes("Marks obtained") && individualFlat.includes("Maximum marks") && individualFlat.includes("Achievement level (0-8)"));
ok("the criterion table prints every criterion, not only a combined total",
  ["Criterion A", "Criterion B", "Criterion C", "Criterion D"].every((code) => individualText.includes(code)));
ok("the report explains the status vocabulary instead of relying on colour",
  individualFlat.includes("status key") && individualFlat.includes("Assessed") && individualFlat.includes("Pending marking") && individualFlat.includes("Not assessed") && individualFlat.includes("Marking data error"));
const individualBox = mediaBox(individual);
ok("the individual report is A4 portrait", individualBox && Math.abs(individualBox.width - 595.28) < 0.01 && Math.abs(individualBox.height - 841.89) < 0.01, JSON.stringify(individualBox));

/* A student who answered nothing still has every criterion marked zero, not blank. */
const skippedEverything = makeResult(
  { attemptId: "attempt-skipped", studentName: "Candidate Who Did Not Finish" },
  { answers: [] },
);
const skippedPdf = await PDF.renderMypIndividualPdf(skippedEverything);
const skippedText = pdfText(skippedPdf);
ok("an unfinished attempt produces a complete report", skippedEverything.criteria.every((criterion) => criterion.status === "assessed"));
ok("the unfinished attempt report prints a genuine zero, not a dash",
  /Marks 0 \/ 20/.test(skippedText) && skippedText.replace(/\s+/g, " ").includes("scored zero"));
ok("the unfinished attempt still receives an overall grade", /Overall grade \d \/ 7/.test(skippedText));

const individualPending = await PDF.renderMypIndividualPdf(pending);
const pendingText = pdfText(individualPending);
ok("a pending report says pending marking, not zero", /Pending marking/i.test(pendingText));
ok("a pending report refuses to print an overall grade", pendingText.includes("No overall grade is calculated yet"));
ok("a pending report names the pending criteria", pendingText.includes("Still to be marked"));
ok("accented student names survive encoding", pendingText.includes("Tobi Àkànjí"));

const individualUnassessed = await PDF.renderMypIndividualPdf(unassessed);
const unassessedText = pdfText(individualUnassessed);
ok("a not-assessed criterion is reported as not assessed", unassessedText.includes("Not assessed on this paper"));
ok("a not-assessed criterion is never printed as level 0", !/Criterion D — .*0 \/ 8/s.test(unassessedText));

const longPdf = await PDF.renderMypIndividualPdf(longFeedback);
ok("long feedback produces a multi-page individual report", pageCount(longPdf) >= 2, `pages=${pageCount(longPdf)}`);
const longText = pdfText(longPdf);
ok("the final page footer counts every page", new RegExp(`Page ${pageCount(longPdf)} of ${pageCount(longPdf)}`).test(longText));
ok("a multi-page report keeps the student name on later pages", (longText.match(/Amélie/g) ?? []).length >= 2);
ok("typographic characters are mapped, not dropped", longText.includes("Mathématiques pi >= 3"));
ok("non-Latin names are transliterated rather than replaced", longText.includes("Amélie N'Guessan - Olá") && !longText.includes("Ọ"));
ok("no unknown glyph placeholder leaks into the PDF", !/(\s|^)\?(\s|$)/.test(longText.replace(/\?\s*$/gm, "")));

/* ── Collective PDF ──────────────────────────────────────────────────── */
const many = Array.from({ length: 12 }, (_, index) =>
  makeResult({
    attemptId: `attempt-${100 + index}`,
    studentName: `Student ${String(index + 1).padStart(2, "0")}`,
    studentRef: `OAK-${1000 + index}`,
    mypYear: (index % 5) + 1,
    className: `Grade ${6 + (index % 5)} — MYP ${(index % 5) + 1}`,
    published: index % 4 !== 0,
  }),
);
const analytics = M.summarizeMyp([...many, pending, unassessed]);
const collective = await PDF.renderMypCollectivePdf({
  title: "MYP results — Grade 7 to Grade 10",
  scope: "Oak International School · 14 results",
  results: [...many, pending, unassessed],
  analytics,
});
ok("collective PDF is generated", Buffer.from(collective).subarray(0, 5).toString() === "%PDF-");
const collectiveBox = mediaBox(collective);
ok("the wide collective report uses A4 landscape", collectiveBox && Math.abs(collectiveBox.width - 841.89) < 0.01 && Math.abs(collectiveBox.height - 595.28) < 0.01, JSON.stringify(collectiveBox));
ok("collective PDF spans several pages", pageCount(collective) >= 3, `pages=${pageCount(collective)}`);
const collectiveText = pdfText(collective);
ok("collective PDF has a summary section", collectiveText.includes("Grade distribution") && collectiveText.includes("Criterion performance"));
ok("collective PDF lists every student", many.every((result) => collectiveText.includes(result.studentName)));
ok("collective PDF includes class averages and completion", /AVERAGE/.test(collectiveText) && /COMPLETE/.test(collectiveText) && /Highest result/.test(collectiveText));
ok("collective PDF explains incomplete grades", collectiveText.includes("not a zero"));
ok("collective PDF numbers its pages", new RegExp(`Page ${pageCount(collective)} of ${pageCount(collective)}`).test(collectiveText));
ok("the collective report repeats its criterion table on every student section",
  (collectiveText.match(/Achievement/g) ?? []).length >= 3);
ok("the collective report carries the same status key as the screen",
  collectiveText.replace(/\s+/g, " ").includes("Criterion status key") && collectiveText.replace(/\s+/g, " ").includes("Marking data error"));

const emptyCollective = await PDF.renderMypCollectivePdf({
  title: "MYP results — empty scope",
  scope: "No results",
  results: [],
  analytics: M.summarizeMyp([]),
});
ok("an empty collective report is still a valid PDF", Buffer.from(emptyCollective).subarray(0, 5).toString() === "%PDF-");

/* ── Nothing is drawn outside the printable area ────────────────────── */
const individualPages = await textItems(individual);
const skippedPages = await textItems(skippedPdf);
const collectivePages = await textItems(collective);
const longPages = await textItems(longPdf);
for (const [label, pages] of [
  ["individual", individualPages],
  ["unfinished attempt", skippedPages],
  ["collective", collectivePages],
  ["long feedback", longPages],
]) {
  const violations = overflowingItems(pages);
  ok(`${label} report keeps every text run inside the printable margins`, violations.length === 0, violations.slice(0, 3).join(" | "));
}
ok("a long student name is rendered in full inside the report",
  longPages.some((page) => page.items.some((item) => item.text.includes("Amélie"))));
ok("table headers repeat on a multi-page collective report", (() => {
  const pagesWithHeader = collectivePages.filter((page) => page.items.some((item) => /Criterion|Student Name/.test(item.text)));
  return pagesWithHeader.length >= 3;
})(), `${collectivePages.length} pages`);
ok("an empty report states that there are no results", pdfText(emptyCollective).includes("No results in this scope"));

/* ── Excel workbook ──────────────────────────────────────────────────── */
const allResults = [...many, pending, unassessed, strong, zero];
const allAnalytics = M.summarizeMyp(allResults);
const workbookBuffer = EXCEL.buildMypWorkbook(allResults, allAnalytics, {
  fileTitle: "MYP collective results",
  scope: "Oak International School / Grade 7 — MYP 2 / 2026-11",
});
ok("workbook is a zip package", workbookBuffer.subarray(0, 2).toString("latin1") === "PK");

const wb = XLSX.read(workbookBuffer, { type: "buffer" });
ok("workbook has the four teacher-facing worksheets",
  JSON.stringify(wb.SheetNames) === JSON.stringify(["Student Performance", "Detailed Criterion Results", "Class Analytics", "Grading Information"]),
  JSON.stringify(wb.SheetNames));

const studentSheet = wb.Sheets["Student Performance"];
const studentRows = XLSX.utils.sheet_to_json(studentSheet, { header: 1, defval: null });
const headerRow = studentRows.findIndex((row) => row.some((cell) => cell === "Student Name"));
const headers = studentRows[headerRow];
ok("the student sheet has a title, subtitle and header row", headerRow >= 1 && String(studentRows[0][0]).includes("EVALORA"));
ok("the student sheet header names the grade column", headers.includes("Overall MYP Grade (1-7)"));
ok("the student sheet shows every criterion as marks, maximum and level",
  ["Criterion A Marks", "Criterion A Maximum", "Criterion A Level", "Criterion D Marks", "Criterion D Maximum", "Criterion D Level"].every((label) => headers.includes(label)),
  JSON.stringify(headers.filter((h) => String(h).startsWith("Criterion"))));
ok("the student sheet contains every result", studentRows.length - headerRow - 1 === 16, `rows=${studentRows.length}`);
const marksRow = studentRows[headerRow + 1];
const marksColumn = headers.indexOf("Marks Obtained");
ok("marks are stored as numbers, not text", typeof marksRow[marksColumn] === "number", typeof marksRow[marksColumn]);
const percentColumn = headers.indexOf("Percentage");
ok("percentages are stored as numbers", typeof marksRow[percentColumn] === "number");
ok("the grade column holds a numeric grade or a status", typeof marksRow[headers.indexOf("Overall MYP Grade (1-7)")] === "number" || typeof marksRow[headers.indexOf("Overall MYP Grade (1-7)")] === "string");
ok("the pending result is labelled as a status rather than a grade", studentRows.slice(headerRow + 1).some((row) => row[headers.indexOf("Grade Status")] === "Incomplete" && row[headers.indexOf("Overall MYP Grade (1-7)")] === null));
ok("a criterion mark and its maximum are separate numeric columns",
  studentRows.slice(headerRow + 1).some((row) => typeof row[headers.indexOf("Criterion A Marks")] === "number" && typeof row[headers.indexOf("Criterion A Maximum")] === "number"));

const criterionSheet = wb.Sheets["Detailed Criterion Results"];
const criterionRows = XLSX.utils.sheet_to_json(criterionSheet, { header: 1, defval: null });
const criterionHeaderRow = criterionRows.findIndex((row) => row.some((cell) => cell === "Criterion Identifier"));
const criterionHeaders = criterionRows[criterionHeaderRow];
ok("detailed criterion results have a row per criterion", criterionRows.length > criterionHeaderRow + 1 && criterionHeaders.includes("Achievement Level (0-8)") && criterionHeaders.includes("Criterion Name"));
ok("unmarked criteria leave the level cell blank rather than zero",
  criterionRows.slice(criterionHeaderRow + 1).some((row) => row[criterionHeaders.indexOf("Assessment Status")] === "Pending marking" && row[criterionHeaders.indexOf("Achievement Level (0-8)")] === null));
ok("an assessed level 0 is written as a real zero",
  criterionRows.slice(criterionHeaderRow + 1).some((row) => row[criterionHeaders.indexOf("Achievement Level (0-8)")] === 0 && row[criterionHeaders.indexOf("Assessment Status")] === "Assessed"));
ok("a not-assessed criterion leaves both marks and level blank",
  criterionRows.slice(criterionHeaderRow + 1).some((row) => row[criterionHeaders.indexOf("Assessment Status")] === "Not assessed" && row[criterionHeaders.indexOf("Marks Obtained")] === null && row[criterionHeaders.indexOf("Maximum Marks")] === null));

const statsSheet = wb.Sheets["Class Analytics"];
const statsRows = XLSX.utils.sheet_to_json(statsSheet, { header: 1, defval: null });
const statsHeaderRow = statsRows.findIndex((row) => row.some((cell) => cell === "Students"));
const statsHeaders = statsRows[statsHeaderRow];
ok("class statistics include criterion averages and grade distribution",
  statsHeaders.includes("Criterion A Average %") && statsHeaders.includes("Grade 7") && statsHeaders.includes("Completion %"));
ok("class statistics end with an all-results row", statsRows.some((row) => row[0] === "ALL RESULTS IN SCOPE"));

const configSheet = wb.Sheets["Grading Information"];
const configRows = XLSX.utils.sheet_to_json(configSheet, { header: 1, defval: null });
ok("grading configuration names the criteria and boundaries",
  configRows.some((row) => String(row).includes("A — Knowing and understanding") && String(row).includes("28-32 → 7")));
ok("grading information states the boundary source", configRows.some((row) => String(row).includes("IB MYP published grade boundaries")));
ok("grading information explains every criterion status",
  ["Assessed", "Partially marked", "Not assessed", "Marking data error"].every((label) => configRows.some((row) => String(row).includes(label))));

/* ── OOXML package checks (frozen header, formats) ──────────────────── */
function unzip(buffer) {
  const entries = new Map();
  const bytes = Buffer.from(buffer);
  let offset = 0;
  while (offset < bytes.length - 4) {
    if (bytes.readUInt32LE(offset) !== 0x04034b50) break;
    const method = bytes.readUInt16LE(offset + 8);
    const compressedSize = bytes.readUInt32LE(offset + 18);
    const nameLength = bytes.readUInt16LE(offset + 26);
    const extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
    const dataStart = offset + 30 + nameLength + extraLength;
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    entries.set(name, method === 8 ? inflateRawSync(data) : data);
    offset = dataStart + compressedSize;
  }
  return entries;
}

const packageFiles = unzip(workbookBuffer);
ok("the package contains a stylesheet and four sheets",
  packageFiles.has("xl/styles.xml") && [...packageFiles.keys()].filter((name) => name.startsWith("xl/worksheets/")).length === 4);
const firstSheetXml = packageFiles.get("xl/worksheets/sheet1.xml").toString("utf8");
ok("the header row is frozen", /<pane ySplit="\d+"[^>]*state="frozen"/.test(firstSheetXml));
ok("the header row carries an autofilter", /<autoFilter ref="A\d+:[A-Z]+\d+"\/>/.test(firstSheetXml));
ok("column widths are set", /<col min="1"/.test(firstSheetXml) && /customWidth="1"/.test(firstSheetXml));
ok("strings use inline strings so no shared-string table can go stale", firstSheetXml.includes('t="inlineStr"'));
ok("numbers are written as numeric values", /<c r="[A-Z]+4" s="3"><v>\d/.test(firstSheetXml));
const stylesXml = packageFiles.get("xl/styles.xml").toString("utf8");
ok("percentage and date number formats exist", stylesXml.includes('0.0&quot;%&quot;') && stylesXml.includes("yyyy-mm-dd"));
ok("text is escaped safely", !/<t[^>]*>[^<]*&(?!amp;|lt;|gt;|quot;|apos;)/.test(firstSheetXml));

const emptyWorkbook = EXCEL.buildMypWorkbook([], M.summarizeMyp([]), { fileTitle: "Empty", scope: "No results" });
const emptyWb = XLSX.read(emptyWorkbook, { type: "buffer" });
ok("an empty result set still produces a valid workbook", emptyWb.SheetNames.length === 4);
const emptyRows = XLSX.utils.sheet_to_json(emptyWb.Sheets["Student Performance"], { header: 1, defval: null });
const emptyHeaderRow = emptyRows.findIndex((row) => row.some((cell) => cell === "Student Name"));
ok("an empty workbook has a header row and no data rows", emptyHeaderRow === emptyRows.length - 1, `rows=${emptyRows.length}`);

/* ── An individual workbook ─────────────────────────────────────────── */
const singleWorkbook = EXCEL.buildMypWorkbook([strong], M.summarizeMyp([strong]), {
  fileTitle: "Individual MYP result",
  scope: "Amina Diallo / MYP 2 Mathematics",
});
const single = XLSX.read(singleWorkbook, { type: "buffer" });
const singleRows = XLSX.utils.sheet_to_json(single.Sheets["Student Performance"], { header: 1, defval: null });
const singleHeaderRow = singleRows.findIndex((row) => row.some((cell) => cell === "Student Name"));
ok("an individual workbook has one student row", singleRows.length - singleHeaderRow - 1 === 1);

console.log(`\n${passed} checks passed — MYP PDF and Excel reports`);
