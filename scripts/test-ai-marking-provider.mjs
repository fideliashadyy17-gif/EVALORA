// The provider boundary in src/lib/ai-marking.ts. No network: the transport is
// injected, and the checks are mostly about refusing to proceed.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const mod = await import(pathToFileURL(path.resolve('src/lib/ai-marking.ts')).href);
const {
  readProviderConfig, describeAiMarking, buildPrompt, parseSuggestions, suggestCriterionMarks, AiMarkingError,
} = mod;

let n = 0;
const test = async (name, fn) => { await fn(); n++; console.log('  ✓ ' + name); };

const criteria = [
  { id: 'c1', label: 'Names the light stage', maxMarks: 4 },
  { id: 'c2', label: 'Names the dark stage', maxMarks: 4 },
];
const request = { question: 'Describe photosynthesis.', answer: 'Two stages.', criteria, maxPoints: 8 };
const goodReply = JSON.stringify({
  marks: [
    { criterion_id: 'c1', marks: 3, rationale: 'names the light stage' },
    { criterion_id: 'c2', marks: 2.5, rationale: 'mentions the dark stage' },
  ],
});

await test('an empty environment configures nothing', async () => {
  assert.equal(readProviderConfig({}), null);
  const availability = describeAiMarking({});
  assert.equal(availability.configured, false);
  assert.match(availability.reason, /no model credential/i);
});

await test('naming a provider without a key is not enough', async () => {
  assert.equal(readProviderConfig({ AI_MARKING_PROVIDER: 'openai' }), null);
});

await test('a conventional provider key alone is enough, with a default model', async () => {
  const config = readProviderConfig({ OPENAI_API_KEY: 'sk-test' });
  assert.equal(config.provider, 'openai');
  assert.equal(config.model, 'gpt-4o-mini');
});

await test('an explicit provider, key and model are honoured', async () => {
  const config = readProviderConfig({ AI_MARKING_PROVIDER: 'anthropic', AI_MARKING_API_KEY: 'k', AI_MARKING_MODEL: 'claude-x' });
  assert.deepEqual(config, { provider: 'anthropic', model: 'claude-x', apiKey: 'k' });
});

await test('an unknown provider is refused rather than guessed', async () => {
  assert.equal(readProviderConfig({ AI_MARKING_PROVIDER: 'mistral', AI_MARKING_API_KEY: 'k' }), null);
});

await test('without a credential the guide refuses and never calls the transport', async () => {
  let called = false;
  await assert.rejects(
    () => suggestCriterionMarks(request, { env: {}, transport: async () => { called = true; return goodReply; } }),
    (error) => error instanceof AiMarkingError && error.code === 'unconfigured',
  );
  assert.equal(called, false, 'no request may leave the process');
});

await test('a valid reply becomes suggestions in criterion order', async () => {
  const outcome = await suggestCriterionMarks(request, {
    env: { OPENAI_API_KEY: 'sk-test' },
    transport: async () => goodReply,
  });
  assert.equal(outcome.provider, 'openai');
  assert.equal(outcome.suggestions.length, 2);
  assert.deepEqual(outcome.suggestions.map((s) => s.criterionId), ['c1', 'c2']);
  assert.equal(outcome.suggestions[1].marks, 2.5);
  assert.equal(outcome.promptDigest.length, 64);
});

await test('a mark outside the criterion maximum is rejected, not clamped', async () => {
  const reply = JSON.stringify({
    marks: [
      { criterion_id: 'c1', marks: 9, rationale: 'too much' },
      { criterion_id: 'c2', marks: 1, rationale: 'fine' },
    ],
  });
  assert.throws(() => parseSuggestions(JSON.parse(reply), request), /outside 0–4/);
});

await test('a skipped criterion is rejected', async () => {
  const reply = JSON.stringify({ marks: [{ criterion_id: 'c1', marks: 3, rationale: 'only one' }] });
  assert.throws(() => parseSuggestions(JSON.parse(reply), request), /skipped 1 criterion/);
});

await test('a repeated criterion is rejected', async () => {
  const reply = JSON.stringify({
    marks: [
      { criterion_id: 'c1', marks: 3, rationale: 'a' },
      { criterion_id: 'c1', marks: 2, rationale: 'b' },
      { criterion_id: 'c2', marks: 2, rationale: 'c' },
    ],
  });
  assert.throws(() => parseSuggestions(JSON.parse(reply), request), /more than once/);
});

await test('an unknown criterion is rejected', async () => {
  const reply = JSON.stringify({
    marks: [
      { criterion_id: 'c1', marks: 3, rationale: 'a' },
      { criterion_id: 'c9', marks: 1, rationale: 'b' },
    ],
  });
  assert.throws(() => parseSuggestions(JSON.parse(reply), request), /unknown criterion/);
});

await test('a missing rationale is rejected', async () => {
  const reply = JSON.stringify({
    marks: [
      { criterion_id: 'c1', marks: 3, rationale: '' },
      { criterion_id: 'c2', marks: 2, rationale: 'ok' },
    ],
  });
  assert.throws(() => parseSuggestions(JSON.parse(reply), request), /no rationale/);
});

await test('proposed marks above what the question is worth are rejected', async () => {
  const reply = JSON.stringify({
    marks: [
      { criterion_id: 'c1', marks: 4, rationale: 'max' },
      { criterion_id: 'c2', marks: 4, rationale: 'max' },
    ],
  });
  const tight = { ...request, maxPoints: 5 };
  assert.throws(() => parseSuggestions(JSON.parse(reply), tight), /exceed what the question is worth/);
});

await test('JSON wrapped in prose is still read', async () => {
  const outcome = await suggestCriterionMarks(request, {
    env: { AI_MARKING_API_KEY: 'k', AI_MARKING_PROVIDER: 'gemini' },
    transport: async () => `Here are the marks:\n${goodReply}\nI hope that helps.`,
  });
  assert.equal(outcome.provider, 'gemini');
  assert.equal(outcome.suggestions.length, 2);
});

await test('non-JSON output is refused', async () => {
  await assert.rejects(
    () => suggestCriterionMarks(request, { env: { AI_MARKING_API_KEY: 'k' }, transport: async () => 'I cannot help with that.' }),
    (error) => error instanceof AiMarkingError && error.code === 'invalid_response',
  );
});

await test('the prompt quotes the answer as data and lists every criterion', async () => {
  const { system, user } = buildPrompt(request);
  assert.match(system, /never decide a final mark/i);
  assert.ok(user.includes(JSON.stringify(request.answer)), 'the answer is quoted verbatim');
  assert.ok(user.includes('id=c1') && user.includes('id=c2'));
  assert.ok(user.includes('max=4'));
});

console.log(`\n${n} AI-marking provider checks passed (no network, injected transport).`);
