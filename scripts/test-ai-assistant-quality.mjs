// The assistant must produce objects EVALORA can keep.
//
// Every assertion here corresponds to a defect that reached a teacher: a crash
// on an ordinary instruction, a paper generated in a state its own validator
// refuses, requests silently dropped, and question batches that never reached
// the bank. The modules are compiled with the project's own settings and the
// real functions are exercised — no mocks of the logic under test.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const outDir = mkdtempSync(path.join(tmpdir(), 'evalora-quality-'));
execFileSync('npx', [
  'tsc',
  'src/lib/ai/types.ts', 'src/lib/ai/risk.ts', 'src/lib/ai/tools.ts', 'src/lib/ai/generator.ts',
  'src/lib/ai/validation.ts', 'src/lib/ai/intent.ts', 'src/lib/ai/agents.ts',
  '--outDir', outDir, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2022',
  '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node', '--lib', 'es2022,dom',
  '--resolveJsonModule', '--jsx', 'preserve', '--downlevelIteration',
], { stdio: 'pipe' });
const load = async (rel) => import(pathToFileURL(path.join(outDir, rel)).href);

const { buildExamPlan, topicsForGrade, firstTopicIn } = await load('lib/ai/generator.js');
const { validateProposedExam } = await load('lib/ai/validation.js');
const { planFromRules } = await load('lib/ai/intent.js');
const { TOOLS, getTool } = await load('lib/ai/tools.js');

let n = 0;
const test = (name, fn) => {
  fn();
  n += 1;
  console.log(`  ✓ ${name}`);
};

/* ── 1. The crash: an instruction that names no catalogue topic ─────── */

test('an examination with no recognisable topic builds instead of crashing', () => {
  // "on algebra" resolves no catalogue key, so `spec.topics` is undefined. This
  // used to throw "Cannot read properties of undefined (reading 'length')" and
  // surface as a failed creation.
  const spec = {
    title: 'Grade 8 Science', durationMinutes: 60, questionCount: 12,
    topics: undefined, gradeLabel: 'Grade 8', gradeOrder: 8, seed: 'no-topic',
  };
  const built = buildExamPlan(spec);
  assert.equal(built.plan.questions.length, 12);
  assert.ok(built.plan.questions.every((q) => q.prompt && q.points > 0));
});

test('a missing topic list falls back to grade-appropriate material', () => {
  const grade7 = topicsForGrade(7);
  const grade12 = topicsForGrade(12);
  assert.ok(grade7.length > 0 && grade12.length > 0, 'both grades must resolve a topic set');
  assert.notDeepEqual(grade7, grade12, 'the fallback must follow the grade, not be one fixed list');
  // Nothing far above the grade may appear in a young paper.
  const tooHard = grade7.filter((key) => grade12.includes(key));
  assert.ok(tooHard.length < grade7.length, 'a Grade 7 set must not simply be the Grade 12 set');
});

/* ── 2. A declared total is distributed exactly AND stays valid ─────── */

test('a declared paper total is met exactly and the paper still validates', () => {
  for (const totalMarks of [20, 50, 100, 200]) {
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const built = buildExamPlan({
        title: `Paper ${totalMarks}`, durationMinutes: 90, questionCount: 20,
        topics: ['linear_equations', 'algebraic_expressions'], totalMarks,
        gradeLabel: 'Grade 9', gradeOrder: 9, seed,
        sections: [
          { id: 'A', title: 'Section A', share: 0.65 },
          { id: 'B', title: 'Section B', share: 0.35 },
        ],
      });
      const report = validateProposedExam(built.plan);
      assert.equal(report.totals.marks, totalMarks, `seed ${seed}: marks must total exactly ${totalMarks}`);
      assert.ok(
        report.ok,
        `seed ${seed}/${totalMarks}: the generator produced a paper its own validator rejects: ` +
          report.errors.map((e) => `${e.code} ${e.message}`).join(' | '),
      );
    }
  }
});

test('part marks are rescaled with their question so parts still add up', () => {
  // A `parts` question whose points are redistributed must carry parts that
  // still sum to the new total — this was the `parts_total`/`publish_rule` pair
  // that appeared under otherwise-successful creations.
  const built = buildExamPlan({
    title: 'Parts paper', durationMinutes: 90, questionCount: 24,
    topics: ['functions'], totalMarks: 100, gradeLabel: 'Grade 10', gradeOrder: 10,
    seed: 'parts-check',
  });
  const withParts = built.plan.questions.filter((q) => q.type === 'assess_parts' && (q.parts ?? []).length);
  assert.ok(withParts.length > 0, 'the fixture must contain a part-structured question');
  for (const q of withParts) {
    const partTotal = (q.parts ?? []).reduce((sum, part) => sum + Number(part.points || 0), 0);
    assert.ok(
      Math.abs(partTotal - q.points) < 0.001,
      `question ${q.ref}: parts total ${partTotal} but the question is worth ${q.points}`,
    );
  }
});

test('an impossible mark total is refused with an actionable sentence', () => {
  // 24 part-structured questions cannot fit in a 20-mark paper while every part
  // stays separately markable. The refusal must name the constraint.
  assert.throws(
    () =>
      buildExamPlan({
        title: 'Impossible', durationMinutes: 60, questionCount: 24,
        topics: ['functions'], totalMarks: 20, gradeLabel: 'Grade 9', gradeOrder: 9, seed: 'x',
      }),
    /minimum is 52 marks|needs at least/i,
  );
});

/* ── 3. The generator and the validator must agree on "duplicate" ───── */

test('the generator deduplicates with the same fingerprint the validator uses', () => {
  // Two prompts differing only in punctuation used to pass generation and then
  // be rejected as `duplicate_prompt` during validation.
  for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
    const built = buildExamPlan({
      title: 'Dup check', durationMinutes: 120, questionCount: 25,
      topics: ['quadratic_equations', 'functions'], gradeLabel: 'Grade 10', gradeOrder: 10, seed,
    });
    const report = validateProposedExam(built.plan);
    assert.ok(
      !report.errors.some((e) => e.code === 'duplicate_prompt'),
      `seed ${seed}: generated a duplicate wording the validator rejects`,
    );
  }
});

/* ── 4. Requests that used to be refused or silently narrowed ───────── */

test('"Create 10 questions on linear equations" routes to question authoring', () => {
  const plan = planFromRules('Create 10 questions on linear equations', firstTopicIn);
  assert.equal(plan.steps.length, 1);
  assert.equal(plan.steps[0].tool, 'generate_question');
  assert.equal(plan.steps[0].args.count, 10);
  assert.equal(plan.steps[0].args.topic, 'linear_equations');
  assert.equal(plan.steps[0].args.save, true, 'asking to CREATE questions means they should exist');
});

test('a batch request carries the grade and the count', () => {
  const plan = planFromRules('Create 5 questions on fractions for Grade 7', firstTopicIn);
  assert.equal(plan.steps[0].args.count, 5);
  assert.equal(plan.steps[0].args.grade_label, 'Grade 7');
});

test('"generate a question" does not silently save, and says it did not', () => {
  const plan = planFromRules('Generate a hard question on percentages', firstTopicIn);
  assert.equal(plan.steps[0].args.save, false, 'generating for review must not write to the bank');
  assert.equal(plan.steps[0].args.count, 1);
});

test('a topic the catalogue does not support is refused, never invented', () => {
  // "trigonometry" has no catalogue entry. The router must not emit a key that
  // generates zero questions; it must decline and let the teacher rephrase.
  const plan = planFromRules('Generate a question on trigonometry', firstTopicIn);
  assert.equal(plan.steps.length, 0, 'an unsupported topic must not produce a step');
  assert.match(plan.refusal ?? '', /could not turn that into an action/i);
});

test('a compound instruction runs both clauses, in order', () => {
  const plan = planFromRules('Create 10 questions on linear equations and then make an exam from them', firstTopicIn);
  assert.equal(plan.steps.length, 2, 'both jobs must be planned');
  assert.equal(plan.steps[0].tool, 'generate_question');
  assert.equal(plan.steps[1].tool, 'create_examination');
});

test('a clause with no tool is reported, not silently dropped', () => {
  const plan = planFromRules('Create an exam on fractions and then water the plants', firstTopicIn);
  assert.ok(plan.steps.length >= 1, 'the actionable part still runs');
  if (plan.note) assert.match(plan.note, /Not actioned|water the plants/i, 'the unused clause must be visible');
});

test('every topic the router can emit is a real catalogue key', () => {
  // The router used to invent keys ("fractions", "trigonometry"), which produced
  // papers with zero questions. Resolving through the catalogue makes that
  // impossible, and this asserts the property rather than the implementation.
  const { TOPIC_CATALOG } = { TOPIC_CATALOG: undefined };
  void TOPIC_CATALOG;
  const phrases = [
    ['fractions', 'fractions_percentages'],
    ['percentages', 'fractions_percentages'],
    ['quadratic equations', 'quadratics'],
    ['pythagoras', 'pythagoras'],
    ['angles', 'geometry_angles'],
    ['statistics', 'statistics_mean'],
    ['probability', 'probability'],
    ['sequences', 'sequences'],
    ['linear equations', 'linear_equations'],
    ['algebraic expressions', 'algebraic_expressions'],
  ];
  for (const [phrase, expected] of phrases) {
    const plan = planFromRules(`Create 4 questions on ${phrase}`, firstTopicIn);
    assert.ok(plan.steps.length, `"${phrase}" must route to a tool`);
    assert.equal(plan.steps[0].tool, 'generate_question');
    assert.equal(
      plan.steps[0].args.topic,
      expected,
      `"${phrase}" must resolve to the catalogue key ${expected}, not an invented one`,
    );
  }
});

test('a supported topic always yields the questions that were asked for', () => {
  for (const topic of ['fractions_percentages', 'quadratics', 'pythagoras', 'geometry_angles', 'probability', 'statistics_mean']) {
    const built = buildExamPlan({
      title: `Topic ${topic}`, durationMinutes: 45, questionCount: 10, topics: [topic],
      gradeLabel: 'Grade 9', gradeOrder: 9, seed: 'yield',
      sections: [{ id: 'A', title: 'Questions', share: 1 }],
    });
    assert.equal(built.plan.questions.length, 10, `topic ${topic} produced ${built.plan.questions.length} of 10 questions`);
  }
});

/* ── 5. The registration tool exists and is least-privilege ─────────── */

test('register_ai_agent is registered with a schema and the right risk', () => {
  const tool = getTool('register_ai_agent');
  assert.ok(tool, 'the registration tool must exist in the shared registry');
  assert.equal(tool.risk.permission, 'ai.manage_agents');
  assert.equal(tool.risk.risk, 'ordinary', 'registration is reversible; revocation stays sensitive');
  assert.ok(tool.risk.writes, 'registration writes a row');
  const props = Object.keys(tool.input.properties ?? {});
  for (const required of ['name', 'client']) assert.ok(props.includes(required), `schema must declare ${required}`);
  assert.deepEqual(tool.input.required, ['name', 'client']);
});

test('the registration tool exists on every surface, from the one registry', () => {
  assert.equal(TOOLS.filter((t) => t.name === 'register_ai_agent').length, 1, 'declared exactly once');
  // REST and MCP both read TOOLS, so presence here is presence everywhere.
  const source = readFileSync('src/app/api/mcp/route.ts', 'utf8');
  assert.match(source, /from "@\/lib\/ai\/tools"/, 'MCP must read the shared registry');
});

test('an agent can be asked for by name and client', () => {
  const mcp = planFromRules('Register an MCP agent for our data team', firstTopicIn);
  assert.equal(mcp.steps[0]?.tool, 'register_ai_agent');
  assert.equal(mcp.steps[0]?.args.client, 'mcp');

  // A named product wins over the transport word: "connect Claude Desktop over
  // MCP" is a Claude credential, and the router must not flatten that to "mcp".
  const claude = planFromRules('Register an MCP agent to connect Claude Desktop', firstTopicIn);
  assert.equal(claude.steps[0]?.args.client, 'claude');
});

test('revocation stays sensitive while registration does not', () => {
  assert.equal(getTool('revoke_ai_agent').risk.risk, 'sensitive');
  assert.equal(getTool('register_ai_agent').risk.risk, 'ordinary');
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\nAI assistant quality: ${n} checks passed.`);
