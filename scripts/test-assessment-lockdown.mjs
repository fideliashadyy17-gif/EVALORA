// Run: node scripts/test-assessment-lockdown.mjs
// The clipboard and context-menu lockdown for student assessment surfaces.
// Pure classification functions, then the attach behaviour against a fake target
// (the same code runs in the browser, where the target is window).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Module } from "node:module";
import path from "node:path";
import ts from "typescript";

function compile(source, dest) {
  const file = path.resolve(dest);
  const mod = new Module(file);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(
    ts.transpileModule(readFileSync(source, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    file,
  );
  return mod.exports;
}

const L = compile("src/lib/assessmentLockdown.ts", "scripts/__assessment_lockdown_test.cjs");

let passed = 0;
function ok(name, condition) {
  assert.ok(condition, name);
  console.log(`  ✓ ${name}`);
  passed++;
}

const WIN = false;
const MAC = true;
const win = (key, extra = {}) => ({ key, ctrlKey: true, ...extra });
const mac = (key, extra = {}) => ({ key, metaKey: true, ...extra });

/* ── Platform detection ── */
ok("a Mac is recognised from its platform string", L.isApplePlatform({ platform: "MacIntel" }) === true);
ok("an iPad reporting itself as a Mac is still Apple", L.isApplePlatform({ platform: "MacIntel", userAgent: "x" }) === true);
ok("Windows is not Apple", L.isApplePlatform({ platform: "Win32" }) === false);
ok("Linux and ChromeOS are not Apple", L.isApplePlatform({ platform: "Linux x86_64" }) === false && L.isApplePlatform({ platform: "Linux armv8l", userAgent: "CrOS" }) === false);
ok("the user-agent client hints take precedence", L.isApplePlatform({ userAgentData: { platform: "macOS" }, platform: "Win32" }) === true);
ok("a missing user agent falls back to Windows behaviour", L.isApplePlatform(undefined) === false && L.isApplePlatform({}) === false);
ok("a user agent alone can identify an iPhone", L.isApplePlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)" }) === true);

/* ── Clipboard shortcuts on Windows, Linux and ChromeOS ── */
ok("Ctrl+C copies", L.clipboardShortcut(win("c"), WIN) === "copy");
ok("Ctrl+X cuts", L.clipboardShortcut(win("x"), WIN) === "cut");
ok("Ctrl+V pastes", L.clipboardShortcut(win("v"), WIN) === "paste");
ok("Ctrl+Shift+V (paste as plain text) pastes", L.clipboardShortcut(win("V", { shiftKey: true }), WIN) === "paste");
ok("Ctrl+C is recognised by physical key when the layout changes the letter", L.clipboardShortcut({ key: "ç", code: "KeyC", ctrlKey: true }, WIN) === "copy");
ok("Shift+Insert pastes", L.clipboardShortcut({ key: "Insert", shiftKey: true }, WIN) === "paste");
ok("Ctrl+Insert copies", L.clipboardShortcut({ key: "Insert", ctrlKey: true }, WIN) === "copy");
ok("Shift+Delete cuts", L.clipboardShortcut({ key: "Delete", shiftKey: true }, WIN) === "cut");
ok("Insert alone does nothing", L.clipboardShortcut({ key: "Insert" }, WIN) === null);
ok("Ctrl+Alt+C is not copy (AltGr layouts type real characters with it)", L.clipboardShortcut({ key: "c", ctrlKey: true, altKey: true }, WIN) === null);

/* ── Clipboard shortcuts on Apple devices ── */
ok("Cmd+C copies on a Mac", L.clipboardShortcut(mac("c"), MAC) === "copy");
ok("Cmd+X cuts on a Mac", L.clipboardShortcut(mac("x"), MAC) === "cut");
ok("Cmd+V pastes on a Mac", L.clipboardShortcut(mac("v"), MAC) === "paste");
ok("Ctrl+C is not copy on a Mac (it is a terminal interrupt there)", L.clipboardShortcut(win("c"), MAC) === null);
ok("Shift+Delete does not cut on a Mac", L.clipboardShortcut({ key: "Delete", shiftKey: true }, MAC) === null);

/* ── Ordinary typing must keep working ── */
ok("plain letters are not clipboard actions", L.clipboardShortcut({ key: "c" }, WIN) === null && L.clipboardShortcut({ key: "v" }, MAC) === null);
ok("Shift-typed capitals are not clipboard actions", L.clipboardShortcut({ key: "C", shiftKey: true }, WIN) === null);
ok("undo and redo are left alone", L.clipboardShortcut(win("z"), WIN) === null && L.clipboardShortcut(win("z", { shiftKey: true }), WIN) === null && L.clipboardShortcut(mac("z", { shiftKey: true }), MAC) === null);
ok("select-all in an answer field is left alone", L.clipboardShortcut(win("a"), WIN) === null);
ok("arrows, Backspace and Delete are left alone", ["ArrowLeft", "ArrowRight", "Backspace", "Delete", "Home", "End"].every((k) => L.clipboardShortcut({ key: k }, WIN) === null));
ok("Shift+arrows (extend selection) are left alone", L.clipboardShortcut({ key: "ArrowLeft", shiftKey: true }, WIN) === null);

/* ── Context menu keys ── */
ok("the Menu key opens the context menu, so it is blocked", L.isContextMenuKey({ key: "ContextMenu" }));
ok("Shift+F10 opens the context menu, so it is blocked", L.isContextMenuKey({ key: "F10", shiftKey: true }));
ok("F10 alone is not blocked", L.isContextMenuKey({ key: "F10" }) === false);
ok("ordinary keys are not context-menu keys", L.isContextMenuKey({ key: "a" }) === false);

/* ── Input types and answer fields ── */
ok("paste and drop input types are classified", ["insertFromPaste", "insertFromPasteAsQuotation", "insertFromDrop", "insertFromYank"].every(L.isClipboardInputType));
ok("typed text is not a clipboard input", L.isClipboardInputType("insertText") === false && L.isClipboardInputType(undefined) === false && L.isClipboardInputType("deleteContentBackward") === false);
ok("inputs and textareas are answer fields", L.isTextEntry({ tagName: "INPUT" }) && L.isTextEntry({ tagName: "textarea" }));
ok("a contenteditable element is an answer field", L.isTextEntry({ tagName: "DIV", isContentEditable: true }));
ok("a node inside an input counts as inside an answer field", L.isTextEntry({ tagName: undefined, parentElement: { tagName: "INPUT" } }));
ok("question text is not an answer field", L.isTextEntry({ tagName: "P" }) === false && L.isTextEntry({ tagName: "DIV" }) === false);
ok("the document itself is not an answer field", L.isTextEntry(null) === false && L.isTextEntry(undefined) === false);

/* ── Attach behaviour ── */
function fakeTarget() {
  const map = new Map();
  return {
    addEventListener(type, handler, options) {
      map.set(type, [...(map.get(type) ?? []), { handler, options }]);
    },
    removeEventListener(type, handler) {
      map.set(type, (map.get(type) ?? []).filter((e) => e.handler !== handler));
    },
    fire(type, event) {
      const e = { type, preventDefault: () => (e.defaultPrevented = true), defaultPrevented: false, ...event };
      for (const { handler } of [...(map.get(type) ?? [])]) handler(e);
      return e;
    },
    count: () => [...map.values()].reduce((n, list) => n + list.length, 0),
    all: () => [...map.values()].flat(),
  };
}

function lock({ isApple = false } = {}) {
  const target = fakeTarget();
  const reports = [];
  const detach = L.attachAssessmentLockdown(target, { isApple, onAction: (a) => reports.push(a) });
  return { target, reports, detach };
}

{
  const { target, reports } = lock();
  const copy = target.fire("keydown", win("c"));
  ok("Ctrl+C keydown is cancelled and reported as copy", copy.defaultPrevented && reports.at(-1) === "copy");
  const plain = target.fire("keydown", { key: "c" });
  ok("typing c is not cancelled", plain.defaultPrevented === false);
  const arrows = target.fire("keydown", { key: "ArrowRight" });
  ok("arrows are not cancelled", arrows.defaultPrevented === false);
  const ctxKey = target.fire("keydown", { key: "ContextMenu" });
  ok("the Menu key is cancelled and reported as context_menu", ctxKey.defaultPrevented && reports.at(-1) === "context_menu");
  const copyEvent = target.fire("copy", {});
  const cutEvent = target.fire("cut", {});
  const pasteEvent = target.fire("paste", {});
  ok("copy, cut and paste events are cancelled", copyEvent.defaultPrevented && cutEvent.defaultPrevented && pasteEvent.defaultPrevented);
  ok("each clipboard event is reported once", reports.filter((r) => r === "copy").length === 2 && reports.includes("cut") && reports.includes("paste"));
  const menu = target.fire("contextmenu", {});
  ok("the right-click menu is cancelled and reported", menu.defaultPrevented && reports.at(-1) === "context_menu");
}

{
  const { target, reports } = lock();
  const paste = target.fire("beforeinput", { inputType: "insertFromPaste" });
  const typed = target.fire("beforeinput", { inputType: "insertText", data: "x" });
  ok("a paste into an answer field is cancelled before it lands", paste.defaultPrevented && reports.at(-1) === "paste");
  ok("typed text is never cancelled", typed.defaultPrevented === false);
}

{
  const { target } = lock();
  const img = target.fire("dragstart", { target: { tagName: "IMG" } });
  const div = target.fire("dragstart", { target: { tagName: "DIV" } });
  ok("dragging an image out of the page is cancelled", img.defaultPrevented === true);
  ok("dragging a non-image element is not cancelled (matching and ordering tiles keep working)", div.defaultPrevented === false);
}

{
  const { target } = lock();
  const text = target.fire("selectstart", { target: { tagName: "P" } });
  const field = target.fire("selectstart", { target: { tagName: "INPUT" } });
  const doc = target.fire("selectstart", { target: null });
  ok("question text cannot be selected", text.defaultPrevented === true);
  ok("the candidate can still select text inside their own answer field", field.defaultPrevented === false);
  ok("a selection that starts on the document itself is cancelled", doc.defaultPrevented === true);
}

{
  const { target, reports } = lock({ isApple: true });
  const cmdC = target.fire("keydown", mac("c"));
  const ctrlC = target.fire("keydown", win("c"));
  ok("on a Mac, Cmd+C is blocked", cmdC.defaultPrevented && reports.at(-1) === "copy");
  ok("on a Mac, Ctrl+C is not treated as copy", ctrlC.defaultPrevented === false);
}

{
  const { target, detach } = lock();
  ok("the lockdown registers its listeners", target.count() > 0);
  ok("every listener is registered in capture mode, so a page's stopPropagation() cannot hide an action", target.all().every((e) => e.options?.capture === true));
  detach();
  ok("detach removes every listener", target.count() === 0);
}

{
  // Blocking must not depend on the event reaching any particular element: a
  // copy that a component stops in the bubble phase is still cancelled at the
  // capture stage on the window.
  const { target, reports } = lock();
  const copy = target.fire("copy", {});
  ok("a copy is blocked whatever the page does later in the bubble phase", copy.defaultPrevented && reports.includes("copy"));
}

{
  // The action is cancelled before it is reported, so a failing recorder can
  // never let a copy through.
  const target = fakeTarget();
  const detach = L.attachAssessmentLockdown(target, {
    isApple: false,
    onAction: () => {
      throw new Error("recorder offline");
    },
  });
  const event = { type: "copy", defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
  let threw = false;
  for (const { handler } of target.all()) {
    try {
      handler(event);
    } catch {
      threw = true;
    }
  }
  ok("the recorder did throw, so the test is meaningful", threw === true);
  ok("the copy is cancelled even when the recorder throws", event.defaultPrevented === true);
  detach();
}

console.log(`\n${passed} checks passed.`);
