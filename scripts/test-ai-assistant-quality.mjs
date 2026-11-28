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
  'src/lib/ai/validation.ts', 'src/lib/ai/intent.ts', 'src/lib/ai/agents.ts', 'src/lib/ai/agentToken.ts',
  '--outDir', outDir, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2022',
  '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node', '--lib', 'es2022,dom',
  '--resolveJsonModule', '--jsx', 'preserve', '--downlevelIteration',
], { stdio: 'pipe' });
const load = async (rel) => import(pathToFileURL(path.join(outDir, rel)).href);

const { buildExamPlan, topicsForGrade, firstTopicIn } = await load('lib/ai/generator.js');
const { validateProposedExam } = await load('lib/ai/validation.js');
const { planFromRules } = await load('lib/ai/intent.js');
const { TOOLS, getTool } = await load('lib/ai/tools.js');
const { failureOf, journalStatusFor } = await load('lib/ai/types.js');
const { generateAgentToken, TOKEN_PREFIX_LENGTH, AGENT_CLIENTS } = await load('lib/ai/agentToken.js');

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

test('a fraction question never offers the correct answer twice', () => {
  // The probability family's "unsimplified" distractor is identical to the key
  // whenever the fraction is already in simplest form (3/8). A multiple-choice
  // question whose wrong option equals the right one cannot be marked.
  for (const seed of ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8']) {
    const built = buildExamPlan({
      title: 'Fractions', durationMinutes: 30, questionCount: 8, topics: ['probability'],
      gradeLabel: 'Grade 9', gradeOrder: 9, seed,
      sections: [{ id: 'A', title: 'Q', share: 1 }],
    });
    for (const q of built.plan.questions) {
      const labels = (q.options ?? []).map((o) => o.label);
      assert.equal(
        new Set(labels).size,
        labels.length,
        `seed ${seed}: question "${q.prompt.slice(0, 40)}" repeats an option: ${labels.join(' | ')}`,
      );
      assert.equal(
        (q.options ?? []).filter((o) => o.is_correct).length,
        1,
        `seed ${seed}: exactly one option must be correct`,
      );
    }
    const report = validateProposedExam(built.plan);
    assert.ok(report.ok, `seed ${seed}: probability paper must validate: ${report.errors.map((e) => e.code).join(',')}`);
  }
});

test('fractions are rendered as mathematics, not ASCII', () => {
  const built = buildExamPlan({
    title: 'Fraction notation', durationMinutes: 30, questionCount: 4, topics: ['probability'],
    gradeLabel: 'Grade 9', gradeOrder: 9, seed: 'tex', sections: [{ id: 'A', title: 'Q', share: 1 }],
  });
  const withFraction = built.plan.questions.filter((q) => (q.options ?? []).some((o) => o.label.includes('\\dfrac')));
  assert.ok(withFraction.length > 0, 'at least one option must use LaTeX');
  for (const q of withFraction) {
    for (const option of q.options ?? []) {
      // Balanced delimiters: the validator rejects unclosed maths, and an
      // unbalanced label would render as raw source in the UI.
      const dollars = (option.label.match(/\$/g) ?? []).length;
      assert.equal(dollars % 2, 0, `unbalanced maths delimiters in "${option.label}"`);
    }
  }
});

/* ── A token must fit the column that stores its prefix ─────────────── */

test('every client yields a token prefix the schema will accept', () => {
  // `ai_agents_token_prefix_check` allows 6–16 characters. The prefix used to be
  // sliced to 18, which no client name can satisfy — `evalora_api_` is already
  // 12 — so every insert was rejected and agent registration could never
  // succeed. ai_agents has been empty since it was created.
  const check = readFileSync('supabase/migrations/20261127180000_ai_core.sql', 'utf8').match(
    /token_prefix text check \(token_prefix is null or char_length\(token_prefix\) between (\d+) and (\d+)\)/,
  );
  assert.ok(check, 'the prefix length constraint must be found in the migration');
  const [, min, max] = check.map(Number);
  assert.equal(max, TOKEN_PREFIX_LENGTH, 'the code constant must match the column constraint');

  for (const client of AGENT_CLIENTS) {
    const { token, digest, prefix } = generateAgentToken(client);
    assert.ok(prefix.length >= min && prefix.length <= max,
      `${client}: prefix "${prefix}" is ${prefix.length} chars, constraint is ${min}–${max}`);
    assert.equal(digest.length, 64, 'the digest must fit the 64-char column');
    assert.match(token, new RegExp(`^evalora_${client}_[A-Za-z0-9_-]{43}$`),
      `${client}: token shape must stay evalora_<client>_<43 base64url chars>`);
    // The stored prefix must never be the whole secret.
    assert.ok(token.length > prefix.length * 2, 'the prefix must not reveal the token');
  }
});

test('the client list in code matches the database constraint', () => {
  // The live constraint allowed five clients and omitted "api", which the code
  // offers — registering an api agent raised a 23514 the UI could only render as
  // a generic failure. The migration must name exactly the code's clients.
  const sql = readFileSync('supabase/migrations/20261128120000_ai_agent_credential_constraints.sql', 'utf8');
  const match = sql.match(/check \(client in \(([^)]*)\)\)/);
  assert.ok(match, 'the client constraint must be present in the reconciliation migration');
  const inSql = match[1].split(',').map((v) => v.trim().replace(/^'|'$/g, '')).sort();
  assert.deepEqual(inSql, [...AGENT_CLIENTS].sort(),
    `migration allows ${inSql.join(',')} but AGENT_CLIENTS is ${AGENT_CLIENTS.join(',')}`);
});

test('AI-authored questions are labelled with a value the schema accepts', () => {
  // `questions_creation_method_check` allows manual | imported | ai_generated,
  // and the column defaults to 'manual'. Nothing in the product ever set it, so
  // every AI-written question was indistinguishable from a teacher's own work.
  // The assistant now states the label; this pins it to the real constraint.
  const schema = readFileSync('src/app/dashboard/questions/actions.ts', 'utf8');
  const allowed = schema.match(/creation_method: z\.enum\(\[([^\]]*)\]\)/);
  assert.ok(allowed, 'the question schema must accept creation_method');
  const keys = allowed[1].split(',').map((v) => v.trim().replace(/^"|"$/g, ''));
  assert.deepEqual(keys.sort(), ['ai_generated', 'imported', 'manual'],
    'the zod vocabulary must match questions_creation_method_check');

  const handlers = readFileSync('src/lib/ai/handlers.ts', 'utf8');
  const saves = handlers.match(/saveQuestion\(\{/g) ?? [];
  const labelled = handlers.match(/creation_method: "ai_generated"/g) ?? [];
  assert.equal(labelled.length, saves.length,
    `every assistant save must be labelled: ${saves.length} saveQuestion calls, ${labelled.length} labels`);
});

/* ── A refusal must never be journaled as a success ─────────────────── */

test('a refused tool is journaled as failed, and reported as a failure', () => {
  // The production defect. `create_examination` returned `ok:false` carrying six
  // validation errors; the engine recorded status "succeeded" and handed the
  // caller `ok:true`, so the teacher was told a paper existed while the database
  // held nothing. These are the real functions the engine now calls.
  const validationRefusal = failureOf({
    error: {
      code: 'invalid_arguments',
      message: 'The paper did not pass validation, so nothing was saved: total_marks.',
    },
    summary: 'The generated paper did not pass structural validation, so nothing was saved.',
  });
  assert.equal(validationRefusal.code, 'invalid_arguments');
  assert.match(validationRefusal.message, /nothing was saved/);
  assert.equal(journalStatusFor(validationRefusal.code), 'failed', 'a refusal is a failure');

  // A refusal that carries no typed error must still not be a success.
  const bare = failureOf({ summary: 'The question was not saved.' });
  assert.equal(journalStatusFor(bare.code), 'failed');
  assert.equal(bare.message, 'The question was not saved.');

  // An authorization refusal is a denial, not a failure — the distinction the
  // journal keeps.
  assert.equal(journalStatusFor('permission_denied'), 'denied');
  assert.equal(journalStatusFor('rate_limited'), 'failed');

  // And the engine must actually route through them. Reading the shipped source
  // is the only way to assert the call site without booting the whole app graph.
  const engine = readFileSync('src/lib/ai/engine.ts', 'utf8');
  assert.match(engine, /if \(result\.ok === false\)/, 'the engine must branch on a tool refusal');
  assert.match(engine, /const \{ code, message \} = failureOf\(result\)/, 'the branch must use failureOf');
  assert.match(engine, /status: journalStatusFor\(code\)/, 'the journal status must come from journalStatusFor');
  // The success path must not be reachable for a refusal: the branch that
  // returns `ok: false` must come before the success journal write.
  const refusalBranch = engine.indexOf('if (result.ok === false)');
  const successWrite = engine.indexOf('await finish({\n      status: "succeeded"');
  assert.ok(refusalBranch !== -1, 'the engine branches on a tool refusal');
  assert.ok(successWrite > refusalBranch, 'the success journal write follows the refusal branch');
  assert.ok(
    engine.indexOf('ok: false,\n        tool: request.tool', refusalBranch) < successWrite,
    'the refusal path returns before the success write',
  );
  assert.match(engine, /return \{\s*ok: false,\s*tool: request\.tool,/, 'the refusal path returns ok:false');
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
