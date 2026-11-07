// Run: node scripts/test-exam-save-queue.mjs
// Pure queue tests with mocked storage/network; browser + DB E2E still required.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

const source = readFileSync("src/lib/examSaveQueue.ts", "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const file = path.resolve("scripts/__virtual_exam_queue_test.cjs");
const virtual = new Module(file); virtual.filename = file; virtual.paths = Module._nodeModulePaths(path.dirname(file)); virtual._compile(js, file);
const { ExamSaveQueue } = virtual.exports;
function storage() {
  const values = new Map();
  return { values, getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) };
}
function deferred() { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; }
let passed = 0;
async function test(name, fn) { await fn(); console.log(`  ✓ ${name}`); passed++; }
const quiet = () => {};

await test("network failure retains answer for same-tab refresh", async () => {
  const store = storage(); const queue = new ExamSaveQueue(store, "q", async () => { throw new Error("offline"); }, quiet, quiet);
  queue.enqueue("q1", "qq1", { text: "A" }, []); assert.equal(await queue.flush(), false);
  assert.equal(queue.state().pending, 1); assert.match(queue.state().error, /offline/);
  assert.equal(JSON.parse(store.values.get("q"))[0].answer.text, "A");
  assert.ok(!store.values.get("q").includes("token"));
  queue.dispose();
  const sent = []; const restored = new ExamSaveQueue(store, "q", async (e) => { sent.push(e.answer.text); }, quiet, quiet);
  assert.equal(await restored.flush(), true); assert.deepEqual(sent, ["A"]); assert.equal(store.values.has("q"), false);
});
await test("serial ordering prevents an older in-flight save replacing the newest", async () => {
  const store = storage(); const first = deferred(); const sent = []; const saved = [];
  const queue = new ExamSaveQueue(store, "q", async (e) => { sent.push(e.answer.text); if (e.answer.text === "old") await first.promise; }, quiet, (e) => saved.push(e.answer.text));
  queue.enqueue("q1", "qq1", { text: "old" }, []);
  queue.enqueue("q1", "qq1", { text: "new" }, []);
  assert.equal(queue.state().pending, 1); assert.equal(queue.snapshot()[0].answer.text, "new");
  first.resolve(); assert.equal(await queue.flush(), true);
  assert.deepEqual(sent, ["old", "new"]); assert.deepEqual(saved, ["new"]); assert.equal(queue.state().pending, 0);
});
await test("failed in-flight request retains the newer replacement", async () => {
  const first = deferred(); let calls = 0;
  const queue = new ExamSaveQueue(storage(), "q", async () => { calls++; if (calls === 1) { await first.promise; throw new Error("offline"); } }, quiet, quiet);
  queue.enqueue("q1", "qq1", { text: "old" }, []); queue.enqueue("q1", "qq1", { text: "new" }, []); first.resolve();
  assert.equal(await queue.flush(), false); assert.equal(queue.snapshot()[0].answer.text, "new");
  assert.equal(await queue.flush(), true); assert.equal(queue.state().pending, 0);
});
await test("draft edits persist locally before a debounced network flush", async () => {
  const store = storage(); let sent = 0;
  const queue = new ExamSaveQueue(store, "q", async () => { sent++; }, quiet, quiet);
  assert.equal(queue.enqueue("q1", "qq1", { text: "draft" }, [], false), true);
  assert.equal(sent, 0);
  assert.equal(JSON.parse(store.values.get("q"))[0].answer.text, "draft");
  assert.equal(await queue.flush(), true);
  assert.equal(sent, 1); assert.equal(queue.state().pending, 0);
});
await test("different questions flush in update order", async () => {
  const first = deferred(); const sent = [];
  const queue = new ExamSaveQueue(storage(), "q", async (e) => { sent.push(e.questionId + e.answer.text); if (e.answer.text === "1") await first.promise; }, quiet, quiet);
  queue.enqueue("a", "qa", { text: "1" }, []); queue.enqueue("b", "qb", { text: "2" }, []); queue.enqueue("a", "qa", { text: "3" }, []);
  first.resolve(); assert.equal(await queue.flush(), true); assert.deepEqual(sent, ["a1", "b2", "a3"]);
});
await test("storage failure is visible; successful network saves remain possible", async () => {
  const noStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  const queue = new ExamSaveQueue(noStorage, "q", async () => {}, quiet, quiet);
  assert.equal(queue.state().durable, false); assert.equal(queue.enqueue("a", "qa", { text: "x" }, []), true);
  assert.equal(await queue.flush(), true); assert.equal(queue.state().pending, 0);
});
await test("corrupt recovery data is preserved and blocks final flush", async () => {
  const store = storage(); store.values.set("q", "not-json"); let sent = 0;
  const queue = new ExamSaveQueue(store, "q", async () => { sent++; }, quiet, quiet);
  assert.equal(queue.enqueue("a", "qa", { text: "x" }, []), false);
  assert.equal(await queue.flush(), false); assert.equal(sent, 0); assert.equal(store.values.get("q"), "not-json"); assert.match(queue.state().error, /invigilator/);
});
await test("coalesced flag snapshot is retained with the latest answer", async () => {
  const queue = new ExamSaveQueue(storage(), "q", async () => { throw new Error("offline"); }, quiet, quiet);
  queue.enqueue("a", "qa", { text: "x" }, ["a"]); await queue.flush();
  queue.enqueue("a", "qa", { text: "y" }, ["a", "b"]); await queue.flush();
  assert.deepEqual(queue.snapshot()[0].flagged, ["a", "b"]);
});
console.log(`\n${passed} exam save queue checks passed (mocked storage/network).`);
