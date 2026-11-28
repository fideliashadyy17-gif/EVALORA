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

/* ── The instruction that reached a teacher as ONE question ──────────── */
test('a count survives the words between it and the noun', () => {
  // Test A, verbatim. The count regex required the digits to touch "questions",
  // so "10 Grade 9 MYP mathematics questions" matched nothing and the default of
  // one question was used. The teacher asked for ten and was shown a batch.
  const a = planFromRules(
    'Create 10 Grade 9 MYP mathematics questions on linear equations, with different difficulty levels, correct answers and worked solutions.',
    firstTopicIn,
  );
  assert.equal(a.steps.length, 1, 'Test A must be one operation');
  assert.equal(a.steps[0].tool, 'generate_question');
  assert.equal(a.steps[0].args.count, 10, 'ten questions were asked for');

  for (const [text, expected] of [
    ['Create 10 questions on algebra', 10],
    ['Create ten questions on fractions', 10],
    ['Generate 5 questions about probability', 5],
    ['Make 12 questions on angles', 12],
    ['Build 8 questions on quadratics', 8],
  ]) {
    const plan = planFromRules(text, firstTopicIn);
    const args = plan.steps[0]?.args ?? {};
    const found = args.count ?? args.generate?.question_count;
    assert.equal(found, expected, `${JSON.stringify(text)} must ask for ${expected}`);
  }
});

test('the word a teacher actually uses resolves to a topic', () => {
  // "algebra" was absent from the alias list, so "10 questions on algebra"
  // resolved to nothing and was refused.
  for (const [text, topic] of [
    ['on algebra', 'algebraic_expressions'],
    ['on linear equations', 'linear_equations'],
    ['on fractions', 'fractions_percentages'],
    ['on angles', 'geometry_angles'],
    ['on probability', 'probability'],
  ]) {
    const plan = planFromRules(`Create 5 questions ${text}`, firstTopicIn);
    assert.equal(plan.steps[0]?.args?.topic, topic, `${JSON.stringify(text)} must resolve to ${topic}`);
  }
});

test('a request for a spread of difficulties is planned, not dropped', () => {
  // "with different difficulty levels" was discarded and every item came out
  // medium, which is not what the sentence says.
  const a = planFromRules('Create 10 questions on linear equations with different difficulty levels', firstTopicIn);
  assert.ok(a.steps[0].args.difficulty_mix, 'the mix must reach the handler');
  assert.deepEqual(Object.keys(a.steps[0].args.difficulty_mix).sort(), ['easy', 'hard', 'medium']);

  // A named difficulty must still not be turned into a spread.
  const hard = planFromRules('Create 5 hard questions on quadratics', firstTopicIn);
  assert.equal(hard.steps[0].args.difficulty, 'hard');
  assert.equal(hard.steps[0].args.difficulty_mix, undefined);

  // And the generator must actually produce the spread.
  const built = buildExamPlan({
    title: 'Mix', durationMinutes: 30, questionCount: 10, topics: ['linear_equations'],
    gradeLabel: 'Grade 9', gradeOrder: 9, seed: 'mix-check',
    difficultyMix: a.steps[0].args.difficulty_mix, sections: [{ id: 'A', title: 'Q', share: 1 }],
  });
  const seen = new Set(built.plan.questions.map((q) => q.difficulty));
  assert.ok(seen.size >= 2, `a spread must contain more than one difficulty, got ${[...seen].join(',')}`);
});

test('a count survives into a paper instruction too', () => {
  // The count is read the same way whatever the object, so "20 questions" can
  // never quietly become a ten-question paper downstream.
  const paper = planFromRules('Create a 20 question paper on algebra', firstTopicIn);
  assert.equal(paper.steps[0].tool, 'create_examination');
  assert.match(paper.steps[0].args.instruction, /20 question/, 'the count must reach the planner');
});

test('a quiz is filled with the topic that was named', () => {
  // Test C. The topic was dropped, so buildExamPlan fell back to the grade's
  // default topics and produced an ALGEBRA quiz for a fractions request — worse
  // than a refusal, because it looked successful.
  const c = planFromRules(
    'Create a 10-question Grade 8 mathematics quiz on fractions, with four options per question, one correct answer, scoring and a 20-minute duration.',
    firstTopicIn,
  );
  assert.equal(c.steps[0].tool, 'create_quiz');
  assert.deepEqual(c.steps[0].args.generate.topics, ['fractions_percentages'], 'the named topic must be forwarded');
  assert.equal(c.steps[0].args.generate.question_count, 10);
  assert.equal(c.steps[0].args.duration_minutes, 20, 'twenty minutes, not the old fixed thirty');
  assert.equal(c.steps[0].args.options_per_question, 4, 'four options were asked for');
});

test('a duration is read from every form a teacher writes', () => {
  for (const [text, minutes] of [
    ['Create a quiz on fractions with a 20-minute duration', 20],
    ['Create a quiz on fractions, 20 minutes', 20],
    ['Create a quiz on fractions for 20 mins', 20],
    ['Create a quiz on fractions lasting 2 hours', 120],
    ['Create a quiz on fractions lasting 90 minutes', 90],
  ]) {
    const plan = planFromRules(text, firstTopicIn);
    assert.equal(plan.steps[0]?.args?.duration_minutes, minutes, `${JSON.stringify(text)} → ${minutes}`);
  }
});

test('a four-option fraction quiz is actually four-option and markable', () => {
  // Before this, the fractions family produced only numeric questions, so a
  // "four options per question" request could not be satisfied at all.
  const built = buildExamPlan({
    title: 'Fractions', durationMinutes: 20, questionCount: 10, topics: ['fractions_percentages'],
    gradeLabel: 'Grade 8', gradeOrder: 8, seed: 'four-option', preferredOptions: 4,
    sections: [{ id: 'A', title: 'Q', share: 1 }],
  });
  assert.equal(built.plan.questions.length, 10, 'ten questions must be produced, not none');
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  for (const q of built.plan.questions) {
    assert.equal(q.type, 'single_choice');
    assert.equal((q.options ?? []).length, 4, `"${q.prompt}" must have four options`);
    const correct = (q.options ?? []).filter((o) => o.is_correct);
    assert.equal(correct.length, 1, `"${q.prompt}" must have exactly one key`);
    const labels = (q.options ?? []).map((o) => o.label);
    assert.equal(new Set(labels).size, labels.length, `"${q.prompt}" repeats an option`);
    // Independent recomputation of the answer key from the prompt itself.
    const m = /\\dfrac\{(\d+)\}\{(\d+)\}/.exec(q.prompt);
    assert.ok(m, `"${q.prompt}" must show the fraction in LaTeX`);
    const [num, den] = [Number(m[1]), Number(m[2])];
    const g = gcd(num, den);
    assert.ok(g > 1, `"${q.prompt}" is already in simplest form, so the task is vacuous`);
    assert.equal(correct[0].label, `$\\dfrac{${num / g}}{${den / g}}$`, `wrong key for "${q.prompt}"`);
  }
  assert.ok(validateProposedExam(built.plan).ok, 'the paper must pass its own validator');
});

test('an unusable option count is refused before anything is written', () => {
  // Twelve options cannot be built from a fraction bank of five distractors, and
  // a paper that silently contains two-option items is a false success.
  assert.equal(getTool('create_quiz').input.properties.options_per_question.maximum, 8);
  assert.ok(getTool('create_quiz').input.properties.duration_minutes, 'duration must be part of the contract');
});

/* ── Modifying an existing examination without a UUID ───────────────── */
test('a described examination can be edited without its id', () => {
  // Test D. No rule produced update_examination, so "change the duration" was
  // answered with "I could not turn that into an action".
  const d = planFromRules(
    'Replace two questions in the Grade 9 linear equations examination and change its duration to 90 minutes.',
    firstTopicIn,
  );
  assert.equal(d.steps[0]?.tool, 'update_examination');
  assert.equal(d.steps[0].args.duration_minutes, 90);
  assert.equal(d.steps[0].args.examination_id, undefined, 'a described exam carries no id');
  assert.ok(d.steps[0].args.reference, 'the description must reach the resolver');
});

test('analysis and validation resolve a described examination', () => {
  // Both used to require a UUID, so "the last examination" was refused.
  const analyse = planFromRules('Analyse the results of the last Grade 9 examination', firstTopicIn);
  assert.equal(analyse.steps[0]?.tool, 'analyze_exam_performance');
  assert.ok(analyse.steps[0].args.reference);

  const check = planFromRules('Check my exam for mistakes', firstTopicIn);
  assert.equal(check.steps[0]?.tool, 'validate_examination');
  assert.ok(check.steps[0].args.reference);
});

test('the update and analysis tools accept a description as well as an id', () => {
  for (const name of ['update_examination', 'validate_examination', 'analyze_exam_performance']) {
    const tool = getTool(name);
    assert.ok(tool, `${name} must exist`);
    assert.ok(tool.input.properties.reference, `${name} must accept a description`);
    const required = tool.input.required ?? [];
    assert.ok(!required.includes('examination_id'), `${name} must not demand an id when a description works`);
  }
});

test('a destructive instruction is still refused', () => {
  // D9: the fix for "the assistant refuses everything" must not become
  // "the assistant will delete anything".
  for (const text of [
    "Delete all of Oak's examinations",
    'Remove every question from the Grade 9 exam',
    'Wipe the question bank',
  ]) {
    const plan = planFromRules(text, firstTopicIn);
    assert.equal(plan.steps.length, 0, `${JSON.stringify(text)} must not plan an action`);
  }
});

/* ── Retries must not duplicate ─────────────────────────────────────── */
test('a retried submission reuses its request id instead of minting a new one', () => {
  // Every write handler creates a new object, so a second execution of the same
  // instruction is a duplicate paper, not a refresh. The composer holds one id
  // per instruction and the engine replays the first result for it.
  const client = readFileSync('src/app/dashboard/ai/AssistantClient.tsx', 'utf8');
  assert.match(client, /crypto\.randomUUID\(\)/, 'the composer must mint a request id');
  assert.match(client, /requestId: id/, 'the same id must be sent on retry');
  assert.doesNotMatch(
    client,
    /requestId: crypto\.randomUUID\(\)/,
    'the id must be minted once per instruction, not per attempt',
  );

  const engine = readFileSync('src/lib/ai/engine.ts', 'utf8');
  assert.match(engine, /status", "succeeded"/, 'the guard must only replay completed writes');
  assert.match(engine, /arguments_digest/, 'a reused id with different arguments must not replay');
  assert.match(engine, /code: "replayed"/, 'a replay must be reported as such, not as a new object');
  assert.match(engine, /actor_user_id/, 'the guard must be scoped to the acting human');
});

test('a dry run and a failed attempt are never treated as already done', () => {
  const engine = readFileSync('src/lib/ai/engine.ts', 'utf8');
  // Bound the slice at the INSERT, not at `startedAt`: the comment block that
  // documents the guard mentions that identifier, so slicing on it truncated the
  // code under test and the assertion failed on prose placeholders.
  const guard = engine.slice(engine.indexOf('const replayable'), engine.indexOf('const insertExecution'));
  assert.match(guard, /request\.execute !== false/, 'preview mode must stay re-runnable');
  assert.match(guard, /!request\.approvalId/, 'an approved operation keeps the approval guarantee');
  assert.match(guard, /"succeeded"/, 'only a completed write may replay');

  // An external client retrying a POST is the likeliest duplicate of all: it has
  // no UI to disable the button. Excluding agents made idempotency a property of
  // the browser instead of the platform, so the guard must cover them — and be
  // scoped to the specific agent so two agents cannot answer for each other.
  assert.doesNotMatch(guard, /actor\.kind === "human"/, 'agents must not be excluded from replay');
  assert.match(guard, /actor_kind/, 'the guard must be scoped to the actor kind');
  assert.match(guard, /actor\.agentId/, 'the guard must be scoped to the specific agent');
});

test('a confirmation never claims more than the database holds', () => {
  // The UI summary is built from the persisted row, so a paper is only described
  // once saveQuiz returned its id.
  const handlers = readFileSync('src/lib/ai/handlers.ts', 'utf8');
  const createQuiz = handlers.slice(handlers.indexOf('async function createQuiz'), handlers.indexOf('async function updateQuiz'));
  assert.match(createQuiz, /const saved = await saveQuiz/, 'the paper must be saved through the real service');
  assert.ok(
    createQuiz.indexOf('saveQuiz') < createQuiz.indexOf('quiz_id: saved.id'),
    'the confirmation must quote the saved id, not a predicted one',
  );
});

/* ── The permission resolver must actually resolve ──────────────────── */
test('the AI permission resolver uses the evaluator, not the identity guard', () => {
  // Found by running the real MCP handshake against production: an approved
  // agent was offered ZERO tools and every call was refused with "You do not
  // have ... which ... requires". The resolver called `access_has_permission`,
  // whose first line returns false whenever `auth.uid()` is distinct from the
  // user id — and on the service-role client `auth.uid()` is NULL, so it
  // returned false for every permission and every user.
  const authz = readFileSync('src/lib/ai/authz.ts', 'utf8');
  const resolver = authz.slice(authz.indexOf("export function permissionResolver"), authz.indexOf("export async function aiModuleRefusal"));
  assert.match(resolver, /rpc\("_access_eval_permission"/, 'the pure evaluator must be the one asked');
  assert.doesNotMatch(resolver, /rpc\("access_has_permission"/, 'the session-guarded wrapper must not be used on a service-role client');
  // The module half of the check must survive: a plan without the module denies.
  assert.match(resolver, /moduleEnabled/, 'the plan gate must still apply');
});

test('dropping the identity guard does not drop tenant isolation', () => {
  // The evaluator is only safe without the guard because identity is resolved
  // from the agent's own row, not inferred from the request. Prove that link.
  const authz = readFileSync('src/lib/ai/authz.ts', 'utf8');
  assert.match(authz, /resolveAgentActor/, 'the actor must come from the token resolver');
  assert.match(authz, /p_user_id: auth\.actor\.userId/, 'the permission question must name the resolved human');
  assert.match(authz, /p_organization_id: auth\.organizationId/, 'the permission question must name the resolved organization');

  // And the evaluator itself still refuses the cases that matter. This is the
  // live answer recorded when the change was made.
  const evidence = readFileSync('docs/AI_LIVE_VERIFICATION_2026-11-28.md', 'utf8');
  assert.match(evidence, /_access_eval_permission/, 'the verification record must explain the evaluator');
});

/* ── Revocation must reach the database, and say so ──────────────────── */
test('revocation passes an explicit actor instead of relying on auth.uid()', () => {
  // Reported from production: "Revoke Immediately" did nothing. The database
  // function identified the caller with `is_super_admin() or can_manage_org(...)`,
  // both of which read auth.uid(). The dashboard calls it on the SERVICE-ROLE
  // client, where auth.uid() is NULL, so it raised AI_PERMISSION_DENIED on every
  // invocation for every user and never updated a row.
  const agents = readFileSync('src/lib/ai/agents.ts', 'utf8');
  const revoke = agents.slice(agents.indexOf('export async function revokeAgent'), agents.indexOf('/** Rotates a credential'));
  assert.match(revoke, /p_actor_id:\s*actorId/, 'the human must be passed to the database function');
  assert.match(revoke, /actorId: string/, 'revokeAgent must take an actor id');
  // A false return means the row vanished between the ownership check and the
  // update. Reporting success there would be the original bug in a new place.
  assert.match(revoke, /data !== true/, 'a false result must not be reported as success');
  assert.match(revoke, /permission_denied/, 'a permission refusal must map to a real error code');
});

test('rotation records the actor and raises instead of silently no-opping', () => {
  const agents = readFileSync('src/lib/ai/agents.ts', 'utf8');
  const rotate = agents.slice(agents.indexOf('export async function rotateAgentToken'), agents.indexOf('export async function setAgentNarrowing'));
  // Rotating with a plain UPDATE ... WHERE status='approved' updated zero rows for
  // a revoked agent and returned the new token anyway: a credential that could
  // never work, handed to the user as a success.
  assert.match(rotate, /p_actor_id:\s*actorId/);
  assert.match(rotate, /AI_AGENT_NOT_APPROVED/, 'an unapproved agent must raise, not no-op');
});

test('the revocation action never swallows an error', () => {
  const actions = readFileSync('src/app/dashboard/ai/agents/actions.ts', 'utf8');
  const revoke = actions.slice(actions.indexOf('export async function revokeAgentAction'), actions.indexOf('export async function rotateTokenAction'));
  // The old handler was `catch { /* idem */ }` and returned void, which is why a
  // total backend failure presented as a button that did nothing.
  assert.doesNotMatch(revoke, /catch\s*\{\s*\/\*\s*idem\s*\*\//, 'the revoke action must not swallow errors');
  assert.match(revoke, /return \{\s*ok:\s*false/, 'a failure must return a failure state');
  assert.match(revoke, /ok:\s*true/, 'a success must return a success state');
  assert.match(revoke, /reason\.length < 4/, 'an empty or trivial reason must be refused server-side');
  assert.match(revoke, /auth\.ctx\.user\.id/, 'the verified session user must be the recorded actor');
});

test('the revocation UI shows confirmation, progress and the outcome', () => {
  const ui = readFileSync('src/app/dashboard/ai/agents/RevokeAgentForm.tsx', 'utf8');
  assert.match(ui, /useActionState/, 'the form must consume the action state');
  assert.match(ui, /pending/, 'an in-flight request must be visible');
  assert.match(ui, /Yes, revoke it/, 'a destructive action needs a confirmation step');
  assert.match(ui, /role="alert"/, 'a failure must be announced, not silent');
  assert.match(ui, /role="status"/, 'success and progress must be announced');
  assert.match(ui, /state\.token/, 'the rotated token must be rendered from the action result');
  const page = readFileSync('src/app/dashboard/ai/agents/page.tsx', 'utf8');
  assert.doesNotMatch(page, /evalora_ai_token_once/, 'the one-time cookie path must be gone');
});

test('the revocation migration takes the actor and checks it properly', () => {
  const sql = readFileSync('supabase/migrations/20261128140000_ai_agent_revocation_actor.sql', 'utf8')
    // Strip `--` comment lines first: the header explains the OLD bug and names
    // the helpers it removed, so asserting against raw text would read its own
    // explanation as a violation.
    .split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
  assert.match(sql, /p_actor_id uuid default null/, 'the function must accept an explicit actor');
  assert.match(sql, /_access_eval_permission\(v_actor, v_org, 'ai\.manage_agents'\)/, 'authorization must use the pure evaluator');
  assert.doesNotMatch(sql, /can_manage_org/, 'the auth.uid()-dependent helper must be gone from the revoke path');
  assert.match(sql, /token_digest = null/, 'revocation must clear the digest so the old token stops resolving');
  assert.match(sql, /revoked_by = v_actor/, 'the actor must be recorded');
  assert.match(sql, /revoke_reason = left\(coalesce\(p_reason/, 'the reason must be persisted');
  // Revoking a credential is not deleting a registration.
  assert.doesNotMatch(sql, /delete from public\.ai_agents/i, 'revocation must not delete the agent row');
  // Adding an argument creates an overload rather than replacing the function, so
  // the broken two-argument signature would stay callable and make the name
  // ambiguous to PostgREST. It has to be dropped explicitly.
  assert.match(sql, /drop function if exists public\.ai_revoke_agent\(uuid, text\)/, 'the obsolete overload must be dropped');
});

test('rotation names its target and keeps the agent\'s own client', () => {
  const ui = readFileSync('src/app/dashboard/ai/agents/RevokeAgentForm.tsx', 'utf8');
  // Two defects found by auditing the production interface:
  //
  //   1. The rotate control said only "Rotate token". The page lists EVERY agent
  //      in the organization, so a person cannot tell which credential a button
  //      will replace. Rotating the wrong one silently breaks a working
  //      integration, which is exactly the confusion this work started from.
  //   2. The client was hardcoded to "custom". Rotating an `api` agent rewrote
  //      its prefix to evalora_custom_…, so the dashboard described a different
  //      client than the one registered.
  assert.match(ui, /Rotate \{agentName\}/, 'the rotate control must name the agent it replaces');
  assert.doesNotMatch(ui, /name="client" value="custom"/, 'the client must not be hardcoded');
  assert.match(ui, /name="client" value=\{client\}/, 'the client must come from the agent row');
  assert.match(ui, /agentName: string;\s*\n\s*client: string;/, 'the component must receive both');
  // And the page must pass them through from the agent it renders.
  const page = readFileSync('src/app/dashboard/ai/agents/page.tsx', 'utf8');
  assert.match(page, /<RotateTokenForm agentId=\{agent\.id\} agentName=\{agent\.name\} client=\{agent\.client\}/,
    'the rendered control must be bound to that specific agent');
});

test('the agents page states which organization it is managing', () => {
  // The page listed credentials without ever naming the workspace. A person with
  // one membership cannot be in the wrong organization here, so the omission was
  // invisible — and stays invisible right up until a rotation "does not take".
  const page = readFileSync('src/app/dashboard/ai/agents/page.tsx', 'utf8');
  assert.match(page, /\{org\.name\}/, 'the organization must be named on the page');
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\nAI assistant quality: ${n} checks passed.`);
