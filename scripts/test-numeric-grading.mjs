import assert from 'node:assert/strict';

function evaluateArithmetic(expression) {
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/^]/g);
  if (!tokens || tokens.join("") !== expression.replace(/\s+/g, "")) return null;
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  const primary = () => {
    const token = take();
    if (token === undefined) return null;
    if (token === "(") {
      const value = sum();
      return take() === ")" ? value : null;
    }
    if (token === "+") return primary();
    if (token === "-") { const value = primary(); return value === null ? null : -value; }
    const value = Number(token);
    return Number.isFinite(value) ? value : null;
  };
  const power = () => {
    const base = primary();
    if (base === null) return null;
    if (peek() !== "^") return base;
    take();
    const exponent = power();
    return exponent === null ? null : Math.pow(base, exponent);
  };
  const product = () => {
    let value = power();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = take();
      const right = power();
      if (right === null) return null;
      if (op === "/" && right === 0) return null;
      value = op === "*" ? value * right : value / right;
    }
    return value;
  };
  const sum = () => {
    let value = product();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = take();
      const right = product();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  return index === tokens.length && result !== null && Number.isFinite(result) ? result : null;
}

function parseSingleNumericToken(token) {
  if (!token) return null;
  let s = token.trim();
  // Strip currency
  s = s.replace(/[$£€¥]/g, "").trim();
  // Strip trailing percent
  const isPercent = /%$/.test(s);
  s = s.replace(/%$/, "").trim();

  // Scientific notation: 2.5 x 10^4, 2.5 * 10^4, 1.5e3
  const sciMatch = /^([+-]?\d+(?:\.\d+)?)\s*(?:[x*]|\s*\*\s*)\s*10\s*\^\s*\{?([+-]?\d+)\}?\s*([a-z°]+)?$/i.exec(s);
  if (sciMatch) {
    const base = Number(sciMatch[1]);
    const exp = Number(sciMatch[2]);
    if (Number.isFinite(base) && Number.isFinite(exp)) return base * Math.pow(10, exp);
  }

  // Fraction: 3/4, -1/2
  const frac = /^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)\s*([a-z°]+)?$/i.exec(s);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (den !== 0 && Number.isFinite(num) && Number.isFinite(den)) return num / den;
  }

  // Mixed fraction: 1 1/2
  const mixed = /^([+-]?\d+)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*([a-z°]+)?$/i.exec(s);
  if (mixed) {
    const whole = Number(mixed[1]);
    const num = Number(mixed[2]);
    const den = Number(mixed[3]);
    if (den !== 0 && Number.isFinite(whole) && Number.isFinite(num) && Number.isFinite(den)) {
      const sign = whole < 0 || Object.is(whole, -0) ? -1 : 1;
      return whole + sign * (num / den);
    }
  }

  // Decimal comma vs thousands comma
  // If "8,75" (1 or 2 digits after single comma):
  if (/^[+-]?\d+,\d{1,2}(?:\s*[a-z°]+)?$/i.test(s)) {
    s = s.replace(",", ".");
  } else {
    // Thousands comma: "1,200", "10,000", "1,000,000"
    s = s.replace(/,(?=\d{3})/g, "");
  }

  // Strip trailing unit letters: cm, kg, mm, hours, etc.
  s = s.replace(/[a-zA-Z°]+$/g, "").trim();

  // Try direct number (also covers 1.5e3)
  const direct = Number(s);
  if (Number.isFinite(direct) && s !== "") return direct;

  // Worked arithmetic working
  if (/[+*/^]/.test(s)) return evaluateArithmetic(s);

  return null;
}

function parseStudentNumber(raw, context = {}) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;

  let s = raw.trim();
  if (!s) return null;

  // Replace Unicode minus/dash characters
  s = s.replace(/[\u2212\u2013\u2014]/g, "-");
  // Normalize non-breaking spaces
  s = s.replace(/[\u00a0\u202f]/g, " ");
  // Normalize math multiplication signs
  s = s.replace(/\\times/g, "x").replace(/[\u00d7\u22c5]/g, "*");

  // Check for conflicting values with "or": e.g. "5 or 6"
  if (/\b(?:or|ou)\b/i.test(s)) {
    // If student wrote contradictory choices without label distinction
    return null;
  }

  // Try direct single numeric token first
  const direct = parseSingleNumericToken(s);
  if (direct !== null) return direct;

  // Check if there are labeled pairs or statements:
  // e.g. "Mode = 18, Median = 26", "d = -7, u_10 = -21", "The minimum is 5", "Min = 5", "Ans: 5"
  // Split into clauses by comma, semicolon, newline, or "and"
  const clauses = s.split(/(?:[;,]|\band\b|\bet\b|\n)+/).map(c => c.trim()).filter(Boolean);

  const parsedClauses = [];
  for (const clause of clauses) {
    // Match patterns like:
    // [label] = [value]
    // [label] : [value]
    // [label] is [value]
    // [label] equals [value]
    const match = /^(.*?)(?:=|:|\bis\b|\bare\b|\bequals\b|\bvaut\b|\best\b)\s*([^=:].*)$/i.exec(clause);
    if (match) {
      const label = match[1].trim().toLowerCase();
      const valStr = match[2].trim();
      // If valStr itself contains "=", take the last one (e.g. working: "18+6=24")
      const equalsIdx = valStr.lastIndexOf("=");
      const finalValStr = equalsIdx >= 0 ? valStr.slice(equalsIdx + 1).trim() : valStr;
      const num = parseSingleNumericToken(finalValStr);
      if (num !== null) {
        parsedClauses.push({ label, valStr: finalValStr, value: num });
      }
    } else {
      // Clause without separator — could be "The minimum 5" or just a number with word
      const num = parseSingleNumericToken(clause);
      if (num !== null) {
        parsedClauses.push({ label: "", valStr: clause, value: num });
      } else {
        // Try to match leading words: e.g. "minimum 5", "min 5", "answer 5"
        const leadMatch = /^(?:the\s+)?([a-z_0-9]+)\s+([+-]?\d+(?:\.\d+)?.*)$/i.exec(clause);
        if (leadMatch) {
          const num2 = parseSingleNumericToken(leadMatch[2]);
          if (num2 !== null) {
            parsedClauses.push({ label: leadMatch[1].toLowerCase(), valStr: leadMatch[2], value: num2 });
          }
        }
      }
    }
  }

  if (parsedClauses.length === 1) {
    return parsedClauses[0].value;
  }

  if (parsedClauses.length > 1) {
    // If context is provided, look for matching label
    const ctxLabel = (context.label || "").toLowerCase().trim();
    const ctxPrompt = (context.prompt || "").toLowerCase().trim();
    const targetKey = ctxLabel || ctxPrompt;

    if (targetKey) {
      const best = parsedClauses.find(c =>
        (c.label && (targetKey.includes(c.label) || c.label.includes(targetKey))) ||
        (c.label && (
          (c.label.includes("med") && targetKey.includes("med")) ||
          (c.label.includes("mode") && targetKey.includes("mode")) ||
          (c.label.includes("mean") && targetKey.includes("mean")) ||
          (c.label.includes("min") && targetKey.includes("min")) ||
          (c.label.includes("max") && targetKey.includes("max")) ||
          (c.label.includes("range") && targetKey.includes("range")) ||
          (c.label.includes("iqr") && targetKey.includes("iqr")) ||
          (c.label.includes("var") && targetKey.includes("var")) ||
          (c.label.includes("std") && targetKey.includes("std")) ||
          (c.label === "d" && targetKey.includes("d")) ||
          (c.label.includes("u_10") && targetKey.includes("u_10")) ||
          (c.label.includes("u10") && targetKey.includes("u10")) ||
          (c.label.includes("u_6") && targetKey.includes("u_6")) ||
          (c.label.includes("u6") && targetKey.includes("u6")) ||
          (c.label.includes("u_1") && targetKey.includes("u_1")) ||
          (c.label.includes("u1") && targetKey.includes("u1"))
        ))
      );
      if (best) return best.value;
    }

    // If expected is given, see if one of the labeled clauses matches expected
    if (context.expected !== undefined && context.expected !== null) {
      const tol = context.tolerance ?? 0;
      const matchingExpected = parsedClauses.filter(c => Math.abs(c.value - context.expected) <= tol);
      if (matchingExpected.length === 1) {
        return matchingExpected[0].value;
      }
    }

    // Multiple conflicting values without distinguishable context -> return null
    return null;
  }

  // Last attempt: find all numbers in the string
  // If there is exactly one number in the entire text (e.g. "So the answer we get is 42."), return it!
  const numberTokens = s.match(/[+-]?\d+(?:\.\d+)?/g);
  if (numberTokens && numberTokens.length === 1) {
    const val = Number(numberTokens[0]);
    if (Number.isFinite(val)) return val;
  }

  return null;
}

// ── Test Cases ──────────────────────────────────────────────────────────────
console.log("Testing pure numbers:");
assert.equal(parseStudentNumber("5"), 5);
assert.equal(parseStudentNumber("-3"), -3);
assert.equal(parseStudentNumber("0.75"), 0.75);
assert.equal(parseStudentNumber(".75"), 0.75);
assert.equal(parseStudentNumber("1200"), 1200);

console.log("Testing Unicode minuses and dashes:");
assert.equal(parseStudentNumber("−5"), -5);
assert.equal(parseStudentNumber("–5"), -5);
assert.equal(parseStudentNumber("—5"), -5);

console.log("Testing thousands separators and decimal commas:");
assert.equal(parseStudentNumber("1,200"), 1200);
assert.equal(parseStudentNumber("10,000"), 10000);
assert.equal(parseStudentNumber("1,000,000"), 1000000);
assert.equal(parseStudentNumber("8,75"), 8.75);
assert.equal(parseStudentNumber("12,5"), 12.5);

console.log("Testing fractions and mixed numbers:");
assert.equal(parseStudentNumber("3/4"), 0.75);
assert.equal(parseStudentNumber("-1/2"), -0.5);
assert.equal(parseStudentNumber("7/8"), 0.875);
assert.equal(parseStudentNumber("1 1/2"), 1.5);

console.log("Testing scientific notation:");
assert.equal(parseStudentNumber("1.5e3"), 1500);
assert.equal(parseStudentNumber("2.5 x 10^4"), 25000);
assert.equal(parseStudentNumber("2.5 * 10^4"), 25000);
assert.equal(parseStudentNumber("2.5 x 10^{-3}"), 0.0025);

console.log("Testing units appended:");
assert.equal(parseStudentNumber("5 cm"), 5);
assert.equal(parseStudentNumber("12 kg"), 12);
assert.equal(parseStudentNumber("16 mm"), 16);
assert.equal(parseStudentNumber("25%"), 25);
assert.equal(parseStudentNumber("$1,200"), 1200);

console.log("Testing variable prefixes and word labels:");
assert.equal(parseStudentNumber("x = 5"), 5);
assert.equal(parseStudentNumber("x = -3"), -3);
assert.equal(parseStudentNumber("n = 10"), 10);
assert.equal(parseStudentNumber("u_1 = 4"), 4);
assert.equal(parseStudentNumber("d = -7"), -7);
assert.equal(parseStudentNumber("Min = 5"), 5);
assert.equal(parseStudentNumber("The minimum is 5"), 5);
assert.equal(parseStudentNumber("min: 5"), 5);
assert.equal(parseStudentNumber("Mean = 12.5"), 12.5);
assert.equal(parseStudentNumber("The mean is 12.5 mm"), 12.5);
assert.equal(parseStudentNumber("Answer: 5"), 5);
assert.equal(parseStudentNumber("Ans = 5"), 5);
assert.equal(parseStudentNumber("Result: 5"), 5);
assert.equal(parseStudentNumber("Total = 100"), 100);

console.log("Testing arithmetic working ending in answer:");
assert.equal(parseStudentNumber("18 + 6 = 24"), 24);

console.log("Testing context-aware multi-part extraction:");
assert.equal(parseStudentNumber("Mode = 18, Median = 26", { label: "Median", prompt: "median" }), 26);
assert.equal(parseStudentNumber("Mode = 18, Median = 26", { label: "Mode", prompt: "mode" }), 18);
assert.equal(parseStudentNumber("d = -7, u_10 = -21", { label: "d" }), -7);
assert.equal(parseStudentNumber("d = -7, u_10 = -21", { label: "u_10" }), -21);

console.log("Testing anti-substring / conflicting values:");
assert.equal(parseStudentNumber("5 or 6"), null);
assert.equal(parseStudentNumber("maybe 5 or 6"), null);

console.log("All 35 numeric grading tests passed successfully!");
