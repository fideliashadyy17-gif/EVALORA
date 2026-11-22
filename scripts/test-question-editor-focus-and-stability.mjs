// Verification for Question Editor stability, focus retention, and zero-regression.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

console.log("Testing Question Editor focus and stability...");

// 1. Verify Field in src/components/ui.tsx supports as="div" and does not force <label>
const uiSrc = readFileSync("src/components/ui.tsx", "utf8");
assert.ok(uiSrc.includes('as = "label"'), "Field defaults to label for backward compatibility");
assert.ok(uiSrc.includes('as?: "label" | "div"'), "Field accepts as prop");
assert.ok(uiSrc.includes("const Component = as;"), "Field renders Component = as");
assert.ok(uiSrc.includes("<Component className="), "Field uses dynamic Component tag");
console.log("  ✓ Field supports as='div' without forcing <label>");

// 2. Verify QuestionForm uses as="div" around RichContentEditor
const qfSrc = readFileSync("src/components/QuestionForm.tsx", "utf8");
assert.ok(
  qfSrc.includes('<Field as="div" label="Question"'),
  "Question prompt field uses as='div' to prevent label focus stealing",
);
assert.ok(
  qfSrc.includes('<Field as="div" label="Worked solution / explanation"'),
  "Worked solution field uses as='div' to prevent label focus stealing",
);
console.log("  ✓ QuestionForm wraps RichContentEditor in div rather than label");

// 3. Verify RichContentEditor has static extensions and stable editorProps
const rceSrc = readFileSync("src/components/editor/RichContentEditor.tsx", "utf8");
assert.ok(rceSrc.includes("const RCE_EXTENSIONS = ["), "RCE_EXTENSIONS is statically defined outside component");
assert.ok(rceSrc.includes("extensions: RCE_EXTENSIONS"), "useEditor uses stable RCE_EXTENSIONS");
assert.ok(rceSrc.includes("const editorProps = useMemo("), "editorProps is memoized");
assert.ok(rceSrc.includes("isInternalUpdateRef.current = true"), "Internal typing updates are tracked to avoid cursor resets");
assert.ok(rceSrc.includes("editor.commands.focus(\"end\")"), "Clicking editor shell focuses contenteditable");
console.log("  ✓ RichContentEditor uses static extensions, memoized props, and stable internal update tracking");

// 4. Verify assessParts key stability
assert.ok(qfSrc.includes("clientKey: string;"), "AssessPartState has clientKey");
assert.ok(qfSrc.includes("key={part.clientKey}"), "AssessParts uses stable clientKey instead of editable part.id");
console.log("  ✓ Multi-part question parts use stable keys so editing part.id does not lose focus");

console.log("\nAll Question Editor stability checks PASSED!");
