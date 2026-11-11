/**
 * Small, safe mathematical-expression compiler used by the graphing tool.
 *
 * Deliberately NOT `eval` / `new Function`: a teacher or a student can type a
 * function, and its text must never become executable code. The parser accepts
 * a conventional school syntax and returns a plain JavaScript closure.
 *
 * Supported:
 *   numbers          2, -3, 1.5, 2.5e-3
 *   the variable     x
 *   constants        pi, π, e, tau
 *   operators        + - * / ^ (and **), unary minus, implicit multiplication
 *                    (2x, 3(x+1), 2 sin(x), (x+1)(x-2))
 *   functions        sin cos tan asin acos atan sinh cosh tanh sqrt abs ln log
 *                    log2 exp floor ceil round sign
 *
 * Anything else is a compile error with a human-readable message, so the UI can
 * say “Unexpected ‘y’ — use x as the variable” instead of silently plotting
 * nothing.
 */

export interface CompiledExpression {
  ok: true;
  source: string;
  evaluate: (x: number) => number;
}
export interface ExpressionFailure {
  ok: false;
  error: string;
}
export type CompileResult = CompiledExpression | ExpressionFailure;

type Token =
  | { type: "number"; value: number; at: number }
  | { type: "name"; value: string; at: number }
  | { type: "op"; value: string; at: number }
  | { type: "("; at: number }
  | { type: ")" ; at: number }
  | { type: "," ; at: number }
  | { type: "end"; at: number };

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (n: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  abs: Math.abs,
  ln: Math.log,
  log: (n) => Math.log10(n),
  log10: (n) => Math.log10(n),
  log2: (n) => Math.log2(n),
  exp: Math.exp,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
};

export const GRAPH_EXPRESSION_HELP =
  "Use x as the variable. Examples: 2x + 3 · x^2 - 4x + 3 · 3(2)^x · sin(x) · sqrt(x + 1).";

function fail(error: string): ExpressionFailure {
  return { ok: false, error };
}

function tokenise(source: string): Token[] | ExpressionFailure {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (/[0-9.]/.test(ch)) {
      const start = i;
      let seenDot = false;
      while (i < source.length && /[0-9.]/.test(source[i])) {
        if (source[i] === ".") {
          if (seenDot) return fail(`Two decimal points in the number starting at character ${start + 1}.`);
          seenDot = true;
        }
        i += 1;
      }
      // Exponent notation: 1.2e-3 — only when followed by digits.
      if (i < source.length && /[eE]/.test(source[i])) {
        let j = i + 1;
        if (source[j] === "+" || source[j] === "-") j += 1;
        if (/[0-9]/.test(source[j] ?? "")) {
          i = j;
          while (i < source.length && /[0-9]/.test(source[i])) i += 1;
        }
      }
      const raw = source.slice(start, i);
      const value = Number(raw);
      if (!Number.isFinite(value)) return fail(`“${raw}” is not a valid number.`);
      tokens.push({ type: "number", value, at: start });
      continue;
    }
    if (/[a-zA-Zπ_]/.test(ch)) {
      const start = i;
      while (i < source.length && /[a-zA-Zπ_0-9]/.test(source[i])) i += 1;
      tokens.push({ type: "name", value: source.slice(start, i), at: start });
      continue;
    }
    if (ch === "(") { tokens.push({ type: "(", at: i }); i += 1; continue; }
    if (ch === ")") { tokens.push({ type: ")", at: i }); i += 1; continue; }
    if (ch === ",") { tokens.push({ type: ",", at: i }); i += 1; continue; }
    if (ch === "^" || ch === "*" || ch === "/" || ch === "+" || ch === "-") {
      if (ch === "*" && source[i + 1] === "*") {
        tokens.push({ type: "op", value: "^", at: i });
        i += 2;
        continue;
      }
      tokens.push({ type: "op", value: ch, at: i });
      i += 1;
      continue;
    }
    if (ch === "×" || ch === "·") { tokens.push({ type: "op", value: "*", at: i }); i += 1; continue; }
    if (ch === "÷") { tokens.push({ type: "op", value: "/", at: i }); i += 1; continue; }
    if (ch === "−") { tokens.push({ type: "op", value: "-", at: i }); i += 1; continue; }
    if (ch === "²") { tokens.push({ type: "op", value: "^", at: i }); tokens.push({ type: "number", value: 2, at: i }); i += 1; continue; }
    if (ch === "³") { tokens.push({ type: "op", value: "^", at: i }); tokens.push({ type: "number", value: 3, at: i }); i += 1; continue; }
    return fail(`“${ch}” is not allowed in a function. Use x, numbers, brackets and + − × ÷ ^.`);
  }
  tokens.push({ type: "end", at: source.length });
  return tokens;
}

type Node = (x: number) => number;

class Parser {
  private index = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token { return this.tokens[this.index]; }
  private next(): Token { return this.tokens[this.index++]; }

  parse(): Node | ExpressionFailure {
    if (this.peek().type === "end") return fail("The expression is empty.");
    const node = this.parseSum();
    if (node instanceof Error) return fail(node.message);
    if (typeof node === "object" && "ok" in node) return node;
    if (this.peek().type !== "end") {
      return fail(`Unexpected “${describe(this.peek())}”. Check the operators and brackets.`);
    }
    return node;
  }

  private parseSum(): Node | ExpressionFailure | Error {
    let left = this.parseProduct();
    if (isFailure(left)) return left;
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.value === "+" || token.value === "-")) {
        this.next();
        const right = this.parseProduct();
        if (isFailure(right)) return right;
        const a = left as Node;
        const b = right as Node;
        left = token.value === "+" ? (x) => a(x) + b(x) : (x) => a(x) - b(x);
      } else return left;
    }
  }

  private parseProduct(): Node | ExpressionFailure | Error {
    let left = this.parseUnary();
    if (isFailure(left)) return left;
    for (;;) {
      const token = this.peek();
      if (token.type === "op" && (token.value === "*" || token.value === "/")) {
        this.next();
        const right = this.parseUnary();
        if (isFailure(right)) return right;
        const a = left as Node;
        const b = right as Node;
        left = token.value === "*" ? (x) => a(x) * b(x) : (x) => a(x) / b(x);
        continue;
      }
      // Implicit multiplication: 2x, 3(x+1), 2 sin(x), (x+1)(x-2).
      if (startsPrimary(token)) {
        const right = this.parseUnary();
        if (isFailure(right)) return right;
        const a = left as Node;
        const b = right as Node;
        left = (x) => a(x) * b(x);
        continue;
      }
      return left;
    }
  }

  private parseUnary(): Node | ExpressionFailure | Error {
    const token = this.peek();
    if (token.type === "op" && (token.value === "-" || token.value === "+")) {
      this.next();
      const inner = this.parseUnary();
      if (isFailure(inner)) return inner;
      return token.value === "-" ? (x) => -inner(x) : inner;
    }
    return this.parsePower();
  }

  private parsePower(): Node | ExpressionFailure | Error {
    const base = this.parsePrimary();
    if (isFailure(base)) return base;
    const token = this.peek();
    if (token.type === "op" && token.value === "^") {
      this.next();
      const exponent = this.parseUnary(); // right-associative, allows 2^-1
      if (isFailure(exponent)) return exponent;
      return (x) => Math.pow(base(x), exponent(x));
    }
    return base;
  }

  private parsePrimary(): Node | ExpressionFailure | Error {
    const token = this.next();
    if (token.type === "number") {
      const value = token.value;
      return () => value;
    }
    if (token.type === "(") {
      const inner = this.parseSum();
      if (isFailure(inner)) return inner;
      if (this.peek().type !== ")") return new Error("A closing bracket ) is missing.");
      this.next();
      return inner;
    }
    if (token.type === "name") {
      const name = token.value;
      const lower = name.toLowerCase();
      if (lower === "x") return (x) => x;
      if (lower in CONSTANTS) {
        const value = CONSTANTS[lower];
        return () => value;
      }
      if (lower in FUNCTIONS) {
        if (this.peek().type !== "(") {
          // Allow sqrt 4 / sin x style without brackets.
          const arg = this.parseUnary();
          if (isFailure(arg)) return arg;
          const fn = FUNCTIONS[lower];
          return (x) => fn(arg(x));
        }
        this.next();
        const arg = this.parseSum();
        if (isFailure(arg)) return arg;
        if (this.peek().type !== ")") return new Error(`The bracket after ${lower}( is not closed.`);
        this.next();
        const fn = FUNCTIONS[lower];
        return (x) => fn(arg(x));
      }
      if (lower === "y") {
        return new Error("Use x as the variable — write y = 2x + 3 as 2x + 3.");
      }
      return new Error(`“${name}” is not a known function or constant. Try sin, cos, sqrt, ln, pi or x.`);
    }
    if (token.type === "op") {
      return new Error(`The operator “${token.value}” is missing a value before it.`);
    }
    return new Error("The function is incomplete. Add the missing number, x or bracket.");
  }
}

function isFailure(value: Node | ExpressionFailure | Error): value is ExpressionFailure | Error {
  // Parser failures travel as either Error instances (missing/incomplete
  // expressions) or `{ ok: false }` results (unexpected tokens).
  if (value instanceof Error) return true;
  return typeof value === "object" && value !== null && (value as ExpressionFailure).ok === false;
}

function startsPrimary(token: Token): boolean {
  if (token.type === "number" || token.type === "(") return true;
  if (token.type === "name") {
    const lower = token.value.toLowerCase();
    return lower === "x" || lower in CONSTANTS || lower in FUNCTIONS;
  }
  return false;
}

function describe(token: Token): string {
  switch (token.type) {
    case "number": return String(token.value);
    case "name": return token.value;
    case "op": return token.value;
    case "(": return "(";
    case ")": return ")";
    case ",": return ",";
    default: return "end of expression";
  }
}

const cache = new Map<string, CompileResult>();

/** Compile once; the closure can then be sampled thousands of times. */
export function compileExpression(raw: string): CompileResult {
  const source = (raw ?? "").trim();
  if (!source) return fail("Enter a function of x.");
  if (source.length > 240) return fail("The function is too long (240 characters maximum).");
  const hit = cache.get(source);
  if (hit) return hit;
  const tokens = tokenise(source);
  if (!Array.isArray(tokens)) {
    cache.set(source, tokens);
    return tokens;
  }
  const parsed = new Parser(tokens).parse();
  const result: CompileResult = parsed instanceof Error
    ? fail(parsed.message)
    : "ok" in parsed
      ? parsed
      : { ok: true, source, evaluate: parsed };
  if (cache.size > 300) cache.clear();
  cache.set(source, result);
  return result;
}

/**
 * Split a teacher-typed equation such as “y = 2x + 3” into its right-hand side.
 * Only the graph editor uses this; the parser itself never accepts `y =`.
 */
export function stripEquation(raw: string): string {
  return (raw ?? "").replace(/^\s*y\s*=\s*/i, "").replace(/^\s*f\s*\(\s*x\s*\)\s*=\s*/i, "").trim();
}

/** A finite sample is displayed; NaN/Infinity become gaps rather than lines. */
export function evaluateSafe(compiled: CompiledExpression, x: number): number | null {
  try {
    const y = compiled.evaluate(x);
    return Number.isFinite(y) ? y : null;
  } catch {
    return null;
  }
}
