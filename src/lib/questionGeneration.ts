/**
 * Original mathematics question generator for the class-based Question Bank.
 *
 * The generator is curriculum-aware: it selects parameterized problem
 * families appropriate to the class grade order and curriculum, computes
 * the correct answer, builds plausible distractors from common
 * misconceptions (off-by-one, wrong operation, place-value slips…),
 * writes a worked explanation, and progressively raises difficulty.
 *
 * Every generated question is newly authored by construction — templates
 * are EVALORA's own and parameters are randomized from a seed. Nothing is
 * copied from IB, College Board, Kangaroo or ministry papers; those
 * public frameworks only guide topic choice (see lib/curriculum.ts).
 *
 * Generated questions enter the review workflow as drafts/pending
 * review. They must be approved by a teacher/administrator before they
 * can be published or used in a finalized competition.
 */

import type { CurriculumKey } from "./curriculum";

export interface GeneratedOption {
  label: string;
  is_correct: boolean;
}

export interface GeneratedQuestion {
  type: "single_choice";
  prompt: string;
  options: GeneratedOption[];
  explanation: string;
  topic: string;
  subtopic: string;
  difficulty: "easy" | "medium" | "hard" | "competition";
  points: number;
  visual: boolean;
  family: string;
}

export interface GenerationRequest {
  gradeOrder: number; // 0 = KG … 13 = Grade 13
  curriculum: CurriculumKey;
  courseLabel?: string; // e.g. "MYP 3 Mathematics", "AP Calculus AB"
  count: number;
  seed: string;
  stage?: "standard" | "elimination" | "semi_final" | "grand_final";
}

export interface GenerationResult {
  questions: GeneratedQuestion[];
  requested: number;
  shortfall: number;
}

/* ─── Seeded RNG (mulberry32) ─────────────────────────────────────── */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rng = () => number;
const ri = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
const pick = <T,>(r: Rng, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];

export function normalizePrompt(p: string): string {
  return p.toLowerCase().replace(/\s+/g, " ").trim();
}

/* ─── Localised context pools ─────────────────────────────────────── */
const NAMES_EN = ["Ama", "Kofi", "Lina", "Omar", "Sofia", "Yann", "Maya", "Leo", "Nina", "Elif"];
const NAMES_FR = ["Aïcha", "Sèna", "Boris", "Merveille", "Codjo", "Afi", "Romaric", "Grâce", "Sèdami", "Orens"];
const OBJECTS_EN = ["marbles", "stickers", "mangoes", "pencils", "seashells", "books"];
const OBJECTS_FR = ["mangues", "ignames", "billes", "cahiers", "oranges", "perles"];
const GLYPHS = ["🍎", "⭐", "🍌", "🐠", "🍊", "🦋", "🍓", "🐢"];

interface Built {
  prompt: string;
  answer: string;
  distractors: string[];
  explanation: string;
  visual?: boolean;
}
interface Family {
  key: string;
  topic: string;
  subtopic: string;
  min: number;
  max: number;
  curricula?: CurriculumKey[]; // undefined = all
  make: (g: number, r: Rng, fr: boolean, course: string) => Built | null;
}

const num = (n: number) => String(Math.round(n * 100) / 100);
/** Distractors from classic slips around a numeric answer. */
function numDistractors(ans: number, r: Rng, spread = 2): string[] {
  const out = new Set<string>();
  const cands = [ans + 1, ans - 1, ans + 2, ans - 2, ans + 10, ans - 10, ans * 2, ans + spread, ans - spread, ans + 5, ans - 5];
  for (const c of cands) {
    if (out.size >= 3) break;
    if (c !== ans && Number.isFinite(c)) out.add(num(c));
  }
  let k = 3;
  while (out.size < 3) out.add(num(ans + k++ * (r() > 0.5 ? 1 : -1) * 3));
  return [...out];
}

const F: Family[] = [
  /* ── Early years: visual counting & comparison (KG–CP) ── */
  {
    key: "count_glyphs", topic: "Number", subtopic: "Counting objects", min: 0, max: 2,
    make: (g, r, fr) => {
      const glyph = pick(r, GLYPHS);
      const n = ri(r, 3, g === 0 ? 9 : 14);
      const shown = Array.from({ length: n }, () => glyph).join(" ");
      return {
        prompt: fr ? `Compte les dessins :\n${shown}\nCombien y en a-t-il ?` : `Count the pictures:\n${shown}\nHow many are there?`,
        answer: num(n), distractors: numDistractors(n, r, 1),
        explanation: fr ? `On compte un par un : il y en a ${n}.` : `Count one by one: there are ${n}.`,
        visual: true,
      };
    },
  },
  {
    key: "compare_groups", topic: "Number", subtopic: "Comparing quantities", min: 0, max: 3,
    make: (g, r, fr) => {
      const glyph = pick(r, GLYPHS);
      const a = ri(r, 2, 9);
      let b = ri(r, 2, 9);
      if (a === b) b += 1;
      const more = a > b ? (fr ? "Groupe A" : "Group A") : (fr ? "Groupe B" : "Group B");
      const ga = Array.from({ length: a }, () => glyph).join(" ");
      const gb = Array.from({ length: b }, () => glyph).join(" ");
      return {
        prompt: fr
          ? `Groupe A : ${ga}\nGroupe B : ${gb}\nQuel groupe contient le plus de dessins ?`
          : `Group A: ${ga}\nGroup B: ${gb}\nWhich group has more pictures?`,
        answer: more,
        distractors: [more === (fr ? "Groupe A" : "Group A") ? (fr ? "Groupe B" : "Group B") : (fr ? "Groupe A" : "Group A"), fr ? "Ils sont égaux" : "They are equal", fr ? "On ne peut pas savoir" : "We cannot tell"],
        explanation: fr ? `Groupe A : ${a}, Groupe B : ${b}. Le plus grand est ${more}.` : `Group A has ${a}, Group B has ${b}. The larger is ${more}.`,
        visual: true,
      };
    },
  },
  {
    key: "visual_pattern", topic: "Patterns", subtopic: "Visual patterns", min: 0, max: 4,
    make: (g, r, fr) => {
      const pair = pick(r, [["▲", "●"], ["★", "■"], ["●", "◆"], ["▲", "■"]] as const);
      const seq = Array.from({ length: 6 }, (_, i) => pair[i % 2]).join(" ");
      const next = pair[0];
      return {
        prompt: fr ? `Regarde la suite : ${seq} …\nQuel dessin vient ensuite ?` : `Look at the pattern: ${seq} …\nWhich picture comes next?`,
        answer: next, distractors: [pair[1], "✿", "♥"],
        explanation: fr ? `La suite alterne ${pair[0]} et ${pair[1]}. Après ${pair[1]} vient ${pair[0]}.` : `The pattern alternates ${pair[0]} and ${pair[1]}. After ${pair[1]} comes ${pair[0]}.`,
        visual: true,
      };
    },
  },
  {
    key: "odd_one_out", topic: "Geometry", subtopic: "Shapes", min: 0, max: 3,
    make: (g, r, fr) => {
      const sets = [["●", "●", "●", "▲"], ["■", "■", "●", "■"], ["▲", "▲", "▲", "■"], ["◆", "●", "◆", "◆"]];
      const row = pick(r, sets);
      const counts = new Map<string, number>();
      row.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
      const odd = [...counts.entries()].find(([, c]) => c === 1)![0];
      const pos = row.indexOf(odd) + 1;
      return {
        prompt: fr ? `Quelle forme est différente des autres ?\n${row.join("   ")}\n(1 = première forme, 4 = dernière forme)` : `Which shape is different from the others?\n${row.join("   ")}\n(1 = first shape, 4 = last shape)`,
        answer: `${odd} (position ${pos})`,
        distractors: row.map((s, i) => `${s} (position ${i + 1})`).filter((_, i) => i !== pos - 1),
        explanation: fr ? `Trois formes sont identiques ; seule ${odd} est différente.` : `Three shapes are the same; only ${odd} is different.`,
        visual: true,
      };
    },
  },
  /* ── Primary arithmetic & reasoning (CI–CM1) ── */
  {
    key: "missing_number", topic: "Number", subtopic: "Number sequences", min: 1, max: 6,
    make: (g, r, fr) => {
      const step = ri(r, 2, g <= 3 ? 5 : 9);
      const start = ri(r, 1, 12);
      const terms = [0, 1, 2, 3, 4].map((i) => start + i * step);
      const missingIdx = ri(r, 1, 3);
      const ans = terms[missingIdx];
      const shown = terms.map((t, i) => (i === missingIdx ? "?" : String(t))).join(", ");
      return {
        prompt: fr ? `Trouve le nombre manquant : ${shown}` : `Find the missing number: ${shown}`,
        answer: num(ans), distractors: numDistractors(ans, r, step),
        explanation: fr ? `Chaque nombre augmente de ${step}. Le nombre manquant est ${ans}.` : `Each number increases by ${step}. The missing number is ${ans}.`,
      };
    },
  },
  {
    key: "two_step_word", topic: "Number", subtopic: "Two-step word problems", min: 3, max: 8,
    make: (g, r, fr) => {
      const name = fr ? pick(r, NAMES_FR) : pick(r, NAMES_EN);
      const obj = fr ? pick(r, OBJECTS_FR) : pick(r, OBJECTS_EN);
      const a = ri(r, 6, 24), b = ri(r, 3, 15), c = ri(r, 2, 9);
      const ans = a + b - c;
      if (ans <= 0) return null;
      return {
        prompt: fr
          ? `${name} a ${a} ${obj}. Au marché, ${name} en achète ${b} de plus, puis en donne ${c} à un ami. Combien de ${obj} reste-t-il à ${name} ?`
          : `${name} has ${a} ${obj}. ${name} buys ${b} more, then gives ${c} to a friend. How many ${obj} does ${name} have now?`,
        answer: num(ans),
        distractors: [num(a + b), num(a - c), num(ans + 2)].filter((d, i, arr) => d !== num(ans) && arr.indexOf(d) === i).concat(numDistractors(ans, r)).slice(0, 3),
        explanation: fr ? `${a} + ${b} = ${a + b}, puis ${a + b} − ${c} = ${ans}.` : `${a} + ${b} = ${a + b}, then ${a + b} − ${c} = ${ans}.`,
      };
    },
  },
  {
    key: "fraction_of_quantity", topic: "Fractions", subtopic: "Fraction of a quantity", min: 4, max: 9,
    make: (g, r, fr) => {
      const den = pick(r, [2, 3, 4, 5, 6]);
      const numr = ri(r, 1, den - 1);
      const whole = den * ri(r, 3, 9);
      const ans = (whole / den) * numr;
      return {
        prompt: fr ? `Calcule ${numr}/${den} de ${whole}.` : `Calculate ${numr}/${den} of ${whole}.`,
        answer: num(ans),
        distractors: [num(whole / den), num(ans + whole / den), num(whole - ans)].filter((d) => d !== num(ans)).concat(numDistractors(ans, r)).slice(0, 3),
        explanation: fr ? `${whole} ÷ ${den} = ${whole / den}, puis ${whole / den} × ${numr} = ${ans}.` : `${whole} ÷ ${den} = ${whole / den}, then ${whole / den} × ${numr} = ${ans}.`,
      };
    },
  },
  {
    key: "rect_area_perimeter", topic: "Geometry", subtopic: "Area and perimeter", min: 4, max: 9,
    make: (g, r, fr) => {
      const l = ri(r, 4, 14), w = ri(r, 3, 10);
      if (l === w) return null;
      const askArea = r() > 0.5;
      const area = l * w, per = 2 * (l + w);
      const ans = askArea ? area : per;
      return {
        prompt: fr
          ? `Un rectangle mesure ${l} cm de longueur et ${w} cm de largeur. Quel est ${askArea ? "son aire (en cm²)" : "son périmètre (en cm)"} ?`
          : `A rectangle is ${l} cm long and ${w} cm wide. What is its ${askArea ? "area (in cm²)" : "perimeter (in cm)"}?`,
        answer: num(ans),
        distractors: [num(askArea ? per : area), num(l + w), num(ans + 2)].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: askArea
          ? (fr ? `Aire = ${l} × ${w} = ${area} cm².` : `Area = ${l} × ${w} = ${area} cm².`)
          : (fr ? `Périmètre = 2 × (${l} + ${w}) = ${per} cm.` : `Perimeter = 2 × (${l} + ${w}) = ${per} cm.`),
      };
    },
  },
  {
    key: "digit_reasoning", topic: "Number", subtopic: "Place value reasoning", min: 4, max: 8,
    make: (g, r, fr) => {
      const tens = ri(r, 2, 9), units = ri(r, 1, 9);
      const n = tens * 10 + units;
      const sum = tens + units;
      return {
        prompt: fr
          ? `Je suis un nombre à deux chiffres. Mon chiffre des dizaines est ${tens} et la somme de mes chiffres vaut ${sum}. Qui suis-je ?`
          : `I am a two-digit number. My tens digit is ${tens} and the sum of my digits is ${sum}. What number am I?`,
        answer: num(n),
        distractors: [num(units * 10 + tens), num(n + 1), num(n - 1)].filter((d) => d !== num(n)).slice(0, 3),
        explanation: fr ? `Le chiffre des unités vaut ${sum} − ${tens} = ${units}. Le nombre est ${n}.` : `The units digit is ${sum} − ${tens} = ${units}. The number is ${n}.`,
      };
    },
  },
  {
    key: "money_change", topic: "Number", subtopic: "Money", min: 3, max: 7,
    make: (g, r, fr) => {
      const price = ri(r, 3, 17) * 25;
      const paid = pick(r, [500, 1000]);
      const ans = paid - price;
      return {
        prompt: fr
          ? `Au marché de Dantokpa, un article coûte ${price} FCFA. Tu paies avec un billet de ${paid} FCFA. Combien de monnaie reçois-tu ?`
          : `An item costs ${price} FCFA. You pay with a ${paid} FCFA note. How much change do you receive?`,
        answer: num(ans),
        distractors: [num(ans + 50), num(ans - 50), num(price)].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: fr ? `${paid} − ${price} = ${ans} FCFA.` : `${paid} − ${price} = ${ans} FCFA.`,
      };
    },
  },
  /* ── Lower secondary / MYP 1–3 ── */
  {
    key: "ratio_share", topic: "Ratio", subtopic: "Sharing in a ratio", min: 6, max: 10,
    make: (g, r, fr) => {
      const a = ri(r, 2, 5), b = ri(r, 2, 5);
      if (a === b) return null;
      const part = ri(r, 4, 12);
      const total = (a + b) * part;
      const first = a * part;
      const names = fr ? ["Sèna", "Boris"] : ["Lina", "Omar"];
      return {
        prompt: fr
          ? `${names[0]} et ${names[1]} partagent ${total} FCFA dans le rapport ${a}:${b}. Quelle somme reçoit ${names[0]} ?`
          : `${names[0]} and ${names[1]} share ${total} FCFA in the ratio ${a}:${b}. How much does ${names[0]} receive?`,
        answer: num(first),
        distractors: [num(b * part), num(total / 2), num(first + part)].filter((d) => d !== num(first)).slice(0, 3),
        explanation: fr ? `Il y a ${a + b} parts de ${total} ÷ ${a + b} = ${part}. ${names[0]} reçoit ${a} × ${part} = ${first}.` : `There are ${a + b} parts of ${total} ÷ ${a + b} = ${part}. ${names[0]} receives ${a} × ${part} = ${first}.`,
      };
    },
  },
  {
    key: "nth_term", topic: "Algebra", subtopic: "Linear sequences", min: 6, max: 11,
    make: (g, r, fr) => {
      const d = ri(r, 2, 7), a1 = ri(r, 1, 9), n = ri(r, 8, 15);
      const ans = a1 + (n - 1) * d;
      const seq = [0, 1, 2].map((i) => a1 + i * d).join(", ");
      return {
        prompt: fr ? `La suite ${seq}, … augmente toujours de la même quantité. Quel est son ${n}ᵉ terme ?` : `The sequence ${seq}, … increases by the same amount each time. What is its ${n}th term?`,
        answer: num(ans),
        distractors: [num(a1 + n * d), num(ans - d), num(ans + d)].filter((x) => x !== num(ans)).slice(0, 3),
        explanation: fr ? `La raison est ${d}. Terme ${n} = ${a1} + ${n - 1} × ${d} = ${ans}.` : `The common difference is ${d}. Term ${n} = ${a1} + ${n - 1} × ${d} = ${ans}.`,
      };
    },
  },
  {
    key: "probability_single", topic: "Probability", subtopic: "Single-event probability", min: 6, max: 12,
    make: (g, r, fr) => {
      const red = ri(r, 2, 6), blue = ri(r, 3, 7);
      const total = red + blue;
      const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
      const d = gcd(red, total);
      const ans = `${red / d}/${total / d}`;
      return {
        prompt: fr
          ? `Un sac contient ${red} billes rouges et ${blue} billes bleues. On tire une bille au hasard. Quelle est la probabilité qu'elle soit rouge ? (fraction simplifiée)`
          : `A bag contains ${red} red marbles and ${blue} blue marbles. One marble is taken at random. What is the probability it is red? (simplified fraction)`,
        answer: ans,
        distractors: [`${blue}/${total}`, `${red}/${blue}`, `${red + 1}/${total}`].filter((x) => x !== ans).slice(0, 3),
        explanation: fr ? `Probabilité = ${red}/${total} = ${ans} après simplification.` : `Probability = ${red}/${total} = ${ans} after simplifying.`,
      };
    },
  },
  {
    key: "triangle_angle", topic: "Geometry", subtopic: "Angles in a triangle", min: 6, max: 10,
    make: (g, r, fr) => {
      const a = ri(r, 35, 80), b = ri(r, 30, 75);
      const c = 180 - a - b;
      if (c <= 10) return null;
      return {
        prompt: fr ? `Dans un triangle, deux angles mesurent ${a}° et ${b}°. Quelle est la mesure du troisième angle ?` : `Two angles of a triangle measure ${a}° and ${b}°. What is the third angle?`,
        answer: `${c}°`,
        distractors: [`${180 - a}°`, `${a + b}°`, `${c + 10}°`].filter((x) => x !== `${c}°`).slice(0, 3),
        explanation: fr ? `La somme des angles vaut 180° : 180 − ${a} − ${b} = ${c}°.` : `Angles sum to 180°: 180 − ${a} − ${b} = ${c}°.`,
      };
    },
  },
  /* ── Upper secondary ── */
  {
    key: "linear_equation", topic: "Algebra", subtopic: "Linear equations", min: 7, max: 13,
    make: (g, r, fr) => {
      const x = ri(r, 2, 12), a = ri(r, 2, 7), b = ri(r, 1, 15);
      const rhs = a * x + b;
      return {
        prompt: fr ? `Résous l'équation : ${a}x + ${b} = ${rhs}.` : `Solve the equation: ${a}x + ${b} = ${rhs}.`,
        answer: num(x),
        distractors: [num(x + 1), num((rhs - b) / a + 2), num(rhs - b)].filter((d) => d !== num(x)).slice(0, 3),
        explanation: fr ? `${a}x = ${rhs} − ${b} = ${rhs - b}, donc x = ${rhs - b} ÷ ${a} = ${x}.` : `${a}x = ${rhs} − ${b} = ${rhs - b}, so x = ${rhs - b} ÷ ${a} = ${x}.`,
      };
    },
  },
  {
    key: "pythagoras", topic: "Geometry", subtopic: "Pythagoras theorem", min: 8, max: 13,
    make: (g, r, fr) => {
      const triples = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17]];
      const [a, b, c] = pick(r, triples);
      return {
        prompt: fr ? `Un triangle rectangle a pour côtés de l'angle droit ${a} cm et ${b} cm. Quelle est la longueur de l'hypoténuse ?` : `A right-angled triangle has legs ${a} cm and ${b} cm. How long is the hypotenuse?`,
        answer: `${c} cm`,
        distractors: [`${a + b} cm`, `${c - 1} cm`, `${c + 2} cm`].filter((x) => x !== `${c} cm`).slice(0, 3),
        explanation: fr ? `Hypoténuse = √(${a}² + ${b}²) = √(${a * a + b * b}) = ${c} cm.` : `Hypotenuse = √(${a}² + ${b}²) = √(${a * a + b * b}) = ${c} cm.`,
      };
    },
  },
  {
    key: "quadratic_root", topic: "Algebra", subtopic: "Quadratic equations", min: 9, max: 13,
    make: (g, r, fr) => {
      const p = ri(r, 2, 7), q = ri(r, 2, 7);
      if (p === q) return null;
      const s = p + q, prod = p * q;
      return {
        prompt: fr ? `Quelles sont les solutions de x² − ${s}x + ${prod} = 0 ?` : `What are the solutions of x² − ${s}x + ${prod} = 0?`,
        answer: `x = ${Math.min(p, q)} ${fr ? "ou" : "or"} x = ${Math.max(p, q)}`,
        distractors: [
          `x = ${-p} ${fr ? "ou" : "or"} x = ${-q}`,
          `x = ${p} ${fr ? "ou" : "or"} x = ${q + 1}`,
          `x = ${s} ${fr ? "ou" : "or"} x = ${prod}`,
        ],
        explanation: fr ? `On factorise : (x − ${p})(x − ${q}) = 0, donc x = ${p} ou x = ${q}.` : `Factorise: (x − ${p})(x − ${q}) = 0, so x = ${p} or x = ${q}.`,
      };
    },
  },
  {
    key: "mean_median", topic: "Statistics", subtopic: "Mean and median", min: 7, max: 13,
    make: (g, r, fr) => {
      const vals = Array.from({ length: 5 }, () => ri(r, 4, 20)).sort((x, y) => x - y);
      const mean = vals.reduce((s, v) => s + v, 0) / 5;
      const askMean = r() > 0.5;
      const ans = askMean ? mean : vals[2];
      if (askMean && !Number.isInteger(mean)) return null;
      return {
        prompt: fr ? `Voici cinq résultats : ${vals.join(", ")}. Calcule ${askMean ? "la moyenne" : "la médiane"}.` : `Here are five scores: ${vals.join(", ")}. Calculate the ${askMean ? "mean" : "median"}.`,
        answer: num(ans),
        distractors: numDistractors(ans, r),
        explanation: askMean
          ? (fr ? `Moyenne = (${vals.join(" + ")}) ÷ 5 = ${ans}.` : `Mean = (${vals.join(" + ")}) ÷ 5 = ${ans}.`)
          : (fr ? `La médiane est la valeur centrale : ${ans}.` : `The median is the middle value: ${ans}.`),
      };
    },
  },
  /* ── Beninese advanced (lycée) ── */
  {
    key: "suite_arithmetique", topic: "Suites", subtopic: "Suite arithmétique", min: 11, max: 13, curricula: ["beninese"],
    make: (g, r) => {
      const u0 = ri(r, 2, 10), raison = ri(r, 2, 6), n = ri(r, 6, 12);
      const ans = u0 + n * raison;
      return {
        prompt: `(uₙ) est une suite arithmétique de premier terme u₀ = ${u0} et de raison ${raison}. Que vaut u${n} ?`,
        answer: num(ans),
        distractors: [num(u0 + (n - 1) * raison), num(u0 * raison + n), num(ans + raison)].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: `u${n} = u₀ + ${n} × ${raison} = ${u0} + ${n * raison} = ${ans}.`,
      };
    },
  },
  {
    key: "derivee_polynome", topic: "Analyse", subtopic: "Dérivation", min: 11, max: 13, curricula: ["beninese"],
    make: (g, r) => {
      const a = ri(r, 2, 5), b = ri(r, 2, 9), x0 = ri(r, 1, 4);
      const ans = 2 * a * x0 + b;
      return {
        prompt: `Soit f(x) = ${a}x² + ${b}x. Que vaut f′(${x0}) ?`,
        answer: num(ans),
        distractors: [num(a * x0 * x0 + b * x0), num(2 * a * x0), num(ans + b)].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: `f′(x) = ${2 * a}x + ${b}, donc f′(${x0}) = ${2 * a} × ${x0} + ${b} = ${ans}.`,
      };
    },
  },
  /* ── AP Statistics ── */
  {
    key: "ap_stats_zscore", topic: "Statistics", subtopic: "Z-scores (AP Statistics)", min: 11, max: 13, curricula: ["ap"],
    make: (g, r, fr, course) => {
      if (!/stat/i.test(course)) return null;
      const mean = ri(r, 60, 80), sd = pick(r, [5, 8, 10]);
      const z = pick(r, [1, 1.5, 2]);
      const x = mean + z * sd;
      return {
        prompt: `Scores on a test are approximately normal with mean ${mean} and standard deviation ${sd}. A student scores ${x}. What is the student's z-score?`,
        answer: num(z),
        distractors: [num(z + 0.5), num((x - mean) / (sd * 2)), num(x - mean)].filter((d) => d !== num(z)).slice(0, 3),
        explanation: `z = (${x} − ${mean}) / ${sd} = ${num(z)}.`,
      };
    },
  },
  {
    key: "ap_calc_derivative", topic: "Calculus", subtopic: "Derivatives (AP Calculus)", min: 11, max: 13, curricula: ["ap"],
    make: (g, r, fr, course) => {
      if (/stat/i.test(course)) return null;
      const a = ri(r, 2, 5), n = pick(r, [3, 4]), x0 = ri(r, 1, 3);
      const ans = a * n * Math.pow(x0, n - 1);
      return {
        prompt: `If f(x) = ${a}x^${n}, what is f′(${x0})?`,
        answer: num(ans),
        distractors: [num(a * Math.pow(x0, n)), num(a * n * Math.pow(x0, n)), num(ans / 2)].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: `f′(x) = ${a * n}x^${n - 1}, so f′(${x0}) = ${a * n} × ${x0}^${n - 1} = ${ans}.`,
      };
    },
  },
  {
    key: "ap_calc_limit", topic: "Calculus", subtopic: "Limits (AP Calculus)", min: 11, max: 13, curricula: ["ap"],
    make: (g, r, fr, course) => {
      if (/stat/i.test(course)) return null;
      const a = ri(r, 2, 6);
      const ans = 2 * a;
      return {
        prompt: `Evaluate lim (x→${a}) of (x² − ${a * a}) / (x − ${a}).`,
        answer: num(ans),
        distractors: [num(a), num(a * a), "The limit does not exist"].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: `(x² − ${a * a}) / (x − ${a}) = x + ${a} for x ≠ ${a}, so the limit is ${a} + ${a} = ${ans}.`,
      };
    },
  },
  {
    key: "ap_bc_series", topic: "Calculus", subtopic: "Geometric series (AP Calculus BC)", min: 13, max: 13, curricula: ["ap"],
    make: (g, r, fr, course) => {
      if (!/BC/i.test(course)) return null;
      const a = ri(r, 2, 9), denom = pick(r, [2, 3, 4]);
      const ans = (a * denom) / (denom - 1);
      if (!Number.isInteger(ans)) return null;
      return {
        prompt: `What is the sum of the infinite geometric series ${a} + ${num(a / denom)} + ${num(a / (denom * denom))} + … ?`,
        answer: num(ans),
        distractors: [num(a * denom), num(ans + a), "The series diverges"].filter((d) => d !== num(ans)).slice(0, 3),
        explanation: `First term ${a}, ratio 1/${denom}: sum = ${a} / (1 − 1/${denom}) = ${ans}.`,
      };
    },
  },
];

function difficultyFor(index: number, count: number, stage: GenerationRequest["stage"]): GeneratedQuestion["difficulty"] {
  const ratio = count <= 1 ? 0 : index / (count - 1);
  const boost = stage === "grand_final" ? 2 : stage === "semi_final" ? 1 : 0;
  const tier = Math.min(3, Math.floor(ratio * 3) + boost - (stage === "elimination" && ratio < 0.25 ? 1 : 0));
  return (["easy", "medium", "hard", "competition"] as const)[Math.max(0, tier)];
}

export function generateQuestions(req: GenerationRequest): GenerationResult {
  const count = Math.max(1, Math.min(40, Math.floor(req.count) || 20));
  const fr = req.curriculum === "beninese";
  const course = req.courseLabel ?? "";
  const eligible = F.filter(
    (f) => req.gradeOrder >= f.min && req.gradeOrder <= f.max && (!f.curricula || f.curricula.includes(req.curriculum)),
  );
  const seen = new Set<string>();
  const out: GeneratedQuestion[] = [];
  let attempt = 0;
  while (out.length < count && attempt < count * 60) {
    const r = rng(hashSeed(`${req.seed}|${attempt}|${req.gradeOrder}|${req.curriculum}`));
    attempt++;
    if (!eligible.length) break;
    // Rotate families for topic variety, with seeded jitter.
    const fam = eligible[(attempt + Math.floor(r() * 3)) % eligible.length];
    const built = fam.make(req.gradeOrder, r, fr, course);
    if (!built) continue;
    const key = normalizePrompt(built.prompt);
    if (seen.has(key)) continue;
    seen.add(key);
    const optionsRaw = [built.answer, ...built.distractors].filter((v, i, a) => a.indexOf(v) === i).slice(0, 4);
    if (optionsRaw.length < 3) continue;
    // Seeded shuffle of options.
    const opts = optionsRaw.map((label) => ({ label, is_correct: label === built.answer, k: r() })).sort((x, y) => x.k - y.k);
    const difficulty = difficultyFor(out.length, count, req.stage);
    out.push({
      type: "single_choice",
      prompt: built.prompt,
      options: opts.map(({ label, is_correct }) => ({ label, is_correct })),
      explanation: built.explanation,
      topic: fam.topic,
      subtopic: fam.subtopic,
      difficulty,
      points: difficulty === "competition" ? 3 : difficulty === "hard" ? 2 : 1,
      visual: Boolean(built.visual),
      family: fam.key,
    });
  }
  return { questions: out, requested: count, shortfall: Math.max(0, count - out.length) };
}
