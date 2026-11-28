// The AI core's registry, risk classes, generator correctness and validation.
//
// These are pure modules (no network, no database), so Node's type-stripping
// imports them directly — the same way the production bundler does. Every
// assertion here is about a property that would be a security or correctness
// bug if it regressed.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The modules under test import each other without file extensions (that is what
// the Next bundler and `tsc` resolve), which Node's ESM loader does not. They are
// compiled with the project's own tsconfig settings into a scratch directory and
// imported from there — the same transformation production performs.
const outDir = mkdtempSync(path.join(tmpdir(), 'evalora-ai-core-'));
execFileSync(
  'npx',
  [
    'tsc',
    // Only the modules that need no `server-only` boundary and no Next runtime.
    'src/lib/ai/types.ts', 'src/lib/ai/risk.ts', 'src/lib/ai/tools.ts', 'src/lib/ai/generator.ts',
    'src/lib/ai/validation.ts', 'src/lib/ai/intent.ts',
    '--outDir', outDir, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2022',
    '--esModuleInterop', '--skipLibCheck', '--moduleResolution', 'node', '--lib', 'es2022,dom',
    '--resolveJsonModule', '--jsx', 'preserve', '--downlevelIteration',
  ],
  { stdio: 'pipe' },
);
const load = async (relative) => import(pathToFileURL(path.join(outDir, relative)).href);

const { TOOLS, getTool, toolsForPermissions } = await load('lib/ai/tools.js');
const { riskOf, approvalRequired, SENSITIVE_TOOLS, READ_ONLY_TOOLS } = await load('lib/ai/risk.js');
const { buildExamPlan, TOPIC_CATALOG, resolveTopics, gradeOrderFromLabel, firstTopicIn } = await load('lib/ai/generator.js');
const { validateProposedExam, VALIDATION_HONESTY_NOTE, unclosedMathDelimiters } = await load('lib/ai/validation.js');
// The planner reads the registry and provider only; it is compiled separately
// because it is `server-only` in the app but pure logic in itself.
const { scoreAnswer } = await load('lib/scoring.js');
const { planFromRules, validateModelPlan } = await load('lib/ai/intent.js');

let n = 0;
const test = async (name, fn) => {
  await fn();
  n++;
  console.log('  ✓ ' + name);
};

/* ── Registry integrity ─────────────────────────────────────────────── */

await test('every tool declares a permission, a risk and an input schema', async () => {
  assert.ok(TOOLS.length >= 20, `expected a substantial registry, found ${TOOLS.length}`);
  for (const tool of TOOLS) {
    assert.match(tool.name, /^[a-z][a-z0-9_]{2,60}$/, `bad tool name ${tool.name}`);
    assert.ok(tool.title && tool.title.length > 5, `${tool.name} needs a human title`);
    assert.ok(tool.description && tool.description.length > 30, `${tool.name} needs a real description`);
    assert.ok(tool.risk?.permission, `${tool.name} has no permission`);
    assert.match(tool.risk.permission, /^[a-z_]+\.[a-z_]+$/, `${tool.name}: permission "${tool.risk.permission}" is not namespaced`);
    assert.ok(['ordinary', 'sensitive'].includes(tool.risk.risk), `${tool.name} has an invalid risk class`);
    assert.equal(typeof tool.input, 'object');
    assert.equal(tool.input.type, 'object', `${tool.name}: input schema must be an object`);
  }
});

await test('tool names are unique (the index would silently shadow one)', async () => {
  const names = TOOLS.map((t) => t.name);
  assert.equal(new Set(names).size, names.length);
  for (const name of names) assert.equal(getTool(name)?.name, name);
});

await test('required arguments exist in the properties they claim', async () => {
  for (const tool of TOOLS) {
    for (const key of tool.input.required ?? []) {
      assert.ok(
        Object.keys(tool.input.properties ?? {}).includes(key),
        `${tool.name}: required "${key}" is not a declared property`,
      );
    }
  }
});

await test('sensitive tools are exactly the described set, and all write', async () => {
  assert.deepEqual(
    [...SENSITIVE_TOOLS].sort(),
    [
      'apply_grade_adjustment',
      'mark_responses',
      'publish_examination',
      'publish_results',
      'revoke_ai_agent',
    ].sort(),
  );
  for (const name of SENSITIVE_TOOLS) {
    const tool = getTool(name);
    assert.ok(tool, `${name} must exist`);
    assert.equal(tool.risk.risk, 'sensitive');
    assert.equal(tool.risk.writes, true, `${name} is sensitive but claims not to write`);
    assert.equal(tool.risk.mayRequireApproval, true);
    assert.equal(riskOf(name), 'sensitive');
  }
});

await test('read-only tools never claim to write', async () => {
  for (const name of READ_ONLY_TOOLS) {
    const tool = getTool(name);
    assert.ok(tool, `${name} missing`);
    assert.equal(tool.risk.writes, false, `${name} is listed read-only but writes`);
  }
  assert.ok(!READ_ONLY_TOOLS.has('create_examination'));
});

await test('no tool silently writes without a permission covering a write verb', async () => {
  // A creating/editing tool must name .create / .edit / .manage — never .view.
  for (const tool of TOOLS) {
    if (!tool.risk.writes) continue;
    assert.match(
      tool.risk.permission,
      /\.(create|edit|delete|publish|validate|manage_agents)$/,
      `${tool.name} writes but its permission is "${tool.risk.permission}"`,
    );
  }
});

await test('permission filtering is monotonic: adding rights never removes access', async () => {
  const none = new Set();
  const some = new Set(['exams.view']);
  const all = new Set(TOOLS.map((t) => t.risk.permission));
  const count = (set) => toolsForPermissions((p) => set.has(p)).length;
  assert.equal(count(none), 0);
  assert.ok(count(some) > 0 && count(some) < count(all));
  assert.equal(count(all), TOOLS.length);
});

/* ── Approval gate ──────────────────────────────────────────────────── */

await test('a sensitive tool needs approval even when the caller may execute', async () => {
  assert.equal(
    approvalRequired({ tool: 'publish_examination', requireApprovalForSensitive: true, actorKind: 'human', execute: true }),
    true,
  );
  assert.equal(
    approvalRequired({ tool: 'publish_examination', requireApprovalForSensitive: true, actorKind: 'agent', execute: true }),
    true,
  );
});

await test('a missing policy setting means approval is required (fail closed)', async () => {
  assert.equal(
    approvalRequired({ tool: 'publish_results', requireApprovalForSensitive: undefined, actorKind: 'agent', execute: true }),
    true,
  );
});

await test('ordinary tools and dry runs never queue an approval', async () => {
  assert.equal(approvalRequired({ tool: 'list_examinations', requireApprovalForSensitive: true, actorKind: 'agent', execute: true }), false);
  assert.equal(approvalRequired({ tool: 'publish_examination', requireApprovalForSensitive: true, actorKind: 'human', execute: false }), false);
});

/* ── Generator correctness (regressions for two real bugs) ───────────── */

await test('simplify questions print an expression their key actually equals', async () => {
  // Regression: the medium "simplify" variant used to print a right-hand side
  // that simplified to 2c, disagreeing with its own key and explanation.
  for (let i = 0; i < 60; i++) {
    const built = buildExamPlan({
      title: 'Regression', durationMinutes: 60, questionCount: 8,
      topics: ['algebraic_expressions'], difficultyMix: { easy: 0, medium: 1, hard: 0 },
      seed: `simplify-${i}`, gradeLabel: 'Grade 9',
    });
    for (const q of built.plan.questions) {
      if (!/^Simplify /i.test(q.prompt)) continue;
      const source = q.prompt.replace(/^Simplify /i, '').replace(/\.$/, '').trim();
      // Parse "A x + B − C x − D" and compare with the key.
      const match = /^(-?\d*)x \+ (\d+) [−-] (\d*)x [−-] (\d+)$/.exec(source);
      assert.ok(match, `unparsable simplify prompt: ${source}`);
      const a = match[1] === '' || match[1] === '+' ? 1 : Number(match[1]);
      const b = Number(match[2]);
      const c = match[3] === '' ? 1 : Number(match[3]);
      const d = Number(match[4]);
      const coef = a - c;
      const correct = (coef === 1 ? 'x' : coef + 'x') + ' + ' + (b - d);
      assert.equal(q.options.find((o) => o.is_correct).label, correct, `key disagrees with ${source}`);
      assert.equal(new Set(q.options.map((o) => o.label)).size, q.options.length, `duplicate options in: ${q.prompt}`);
    }
  }
});

await test('no generated question ever repeats an option label', async () => {
  // Regression: the probability distractor could equal the correct answer when
  // the fraction was already in lowest terms, producing two identical labels.
  const topics = TOPIC_CATALOG.map((t) => t.key);
  for (const topic of topics) {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      for (let i = 0; i < 10; i++) {
        const built = buildExamPlan({
          title: 'Dupes', durationMinutes: 60, questionCount: 4,
          topics: [topic],
          difficultyMix:
            difficulty === 'easy' ? { easy: 1, medium: 0, hard: 0 }
            : difficulty === 'medium' ? { easy: 0, medium: 1, hard: 0 }
            : { easy: 0, medium: 0, hard: 1 },
          seed: `dupes-${topic}-${difficulty}-${i}`, gradeLabel: 'Grade 9',
        });
        for (const q of built.plan.questions) {
          const labels = (q.options ?? []).map((o) => o.label);
          assert.equal(new Set(labels).size, labels.length, `duplicate options in ${topic}/${difficulty}: ${q.prompt}`);
        }
      }
    }
  }
});

await test('linear equation questions are satisfied by the answer they declare', async () => {
  for (let i = 0; i < 40; i++) {
    const built = buildExamPlan({
      title: 'Equations', durationMinutes: 60, questionCount: 6,
      topics: ['linear_equations'], difficultyMix: { easy: 1, medium: 1, hard: 0 },
      seed: `lin-${i}`, gradeLabel: 'Grade 9',
    });
    for (const q of built.plan.questions) {
      if (q.type !== 'numeric') continue;
      const m = /^(-?\d*)x \+ (\d+) = (\d*)x \+ (-?\d+)$/.exec(q.prompt);
      if (!m) continue;
      const a = m[1] === '' ? 1 : Number(m[1]);
      const b = Number(m[2]);
      const d = m[3] === '' ? 1 : Number(m[3]);
      const e = Number(m[4]);
      const x = Number(q.config?.numeric_answer);
      assert.equal(a * x + b, d * x + e, `x=${x} does not satisfy ${q.prompt}`);
    }
  }
});

/* ── Validation honesty ─────────────────────────────────────────────── */

await test('a two-option single choice with no key is rejected before saving', async () => {
  const report = validateProposedExam({
    title: 'Bad', durationMinutes: 60,
    sections: [{ id: 'A', title: 'All', refs: ['q1'] }],
    questions: [{
      ref: 'q1', type: 'single_choice', prompt: 'Pick one', points: 1, difficulty: 'easy',
      options: [{ label: 'A', is_correct: false }, { label: 'B', is_correct: false }],
    }],
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => /correct option|key/i.test(e.message)));
});

await test('an unclosed formula delimiter is an error, not a warning', async () => {
  const report = validateProposedExam({
    title: 'Maths', durationMinutes: 60,
    sections: [{ id: 'A', title: 'All', refs: ['q1'] }],
    questions: [{
      ref: 'q1', type: 'short_answer', prompt: 'Evaluate $$2+2', points: 2, difficulty: 'easy',
      options: [{ label: '4', is_correct: true }],
    }],
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.some((e) => /formula|delimiter/i.test(e.message)));
  assert.deepEqual(unclosedMathDelimiters('$$x$$ and $$y$$'), []);
  assert.equal(unclosedMathDelimiters('$$x').length, 1);
});

await test('the validation report never promises mathematical correctness', async () => {
  assert.match(VALIDATION_HONESTY_NOTE, /structure|structural/i);
  assert.match(VALIDATION_HONESTY_NOTE, /do(es)? not (prove|guarantee|verify)|not a (proof|guarantee)/i);
  assert.ok(!/guarantee(s|d)? (mathematical|correctness)/i.test(VALIDATION_HONESTY_NOTE));
});

await test('every declared key in a generated paper is accepted by the real scorer', async () => {
  // This is the strongest single guarantee the generator can make: the same
  // scoring function candidates are marked with accepts what the paper says.
  // ScorableOption needs ids; the scorer matches on them, not on labels.
  const withIds = (options) =>
    (options ?? []).map((option, index) => ({ id: `o${index}`, label: option.label, is_correct: option.is_correct }));

  let checked = 0;
  for (const topic of TOPIC_CATALOG.map((t) => t.key)) {
    const built = buildExamPlan({
      title: 'Keys', durationMinutes: 90, questionCount: 6,
      topics: [topic], seed: `keys-${topic}`, gradeLabel: 'Grade 9',
    });
    for (const q of built.plan.questions) {
      const points = Number(q.points) || 1;
      const config = q.config ?? {};
      const options = withIds(q.options);
      const correct = options.filter((o) => o.is_correct);
      let answer = null;
      if (q.type === 'single_choice' || q.type === 'true_false') {
        answer = { option_id: correct[0]?.id };
      } else if (q.type === 'multiple_select') {
        answer = { option_ids: correct.map((o) => o.id) };
      } else if (q.type === 'short_answer') {
        answer = { text: correct[0]?.label };
      } else if (q.type === 'numeric') {
        answer = { value: config.numeric_answer };
      }
      if (!answer) continue;
      let awarded;
      try {
        awarded = scoreAnswer({ type: q.type, points, config, prompt: q.prompt }, options, answer);
      } catch (error) {
        assert.fail(`declared key did not score for ${topic}/${q.type}: ${error.message} — ${q.prompt}`);
      }
      assert.ok(awarded.points > 0, `declared key scored zero for ${topic}/${q.type}: ${q.prompt}`);
      assert.equal(awarded.isCorrect, true, `declared key not marked correct for ${topic}/${q.type}`);
      checked++;
    }
  }
  assert.ok(checked > 30, `expected to score many questions, scored ${checked}`);
});

/* ── Planning and untrusted model output ────────────────────────────── */

await test('rule planning routes each documented intent', async () => {
  const cases = [
    ['Create a Grade 9 MYP Mathematics examination on algebra, 90 minutes, 20 questions', 'create_examination'],
    ['Generate a hard question on percentages', 'generate_question'],
    ['Validate the examination 11111111-1111-4111-8111-111111111111', 'validate_examination'],
    ['How did the class do? 22222222-2222-4222-8222-222222222222', 'get_class_statistics'],
    ['Show me the workspace context', 'get_org_context'],
    ['Publish the examination 11111111-1111-4111-8111-111111111111', 'publish_examination'],
    ['Add 5 marks to 11111111-1111-4111-8111-111111111111', 'apply_grade_adjustment'],
  ];
  for (const [instruction, expected] of cases) {
    const plan = planFromRules(instruction, firstTopicIn);
    assert.equal(plan.steps[0]?.tool, expected, `"${instruction}" planned ${plan.steps[0]?.tool}`);
  }
});

// The topic fixture was "trigonometry". That word has no catalogue entry, and
// the router used to invent a topic key for it — which generated a paper with
// zero questions and was reported as a successful generation. The router now
// resolves through the catalogue and declines instead, which
// `test-ai-assistant-quality.mjs` asserts directly.
await test('an unsupported topic is declined rather than invented', async () => {
  const plan = planFromRules('Generate a hard question on trigonometry', firstTopicIn);
  assert.equal(plan.steps.length, 0, 'a topic with no catalogue entry must not produce a step');
  assert.match(plan.refusal ?? '', /could not turn that into an action/i);
});

await test('a publish instruction without an id refuses instead of guessing', async () => {
  const plan = planFromRules('Publish the examination');
  assert.equal(plan.steps.length, 0);
  assert.match(plan.refusal, /id|could not/i);
});

await test('model plans cannot name a tool outside the permitted set', async () => {
  const { steps, dropped } = validateModelPlan(
    { steps: [{ tool: 'delete_everything', args: {}, why: 'x' }, { tool: 'list_examinations', args: {}, why: 'y' }] },
    new Set(['list_examinations']),
  );
  assert.equal(steps.length, 1);
  assert.equal(steps[0].tool, 'list_examinations');
  assert.deepEqual(dropped, ['delete_everything']);
});

await test('model plans cannot smuggle undeclared arguments', async () => {
  const { steps } = validateModelPlan(
    { steps: [{ tool: 'get_examination', args: { examination_id: '11111111-1111-4111-8111-111111111111', as_super_admin: true, organization_id: 'other' } }] },
    new Set(['get_examination']),
  );
  assert.deepEqual(Object.keys(steps[0].args), ['examination_id']);
});

await test('an empty model plan falls back or refuses; it never executes nothing silently', async () => {
  const { steps } = validateModelPlan({ steps: [] }, new Set(['list_examinations']));
  assert.equal(steps.length, 0);
});

/* ── Structural guarantees across the modules ───────────────────────── */

await test('no AI module writes business tables directly', async () => {
  // The core must reach content through the shared services. A direct
  // `.insert(`/`.update(`/`.delete(` on a business table inside lib/ai would
  // mean a second implementation of a rule (limits, locks, tenant checks).
  const dir = new URL('../src/lib/ai/', import.meta.url);
  const forbidden = [
    /\.from\("questions"\)\s*\.insert/,
    /\.from\("quizzes"\)\s*\.insert/,
    /\.from\("quiz_questions"\)\s*\.(insert|upsert)/,
    /\.from\("question_options"\)\s*\.insert/,
    /\.from\("exams"\)\s*\.insert/,
  ];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(source), `${file} writes a business table directly: ${pattern}`);
    }
  }
});

await test('every service-role read of a tenant table is scoped by organization', async () => {
  const dir = new URL('../src/lib/ai/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    const blocks = source.split('runtime.admin');
    for (const block of blocks.slice(1)) {
      const snippet = block.slice(0, 400);
      if (!/\.from\(([a-z_]+)\)/.test(snippet)) continue;
      // Approvals/executions inserts carry organization_id in the same object.
      const scoped =
        /organization_id/.test(snippet) ||
        /requireOwned/.test(source.slice(0, 200)) ||
        /runtime\.admin\n?\s*\.from\("(approvals|executions)/.test(`runtime.admin${snippet}`);
      assert.ok(scoped, `${file}: an admin read near "${snippet.slice(0, 60).replace(/\s+/g, ' ')}" lacks an organization scope`);
    }
  }
});

await test('the corpus never mentions a service-role key in AI-facing text', async () => {
  const dir = new URL('../src/lib/ai/', import.meta.url);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, dir), 'utf8');
    assert.ok(!/SERVICE_ROLE_KEY/.test(source), `${file} references the service-role key`);
  }
});

await test('grade orders are derived from real labels', async () => {
  assert.equal(gradeOrderFromLabel('Grade 9'), 9);
  assert.equal(gradeOrderFromLabel('MYP4'), 9);
  assert.equal(gradeOrderFromLabel('Year 10'), 10);
});

await test('topic resolution finds mentioned topics and never invents one', async () => {
  const found = resolveTopics('Make an exam on fractions and probability', 9);
  assert.ok(found.includes('fractions_percentages'), `expected fractions, got ${found.join(', ')}`);
  assert.ok(found.includes('probability'), `expected probability, got ${found.join(', ')}`);
  // No mention, no topics: the planner's DEFAULT_TOPICS covers the empty case,
  // and resolveTopics must not fabricate a match from an empty instruction.
  assert.deepEqual(resolveTopics('', 9), []);
  // A topic outside the requested level band is not selected.
  assert.ok(!resolveTopics('quadratic equations', 4).includes('quadratics'));
});

rmSync(outDir, { recursive: true, force: true });
console.log(`\nAI core registry & generator: ${n} checks passed.`);
