"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * A scientific calculator for examinations.
 *
 * The whole point of this component is that a candidate never has to leave
 * the question to do arithmetic, so it is deliberately:
 *
 *   · self-contained — no `eval`, no `new Function`, no third-party parser.
 *     Expressions are tokenised and evaluated with an explicit shunting-yard
 *     parser over a fixed operator/function table, so nothing a candidate
 *     types can execute code.
 *   · non-destructive — opening or closing it never touches the answer, the
 *     draft or the timer; it only manages its own display state.
 *   · keyboard accessible and usable on a phone, where it opens as a sheet.
 */

// ───────────────────────────────────────────────────────────── expression engine

type Token =
  | { kind: "number"; value: number }
  | { kind: "const"; value: number }
  | { kind: "op"; value: Op }
  | { kind: "func"; value: FuncName }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

type Op = "+" | "-" | "*" | "/" | "^" | "%";

const OPS: Record<Op, { prec: number; right: boolean; apply: (a: number, b: number) => number }> = {
  "+": { prec: 1, right: false, apply: (a, b) => a + b },
  "-": { prec: 1, right: false, apply: (a, b) => a - b },
  "*": { prec: 2, right: false, apply: (a, b) => a * b },
  "/": { prec: 2, right: false, apply: (a, b) => a / b },
  "^": { prec: 4, right: true, apply: (a, b) => Math.pow(a, b) },
  // "mod" is bound to the % key because that is what a school calculator's %
  // key is used for at this level; the candidate sees "mod" on the key face.
  "%": { prec: 2, right: false, apply: (a, b) => (b === 0 ? NaN : a - b * Math.floor(a / b)) },
};

const FUNCS: Record<string, { arity: number; apply: (...args: number[]) => number }> = {
  sin: { arity: 1, apply: (x) => Math.sin(toRad(x)) },
  cos: { arity: 1, apply: (x) => Math.cos(toRad(x)) },
  tan: { arity: 1, apply: (x) => Math.tan(toRad(x)) },
  asin: { arity: 1, apply: (x) => toDeg(Math.asin(x)) },
  acos: { arity: 1, apply: (x) => toDeg(Math.acos(x)) },
  atan: { arity: 1, apply: (x) => toDeg(Math.atan(x)) },
  sinh: { arity: 1, apply: (x) => Math.sinh(x) },
  cosh: { arity: 1, apply: (x) => Math.cosh(x) },
  tanh: { arity: 1, apply: (x) => Math.tanh(x) },
  log: { arity: 1, apply: (x) => Math.log10(x) },
  ln: { arity: 1, apply: (x) => Math.log(x) },
  sqrt: { arity: 1, apply: (x) => Math.sqrt(x) },
  cbrt: { arity: 1, apply: (x) => Math.cbrt(x) },
  abs: { arity: 1, apply: (x) => Math.abs(x) },
  exp: { arity: 1, apply: (x) => Math.exp(x) },
  floor: { arity: 1, apply: (x) => Math.floor(x) },
  ceil: { arity: 1, apply: (x) => Math.ceil(x) },
  round: { arity: 1, apply: (x) => Math.round(x) },
  pow: { arity: 2, apply: (a, b) => Math.pow(a, b) },
  ncr: { arity: 2, apply: (n, r) => combinations(n, r) },
  npr: { arity: 2, apply: (n, r) => permutations(n, r) },
  min: { arity: 2, apply: (a, b) => Math.min(a, b) },
  max: { arity: 2, apply: (a, b) => Math.max(a, b) },
};
type FuncName = keyof typeof FUNCS;

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E, tau: Math.PI * 2 };

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}
function factorial(n: number): number {
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n) || n > 170) return NaN;
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}
function combinations(n: number, r: number): number {
  if (n < 0 || r < 0 || r > n || !Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  return permutations(n, r) / factorial(r);
}
function permutations(n: number, r: number): number {
  if (n < 0 || r < 0 || r > n || !Number.isInteger(n) || !Number.isInteger(r)) return NaN;
  return factorial(n) / factorial(n - r);
}

function tokenise(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let expectOperand = true;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === " " || ch === "," && tokens.length === 0) {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      expectOperand = false;
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "%") {
      // A leading +/- is a signed number, not an operator.
      if (expectOperand && (ch === "+" || ch === "-")) {
        const m = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(input.slice(i));
        if (m) {
          tokens.push({ kind: "number", value: Number(m[0]) });
          i += m[0].length;
          expectOperand = false;
          continue;
        }
        if (ch === "-") {
          tokens.push({ kind: "const", value: -1 });
          tokens.push({ kind: "op", value: "*" });
          i += 1;
          expectOperand = true;
          continue;
        }
        i += 1;
        continue;
      }
      tokens.push({ kind: "op", value: ch as Op });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === "√") {
      tokens.push({ kind: "func", value: "sqrt" });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === "×") {
      tokens.push({ kind: "op", value: "*" });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === "÷") {
      tokens.push({ kind: "op", value: "/" });
      expectOperand = true;
      i += 1;
      continue;
    }
    if (ch === "−") {
      tokens.push(expectOperand ? { kind: "const", value: -1 } : { kind: "op", value: "-" });
      if (expectOperand) tokens.push({ kind: "op", value: "*" });
      expectOperand = expectOperand;
      i += 1;
      continue;
    }
    if (ch === "π") {
      tokens.push({ kind: "const", value: Math.PI });
      expectOperand = false;
      i += 1;
      continue;
    }
    const numMatch = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(input.slice(i));
    if (numMatch) {
      tokens.push({ kind: "number", value: Number(numMatch[0]) });
      i += numMatch[0].length;
      expectOperand = false;
      continue;
    }
    const idMatch = /^[A-Za-z][A-Za-z0-9_]*/.exec(input.slice(i));
    if (idMatch) {
      const name = idMatch[0].toLowerCase();
      if (name === "mod") {
        tokens.push({ kind: "op", value: "%" });
      } else if (Object.prototype.hasOwnProperty.call(FUNCS, name)) {
        tokens.push({ kind: "func", value: name as FuncName });
      } else if (Object.prototype.hasOwnProperty.call(CONSTS, name)) {
        tokens.push({ kind: "const", value: CONSTS[name] });
      } else {
        throw new Error(`Unknown name “${idMatch[0]}”`);
      }
      i += idMatch[0].length;
      expectOperand = true;
      continue;
    }
    throw new Error(`Cannot read “${ch}”`);
  }
  return tokens;
}

/** Safe evaluation: shunting-yard to RPN, then a fixed operator table. */
export function evaluateExpression(input: string, ans = 0): number {
  const tokens = tokenise(input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\bans\b/gi, String(ans)));
  if (!tokens.length) return NaN;
  const output: (number | Token)[] = [];
  const stack: Token[] = [];
  const arityStack: number[] = [];

  const popTo = (predicate: (t: Token) => boolean) => {
    while (stack.length && predicate(stack[stack.length - 1])) {
      output.push(stack.pop()!);
    }
  };

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token.kind === "number" || token.kind === "const") {
      output.push(token.value);
      // Implicit multiplication: 2(3+4), 3π, 2√9, 5sin(30).
      const next = tokens[i + 1];
      if (next && (next.kind === "lparen" || next.kind === "func" || next.kind === "const")) {
        stack.push({ kind: "op", value: "*" });
      }
      continue;
    }
    if (token.kind === "func") {
      stack.push(token);
      continue;
    }
    if (token.kind === "comma") {
      popTo((t) => t.kind !== "lparen");
      if (arityStack.length) arityStack[arityStack.length - 1] += 1;
      continue;
    }
    if (token.kind === "op") {
      const current = OPS[token.value];
      popTo((t) => {
        if (t.kind !== "op") return false;
        const other = OPS[t.value];
        return other.prec > current.prec || (other.prec === current.prec && !current.right);
      });
      stack.push(token);
      continue;
    }
    if (token.kind === "lparen") {
      if (i > 0 && tokens[i - 1].kind === "func") arityStack.push(1);
      stack.push(token);
      continue;
    }
    // rparen
    popTo((t) => t.kind !== "lparen");
    if (!stack.length) throw new Error("Unbalanced brackets");
    stack.pop();
    const top = stack[stack.length - 1];
    if (top && top.kind === "func") {
      output.push(stack.pop()!);
    }
  }
  popTo(() => true);
  if (stack.some((t) => t.kind === "lparen" || t.kind === "rparen")) throw new Error("Unbalanced brackets");

  const evalStack: number[] = [];
  for (const item of output) {
    if (typeof item === "number") {
      evalStack.push(item);
      continue;
    }
    if (item.kind === "op") {
      const b = evalStack.pop();
      const a = evalStack.pop();
      if (a === undefined || b === undefined) throw new Error("Incomplete expression");
      evalStack.push(OPS[item.value].apply(a, b));
      continue;
    }
    if (item.kind === "func") {
      const fn = FUNCS[item.value];
      const args: number[] = [];
      for (let k = 0; k < fn.arity; k += 1) {
        const v = evalStack.pop();
        if (v === undefined) throw new Error(`Missing argument for ${item.value}`);
        args.unshift(v);
      }
      evalStack.push(fn.apply(...args));
      continue;
    }
    throw new Error("Incomplete expression");
  }
  if (evalStack.length !== 1) throw new Error("Incomplete expression");
  const result = evalStack[0];
  return Number.isFinite(result) ? result : NaN;
}

export function formatResult(value: number): string {
  if (Number.isNaN(value)) return "Error";
  if (!Number.isFinite(value)) return value > 0 ? "∞" : "−∞";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e12 || abs < 1e-9)) return value.toExponential(6).replace("e", " × 10^");
  const rounded = Math.round(value * 1e10) / 1e10;
  return String(rounded);
}

// ──────────────────────────────────────────────────────────────────── keypad

type Key =
  | { label: string; insert?: string; kind?: "digit" | "op" | "func" | "const" | "action"; action?: Action; span?: number; aria?: string }
  | { label: string; action: Action; kind: "action"; span?: number; aria?: string };

type Action = "clear" | "back" | "equals" | "negate" | "ans" | "toggle";

const BASIC_KEYS: Key[] = [
  { label: "C", action: "clear", kind: "action", aria: "Clear" },
  { label: "( )", insert: "(", kind: "op", aria: "Open bracket" },
  { label: "%", insert: "mod", kind: "op", aria: "Modulo" },
  { label: "÷", insert: "/", kind: "op", aria: "Divide" },
  { label: "7", insert: "7", kind: "digit" },
  { label: "8", insert: "8", kind: "digit" },
  { label: "9", insert: "9", kind: "digit" },
  { label: "×", insert: "*", kind: "op", aria: "Multiply" },
  { label: "4", insert: "4", kind: "digit" },
  { label: "5", insert: "5", kind: "digit" },
  { label: "6", insert: "6", kind: "digit" },
  { label: "−", insert: "-", kind: "op", aria: "Subtract" },
  { label: "1", insert: "1", kind: "digit" },
  { label: "2", insert: "2", kind: "digit" },
  { label: "3", insert: "3", kind: "digit" },
  { label: "+", insert: "+", kind: "op", aria: "Add" },
  { label: "0", insert: "0", kind: "digit", span: 1 },
  { label: ".", insert: ".", kind: "digit", aria: "Decimal point" },
  { label: "Ans", action: "ans", kind: "action", aria: "Previous answer" },
  { label: "=", action: "equals", kind: "action", aria: "Equals" },
];

const SCIENTIFIC_KEYS: Key[] = [
  { label: "x²", insert: "^2", kind: "op", aria: "Square" },
  { label: "xʸ", insert: "^", kind: "op", aria: "Power" },
  { label: "√", insert: "sqrt(", kind: "func", aria: "Square root" },
  { label: "∛", insert: "cbrt(", kind: "func", aria: "Cube root" },
  { label: "sin", insert: "sin(", kind: "func" },
  { label: "cos", insert: "cos(", kind: "func" },
  { label: "tan", insert: "tan(", kind: "func" },
  { label: "log", insert: "log(", kind: "func", aria: "Log base 10" },
  { label: "ln", insert: "ln(", kind: "func", aria: "Natural log" },
  { label: "eˣ", insert: "exp(", kind: "func" },
  { label: "π", insert: "π", kind: "const", aria: "Pi" },
  { label: "n!", insert: "factorial(", kind: "func", aria: "Factorial" },
  { label: "×10ˣ", insert: "*10^", kind: "op", aria: "Times ten to the power" },
  { label: "±", action: "negate", kind: "action", aria: "Change sign" },
  { label: "1/x", insert: "1/(", kind: "op", aria: "Reciprocal" },
  { label: "mod", insert: "mod", kind: "op", aria: "Modulo" },
];

// ──────────────────────────────────────────────────────────────── component

export interface CalculatorSnapshot {
  expression: string;
  result: string;
  error: string | null;
  lastAnswer: number;
  history: { expr: string; value: string }[];
  showScientific: boolean;
}

export function Calculator({
  scientific = true,
  onClose,
  onMinimize,
  className,
  chrome = true,
  initial = null,
  onSnapshot,
}: {
  scientific?: boolean;
  onClose?: () => void;
  onMinimize?: () => void;
  className?: string;
  /** The launcher supplies its own drag bar; direct callers keep the card header. */
  chrome?: boolean;
  initial?: CalculatorSnapshot | null;
  onSnapshot?: (snapshot: CalculatorSnapshot) => void;
}) {
  const [expression, setExpression] = useState(initial?.expression ?? "");
  const [result, setResult] = useState<string>(initial?.result ?? "0");
  const [error, setError] = useState<string | null>(initial?.error ?? null);
  const [showScientific, setShowScientific] = useState(initial?.showScientific ?? scientific);
  const lastAnswer = useRef(initial?.lastAnswer ?? 0);
  const history = useRef<{ expr: string; value: string }[]>(initial?.history ? [...initial.history] : []);
  const [historyVersion, setHistoryVersion] = useState(0);
  const displayRef = useRef<HTMLInputElement>(null);
  const snapshotRef = useRef(onSnapshot);
  snapshotRef.current = onSnapshot;

  const insert = useCallback((text: string) => {
    setError(null);
    setExpression((prev) => (prev === "" && text === "(" ? text : prev + text));
  }, []);

  const backspace = useCallback(() => {
    setError(null);
    setExpression((prev) => {
      if (!prev) return prev;
      // Remove a whole function name at once (e.g. "sin(" → "").
      const m = /([A-Za-z][A-Za-z0-9_]*|mod)$/.exec(prev);
      return m ? prev.slice(0, prev.length - m[0].length) : prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setExpression("");
    setResult("0");
  }, []);

  const equals = useCallback(() => {
    if (!expression.trim()) return;
    try {
      const value = evaluateExpression(expression, lastAnswer.current);
      const formatted = formatResult(value);
      setResult(formatted);
      setError(formatted === "Error" ? "Check the expression" : null);
      if (Number.isFinite(value)) {
        lastAnswer.current = value;
        history.current = [{ expr: expression, value: formatted }, ...history.current].slice(0, 8);
        setHistoryVersion((v) => v + 1);
      }
    } catch (err) {
      setResult("Error");
      setError(err instanceof Error ? err.message : "Check the expression");
    }
  }, [expression]);

  const applyAction = useCallback(
    (action: Action) => {
      switch (action) {
        case "clear": return clear();
        case "back": return backspace();
        case "equals": return equals();
        case "negate": return setExpression((prev) => (prev.startsWith("-") ? prev.slice(1) : `-${prev}`));
        case "ans": return insert(String(formatResult(lastAnswer.current)));
        case "toggle": return setShowScientific((v) => !v);
        default: return undefined;
      }
    },
    [backspace, clear, equals, insert],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      // Only handle keys when focus is inside the calculator, so the
      // candidate's answer field keeps its own keyboard behaviour.
      const key = event.key;
      if (key === "Enter" || key === "=") {
        event.preventDefault();
        equals();
      } else if (key === "Backspace") {
        event.preventDefault();
        backspace();
      } else if (/^[0-9.+\-*/^%()]$/.test(key)) {
        event.preventDefault();
        insert(key === "*" ? "*" : key);
      }
    },
    [backspace, equals, insert],
  );

  useEffect(() => {
    displayRef.current?.focus();
  }, []);

  // The launcher closes and reopens this component without losing a
  // calculation: every meaningful change is handed back as a restorable
  // snapshot. The expression is not an examination answer and is never saved
  // to the server.
  useEffect(() => {
    snapshotRef.current?.({
      expression,
      result,
      error,
      lastAnswer: lastAnswer.current,
      history: history.current,
      showScientific,
    });
  }, [expression, result, error, historyVersion, showScientific]);

  const keys = useMemo(() => (showScientific ? [...SCIENTIFIC_KEYS, ...BASIC_KEYS] : BASIC_KEYS), [showScientific]);

  return (
    <div
      className={cn("flex h-full w-full flex-col overflow-y-auto rounded-2xl border border-evergreen-900/20 bg-white shadow-lg", className)}
      onKeyDown={onKeyDown}
      role="group"
      aria-label="Calculator"
      translate="no"
    >
      {chrome ? (
        <div className="flex items-center justify-between gap-2 border-b border-evergreen-900/10 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-evergreen-800">Calculator</p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowScientific((v) => !v)}
              className="rounded-md px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50"
              aria-pressed={showScientific}
            >
              {showScientific ? "Scientific" : "Basic"}
            </button>
            {onMinimize ? (
              <button type="button" onClick={onMinimize} className="rounded-md px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50" aria-label="Minimize the calculator">
                —
              </button>
            ) : null}
            {onClose ? (
              <button type="button" onClick={onClose} className="rounded-md px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50" aria-label="Hide calculator">
                Hide
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end border-b border-evergreen-900/10 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setShowScientific((v) => !v)}
            className="rounded-md px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50"
            aria-pressed={showScientific}
          >
            {showScientific ? "Scientific" : "Basic"}
          </button>
        </div>
      )}

      <div className="px-3 pt-3">
        <input
          ref={displayRef}
          value={expression}
          onChange={(e) => {
            setExpression(e.target.value);
            setError(null);
          }}
          inputMode="text"
          aria-label="Calculator expression"
          placeholder="0"
          className="w-full rounded-lg border border-evergreen-900/15 bg-evergreen-50/40 px-3 py-2 text-right font-mono text-lg text-evergreen-950 outline-none focus:border-evergreen-600"
        />
        <p className={cn("mt-1 h-5 truncate text-right font-mono text-sm", error ? "text-red-700" : "text-evergreen-800")} aria-live="polite">
          {error ?? `= ${result}`}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5 p-3">
        {keys.map((key, index) => {
          const isAction = key.kind === "action";
          const label = key.action === "back" ? "⌫" : key.label;
          return (
            <button
              key={`${key.label}-${index}`}
              type="button"
              aria-label={key.aria ?? key.label}
              onClick={() => (isAction && key.action ? applyAction(key.action) : insert(key.insert ?? key.label))}
              className={cn(
                "h-10 rounded-lg border text-sm font-semibold transition active:scale-[0.97]",
                isAction && key.action === "equals"
                  ? "border-evergreen-700 bg-evergreen-700 text-white hover:bg-evergreen-800"
                  : isAction
                    ? "border-evergreen-900/15 bg-evergreen-50 text-evergreen-900 hover:bg-evergreen-100"
                    : key.kind === "digit"
                      ? "border-evergreen-900/15 bg-white text-evergreen-950 hover:bg-evergreen-50"
                      : "border-evergreen-900/15 bg-evergreen-50/70 text-evergreen-900 hover:bg-evergreen-100",
              )}
            >
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={backspace}
          aria-label="Backspace"
          className="h-10 rounded-lg border border-evergreen-900/15 bg-evergreen-50 text-evergreen-900 hover:bg-evergreen-100"
        >
          ⌫
        </button>
      </div>

      {history.current.length ? (
        <div className="border-t border-evergreen-900/10 px-3 py-2" data-history-version={historyVersion}>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-evergreen-700">Recent</p>
          <ul className="space-y-0.5">
            {history.current.slice(0, 3).map((entry, i) => (
              <li key={`${entry.expr}-${i}`}>
                <button
                  type="button"
                  onClick={() => insert(entry.value)}
                  className="w-full truncate text-left font-mono text-[11px] text-evergreen-800 hover:underline"
                >
                  {entry.expr} = {entry.value}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="px-3 pb-3 text-[10px] leading-snug text-evergreen-700">
        Angles are in degrees. Use <span className="font-mono">mod</span> for remainders,{" "}
        <span className="font-mono">^</span> for powers and <span className="font-mono">Ans</span> for the last
        answer. The calculator never changes or submits your answer.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────── draggable launcher

type PanelRect = { x: number; y: number; w: number; h: number };
type ResizeEdge = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_W = 272;
const MIN_H = 330;
const MAX_W = 580;
const MAX_H = 760;
const EDGE = 8;

function viewportSize() {
  if (typeof window === "undefined") return { w: 1280, h: 800 };
  return { w: window.innerWidth, h: window.innerHeight };
}

function clampRect(rect: PanelRect): PanelRect {
  const vp = viewportSize();
  const maxW = Math.max(MIN_W, Math.min(MAX_W, vp.w - EDGE * 2));
  const maxH = Math.max(MIN_H, Math.min(MAX_H, vp.h - EDGE * 2));
  const w = Math.min(maxW, Math.max(MIN_W, rect.w));
  const h = Math.min(maxH, Math.max(MIN_H, rect.h));
  const x = Math.min(Math.max(EDGE, rect.x), Math.max(EDGE, vp.w - w - EDGE));
  const y = Math.min(Math.max(EDGE, rect.y), Math.max(EDGE, vp.h - h - EDGE));
  return { x, y, w, h };
}

function defaultRect(): PanelRect {
  const vp = viewportSize();
  const mobile = vp.w < 640;
  const w = mobile ? Math.max(MIN_W, vp.w - 16) : 336;
  const h = mobile ? Math.min(MAX_H, Math.max(MIN_H, vp.h - 24)) : 520;
  return clampRect({ x: vp.w - w - 20, y: vp.h - h - 20, w, h });
}

interface StoredPanel {
  rect?: Partial<PanelRect>;
  open?: boolean;
  minimized?: boolean;
  snapshot?: CalculatorSnapshot | null;
}

export function CalculatorLauncher({
  className,
  variant = "inline",
  draggable = true,
  storageKey = "evalora-calculator",
}: {
  className?: string;
  variant?: "inline" | "floating";
  /** Premium capability. When false the calculator still works, but stays put. */
  draggable?: boolean;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [rect, setRect] = useState<PanelRect>(() => defaultRect());
  const [snapshot, setSnapshot] = useState<CalculatorSnapshot | null>(null);
  const [interacting, setInteracting] = useState(false);
  const interaction = useRef<{
    mode: "drag" | "resize";
    edge?: ResizeEdge;
    startX: number;
    startY: number;
    rect: PanelRect;
  } | null>(null);

  const close = useCallback(() => setOpen(false), []);
  const minimize = useCallback(() => {
    setOpen(false);
    setMinimized(true);
  }, []);

  // Restore the panel's session geometry and last calculation. SessionStorage
  // is per-tab, so a second examination tab cannot inherit another candidate's
  // calculator, and nothing is sent to the server.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(storageKey);
      if (!raw) return;
      const stored = JSON.parse(raw) as StoredPanel;
      if (stored.rect) {
        setRect(clampRect({
          x: Number(stored.rect.x ?? 0),
          y: Number(stored.rect.y ?? 0),
          w: Number(stored.rect.w ?? 336),
          h: Number(stored.rect.h ?? 520),
        }));
      }
      if (stored.snapshot) setSnapshot(stored.snapshot);
      setOpen(Boolean(stored.open));
      setMinimized(Boolean(stored.minimized));
    } catch {
      // A corrupt or blocked session store must never stop the calculator.
    }
  }, [storageKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ rect, open, minimized, snapshot } satisfies StoredPanel));
    } catch {
      // Storage quota/privacy mode: the calculator keeps working in memory.
    }
  }, [rect, open, minimized, snapshot, storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const onResize = () => setRect((current) => clampRect(current));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  useEffect(() => {
    if (!interacting) return;
    const move = (event: PointerEvent) => {
      const current = interaction.current;
      if (!current) return;
      if (current.mode === "drag") {
        setRect(clampRect({
          ...current.rect,
          x: current.rect.x + (event.clientX - current.startX),
          y: current.rect.y + (event.clientY - current.startY),
        }));
        return;
      }
      const dx = event.clientX - current.startX;
      const dy = event.clientY - current.startY;
      const edge = current.edge ?? "se";
      let { x, y, w, h } = current.rect;
      if (edge.includes("e")) w = current.rect.w + dx;
      if (edge.includes("s")) h = current.rect.h + dy;
      if (edge.includes("w")) {
        w = current.rect.w - dx;
        x = current.rect.x + dx;
      }
      if (edge.includes("n")) {
        h = current.rect.h - dy;
        y = current.rect.y + dy;
      }
      const vp = viewportSize();
      const maxW = Math.max(MIN_W, Math.min(MAX_W, vp.w - EDGE * 2));
      const maxH = Math.max(MIN_H, Math.min(MAX_H, vp.h - EDGE * 2));
      w = Math.min(maxW, Math.max(MIN_W, w));
      h = Math.min(maxH, Math.max(MIN_H, h));
      if (edge.includes("w")) x = current.rect.x + current.rect.w - w;
      if (edge.includes("n")) y = current.rect.y + current.rect.h - h;
      setRect(clampRect({ x, y, w, h }));
    };
    const up = () => {
      interaction.current = null;
      setInteracting(false);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [interacting]);

  const beginInteraction = useCallback((
    mode: "drag" | "resize",
    event: React.PointerEvent<HTMLElement>,
    edge?: ResizeEdge,
  ) => {
    if (!draggable) return;
    event.preventDefault();
    interaction.current = {
      mode,
      edge,
      startX: event.clientX,
      startY: event.clientY,
      rect,
    };
    setInteracting(true);
  }, [draggable, rect]);

  const panelVisible = open && !minimized;
  const launcherLabel = open ? "Close the calculator" : "Open the calculator";

  return (
    <div className={cn(variant === "floating" && "fixed bottom-4 right-4 z-50 print:hidden", className)}>
      <button
        type="button"
        onClick={() => {
          if (open) close();
          else {
            setOpen(true);
            setMinimized(false);
          }
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={launcherLabel}
        data-testid="calculator-launcher"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-evergreen-900/20 bg-white font-semibold text-evergreen-900 shadow-sm transition hover:bg-evergreen-50",
          variant === "floating" ? "px-4 py-3 text-sm shadow-lg" : "px-3 py-1.5 text-xs",
        )}
      >
        <span aria-hidden className="grid h-5 w-5 place-items-center rounded border border-evergreen-800/40 text-[10px]">▤</span>
        Calculator
        <span aria-hidden className="text-[10px] text-evergreen-700">{open ? "▾" : "▸"}</span>
      </button>

      {panelVisible ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Calculator"
          data-testid="calculator-panel"
          data-draggable={draggable ? "true" : "false"}
          className={cn(
            "fixed z-[70] flex flex-col overflow-hidden rounded-2xl border border-evergreen-900/20 bg-white shadow-2xl",
            !draggable && "bottom-2 left-2 right-2 top-auto max-h-[80vh] sm:bottom-auto sm:left-auto sm:right-6 sm:top-24 sm:max-h-[min(80vh,34rem)]",
          )}
          style={draggable ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
        >
          <div
            onPointerDown={(event) => {
              if ((event.target as HTMLElement).closest("button")) return;
              beginInteraction("drag", event);
            }}
            className={cn(
              "flex shrink-0 items-center justify-between gap-2 border-b border-evergreen-900/10 bg-cream/70 px-3 py-2",
              draggable ? "cursor-move touch-none select-none" : "cursor-default",
            )}
            data-testid="calculator-drag-handle"
            aria-label={draggable ? "Drag to move the calculator" : "Calculator panel"}
          >
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-evergreen-800">
              <span aria-hidden className="text-evergreen-600">⠿</span> Calculator
            </p>
            <div className="flex items-center gap-1" onPointerDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                onClick={minimize}
                aria-label="Minimize the calculator"
                className="rounded-md border border-evergreen-900/15 bg-white px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50"
              >
                —
              </button>
              <button
                type="button"
                onClick={close}
                aria-label="Close the calculator"
                className="rounded-md border border-evergreen-900/15 bg-white px-2 py-1 text-[11px] font-semibold text-evergreen-800 hover:bg-evergreen-50"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <Calculator
              chrome={false}
              className="h-full rounded-none border-0 shadow-none"
              initial={snapshot}
              onSnapshot={setSnapshot}
            />
          </div>

          {draggable ? (
            <>
              {(["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeEdge[]).map((edge) => (
                <span
                  key={edge}
                  role="presentation"
                  data-testid={`calculator-resize-${edge}`}
                  onPointerDown={(event) => beginInteraction("resize", event, edge)}
                  className={cn(
                    "absolute touch-none",
                    edge === "n" && "left-2 right-2 top-0 h-1.5 cursor-ns-resize",
                    edge === "s" && "bottom-0 left-2 right-2 h-1.5 cursor-s-resize",
                    edge === "e" && "bottom-2 right-0 top-2 w-1.5 cursor-ew-resize",
                    edge === "w" && "bottom-2 left-0 top-2 w-1.5 cursor-ew-resize",
                    edge === "ne" && "right-0 top-0 h-3 w-3 cursor-nesw-resize",
                    edge === "nw" && "left-0 top-0 h-3 w-3 cursor-nwse-resize",
                    edge === "se" && "bottom-0 right-0 h-3 w-3 cursor-nwse-resize",
                    edge === "sw" && "bottom-0 left-0 h-3 w-3 cursor-nesw-resize",
                  )}
                />
              ))}
              <span aria-hidden className="pointer-events-none absolute bottom-0.5 right-0.5 text-[10px] leading-none text-evergreen-700/60">◢</span>
            </>
          ) : null}
        </div>
      ) : null}
      {minimized && !open ? (
        <button
          type="button"
          onClick={() => { setOpen(true); setMinimized(false); }}
          className="ml-2 rounded-full border border-evergreen-900/20 bg-cream px-2 py-1 text-[10px] font-semibold text-evergreen-800 hover:bg-evergreen-50"
          aria-label="Restore the calculator"
        >
          Restore calculator
        </button>
      ) : null}
    </div>
  );
}
