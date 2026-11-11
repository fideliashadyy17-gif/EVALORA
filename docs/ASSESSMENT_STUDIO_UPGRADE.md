# Assessment Studio upgrade — implementation notes

This document records what the Assessment Studio upgrade reuses, what it adds,
how existing assessments are protected, and how the work was verified. It is
deliberately concrete: it names the files and the checks, and it separates what
was verified from what could not be verified in this environment.

## 1. Reused foundations (no parallel editor)

| Capability | Existing implementation reused |
| --- | --- |
| Rich text | TipTap unified editor (`src/components/editor/RichContentEditor.tsx`) with headings, bold/italic/underline/strike, lists, blockquote, code, tables, images, links, alignment, super/subscript |
| Mathematics | MathLive `math-field` + the existing 18-category visual keyboard (`src/components/editor/MathField.tsx`, `mathKeyboard.ts`), KaTeX rendering (`src/lib/content.ts`, `MathText.tsx`) |
| Image upload | Existing storage upload path passed into the editor (`uploadImage`) |
| Question types | Existing types, including `open_ended` for manually marked constructed responses |
| Exam delivery | Existing attempt state, durable save queue, server deadline, integrity/logging, marking queue and rubric workflows |

No second mathematics editor, question system, exam system or marking system was
created. The mathematics keyboard was extended (not replaced) with
**Sequences & Series** and **Science & Units** categories.

## 2. New structured capabilities

### 2.1 Safe expression parser — `src/lib/mathExpr.ts`
- Parses teacher/student function input (`2x + 3`, `x^2 - 4x + 3`, `3(2)^x`,
  `sin(x)`, `sqrt(x + 1)`) into an evaluable function.
- No `eval`, no `Function` constructor. Rejects unknown functions, unbalanced
  brackets, incomplete expressions and malformed numbers with a readable error.
- Handles implicit multiplication, right-associative powers, unary minus,
  constants, and guards NaN/Infinity at evaluation time.

### 2.2 Graph specification — `src/lib/graphSpec.ts`
- `GraphSpec` v1 is the stored source of truth: domain, grid, axes, labels,
  legend, functions, points, segments, annotations, colours and line styles.
- Unknown or malformed input is normalised (bounded domain, capped elements,
  finite numbers only); an unknown future `version` falls back to v1.
- Sampling breaks paths at poles/discontinuities rather than drawing false
  vertical lines; intersections are found numerically (sign change + bisection).
- `GraphView` is server-render safe, so the same SVG is used in the editor
  preview, the candidate, the marker view and print.

### 2.3 Geometry specification — `src/lib/geometrySpec.ts`
- `GeometrySpec` v1 stores relational constructions: free points plus
  midpoints, perpendicular feet and intersections; segments, lines, rays,
  circles, polygons, angles and annotations. Measurements (length, radius,
  angle, area, perimeter) are recomputed, never stored as stale text.
- Fixed-point resolution with dependency ordering keeps a construction
  consistent while points are dragged.
- Circles are drawn as ellipses under non-square axis scales, so the picture
  matches the coordinates.

### 2.4 Response workspace — `src/lib/responseTools.ts`
- `config.response_tools` explicitly enables tools:
  `rich_text`, `math`, `table`, `data_table`, `science`, `graph`, `geometry`,
  `statistics`.
- Without explicit configuration, tools are inferred from the question wording
  (`graph`/`plot`/`sketch`/`curve`, construction vocabulary, science vocabulary).
  Objective types keep their native UI and never receive a graph workspace.
- `config.response_graph` / `config.response_geometry` set titles,
  instructions, function permission and starter axes.
- `config.response_guidance` and `config.response_requirement` provide
  candidate-facing guidance; the requirement is a warning, never a server-side
  change to marking.
- `validateAnswerPayload` is the server-side boundary used by
  `POST /api/exam/save`: unknown keys are stripped, documents must be real
  `doc` nodes, graph/geometry are normalised and capped, oversized payloads are
  rejected, and legacy objective payloads keep their historical shape.

### 2.5 Student environment — `StructuredResponseEditor`
- Tabs adapt to the question: written answer (rich text + mathematics + tables),
  graph workspace, geometry workspace.
- Autosave debounces at 1.4 s inside examinations and flushes synchronously on
  unmount, through the existing durable `ExamSaveQueue`.
- Save status is visible; a rejected save stays dirty; an answer whose tool was
  later disabled is preserved rather than deleted.
- Legacy plain-text open-ended answers are converted to documents on open, so
  resuming an older attempt never erases work.
- A locked (submitted/deadline) answer renders read-only; no editor is mounted.

### 2.6 Marker view — `AnswerResponseView`
- Renders rich text and mathematics with KaTeX, graphs and constructions as SVG
  from their specifications, and never stringifies a structured answer.
- Falls back to plain text for legacy answers and to a labelled code block for
  an unreadable payload, so a marker sees that something was saved.

### 2.7 Teacher authoring
- `QuestionForm` gains a per-question **Student composition environment**
  panel: Automatic (default) or explicit tool selection, graph title,
  instructions, axis ranges and function permission, geometry title, axis
  ranges, response requirement, guidance and (existing) marking criteria.
- The rich-text editor can embed re-editable graph and geometry blocks. A block
  stores the whole specification in `attrs.spec`; the dialog edits it and saves
  it back into the same document position.
- Question publication validation now rejects an explicitly configured
  workspace with no tools, or a required tool that is not enabled.

### 2.8 Statistics charts and structured data tables

- `src/lib/statsSpec.ts` adds a second, independent representation family:
  dot plot, bar chart, histogram, box plot and cumulative-frequency chart. The
  specification stores the observations (or categorical counts), the chosen
  representation, axis labels, an optional bin width and a summary switch — not
  an image.
- The computations are pure and shared by the editor, marker and any future
  export: Tukey quartiles (the median is excluded from each half when *n* is
  odd), the 1.5 × IQR outlier rule, population standard deviation, mode,
  automatic 1/2/2.5/5 × 10ⁿ bin widths, stacked dot frequencies and cumulative
  totals. There is no charting dependency and the renderer is an SVG built from
  those numbers, so it is server-component safe.
- `StatsEditor` is the candidate/teacher workspace: bulk data entry (commas,
  spaces or new lines), categorical rows for a bar chart, chart type (the
  teacher may fix it), bin width, axis labels and a live preview. It publishes
  the whole specification on every change, so the existing autosave queue
  persists data rather than pixels.
- Computed summary chips are **off by default**. A statistics workspace is a
  representation tool, not an answer machine: a teacher who wants mean/median
  visible can switch `showSummary` on, but a question asking for the median does
  not have it printed by the tool.
- `src/lib/dataTableSpec.ts` stores a bounded grid: 10 columns, 40 rows, 200
  characters per cell, optional row headers. `DataTableEditor` keeps each value
  in its row and column; a teacher-configured starter fixes the structure so a
  candidate fills blanks instead of redesigning the table. `DataTableView`
  renders real `<th scope="row">` headers for print and marking.
- The unified rich-content editor can embed both as re-editable blocks
  (`statsBlock`, `dataTableBlock`) beside graphs and geometry, and `RichContent`
  renders them on every candidate, marker and print surface.
- The response workspace gains two tools, `statistics` and `data_table`, with
  matching `response_requirement` values. Inference recognises statistics
  vocabulary (histogram, dot plot, box plot, quartiles, cumulative frequency,
  mean/median, standard deviation) and table-completion wording ("complete the
  table", "frequency table"); explicit `config.response_tools` always wins.
- `POST /api/exam/save` validates both shapes: non-object payloads are rejected,
  oversized value/category/row/column/cell payloads are rejected, and stored
  values are normalised and capped. Legacy answers are untouched.

## 3. Compatibility and safety

- No existing question wording, options, answer key, marks, duration or grading
  rule was changed. No existing assessment was edited.
- Existing attempts keep their stored JSONB answers. Structured answers add
  `version`, `doc`, `graph` and `geometry`; objective answers are untouched.
- The database migration `0082_myp5_sequences_formative.sql` is additive and
  idempotent (fixed UUIDs, `ON CONFLICT DO NOTHING`). It creates content only;
  it changes no schema, policy, constraint or existing row.
- New editors use pointer events, `<input>`, `<textarea>` and MathLive. They do
  not use clipboard APIs, do not auto-submit on focus loss, do not reset timers
  and do not interrupt an active attempt. The server deadline remains the
  authority.
- Mobile: tabs, palettes and panels scroll horizontally rather than widening the
  page; every interactive control has a ≥ 40 px touch target; graphs and
  constructions scale from the same viewBox on phone, tablet and desktop.

## 4. The MYP 5 assessment

| Property | Value |
| --- | --- |
| Module | Examinations (`exams` + published paper `quizzes`), not Competitions |
| Title | MYP 5 Mathematics — Sequences and Series Formative Assessment |
| Grade / programme / subject | Grade 10 · MYP 5 · Mathematics |
| Type | Formative (`settings.assessment_kind = "formative"`) |
| Questions / marks | 17 questions · 73 marks |
| Status | `draft` (no dates invented) |
| Duration | 60 minutes (existing default) |
| Start/end | `null` (no timetable or examination date was specified) |
| Attempt policy | `single_resume`, randomisation off, shared link |
| Question mix | 3 single-choice, 1 multiple-select, 3 numeric, 1 short answer, 9 constructed responses |
| New tools used | 9 constructed responses with the mathematics editor; table-completion question; two real interactive graph questions (quadratic sequence and arithmetic-vs-geometric growth); extended proof and contextual modelling |
| MYP criteria | A, C and D recorded per constructed-response question in `config.myp_criterion` |

Topics covered: recursive formula, explicit formula, linear sequence, quadratic
sequence (including second differences and graphing), arithmetic sequence,
geometric sequence, arithmetic series, geometric series (finite, infinite and
convergence), triangular numbers, error analysis and contextual modelling.

The paper deliberately mixes recall, routine fluency, representation, graphing,
proof/reasoning and a real-world model rather than eight shallow items.

## 5. Verification performed

Executed in this environment:

- `npx tsc --noEmit` — clean.
- `npm run lint` — 0 errors (pre-existing warnings remain).
- `npm run build` — production build succeeded with stub Supabase environment
  values (no live secrets used in the build).
- `npm test` — **98 suites passed, 0 failed, 7 skipped; 1204 checks**.
  Browser suites are skipped because Playwright browsers are not installed.
  Relevant suites: `test-assessment-studio.mjs` (139 checks),
  `test-structured-response.mjs` (11 checks) and the new
  `test-data-representations.mjs` (23 checks), which renders every chart type
  and the data table with React Test Renderer.
- Server-render smoke test of `GraphView`, `GeometryView` and
  `AnswerResponseView` through a temporary Next.js route: 4 SVGs, KaTeX
  mathematics and the expected component summary rendered without error. The
  temporary route was removed afterwards.
- Supabase production database: the 17 questions, 19 options, 17 paper rows and
  the examination row exist with the expected marks, tools and two graph
  configurations; total paper marks = 73.
- Statistics rendering: dot plot, bar chart, histogram, box plot and
  cumulative-frequency chart each render their expected SVG primitives from
  data, an empty workspace renders a prompt rather than crashing, and the data
  table renders headers, row headers and cells.

Not performed (and therefore not claimed):

- Real-browser interaction tests (clicking, dragging or typing in a browser)
  because no browser/Playwright browser binary is available in this
  environment. Component interaction was tested with React Test Renderer.
- An authenticated end-to-end candidate attempt against production, because
  that would create test student data in the live database.

## 6. Deployment

The change is committed to the working branch, then pushed and deployed. The
final production URL and deployment id are reported in the task completion
message; production verification is repeated after the deployment is ready.
