/**
 * Brand palette derivation — pure, deterministic, no I/O.
 *
 * The application's whole design system is expressed as Tailwind v4 CSS
 * custom properties declared once in src/app/globals.css (`@theme`). That is
 * what makes runtime re-theming possible without touching a single component:
 * the root layout emits overrides for the same variable names and every
 * `bg-evergreen-700`, `text-gold-400` or `font-display` class in the codebase
 * follows.
 *
 * A single brand colour therefore has to expand into a full ramp. The ramps
 * below are calibrated against the shipped EVALORA identity, so leaving the
 * defaults configured reproduces the existing palette pixel for pixel:
 *
 *   primary #0a5c36 → evergreen-700   (ramp anchor)
 *   accent  #c9a227 → gold-500        (ramp anchor)
 *
 * Pure module: compiled standalone by the test harness.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** Parse #rgb / #rrggbb. Returns null for anything else — never guesses. */
export function parseHex(hex: string): Rgb | null {
  let h = String(hex ?? "").trim().replace(/^#/, "");
  if (!/^[0-9a-f]{3,8}$/i.test(h)) return null;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length < 6) return null;
  h = h.slice(0, 6);
  const n = parseInt(h, 16);
  if (!Number.isFinite(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
    else if (max === gn) h = ((bn - rn) / d + 2) / 6;
    else h = ((rn - gn) / d + 4) / 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360 / 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  if (sn === 0) {
    const v = Math.round(ln * 255);
    return { r: v, g: v, b: v };
  }
  const q = ln < 0.5 ? ln * (1 + sn) : ln + sn - ln * sn;
  const p = 2 * ln - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(channel(hn + 1 / 3) * 255),
    g: Math.round(channel(hn) * 255),
    b: Math.round(channel(hn - 1 / 3) * 255),
  };
}

/**
 * Absolute lightness ramps, calibrated on the shipped identity.
 * Index order matches the Tailwind shade names below.
 */
export const EVERGREEN_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const EVERGREEN_LIGHTNESS = [96, 88.6, 77.3, 61.6, 45.3, 33.3, 24.3, 20, 15.5, 11.6, 8.2];

export const GOLD_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800] as const;
const GOLD_LIGHTNESS = [95, 87.5, 74, 62.5, 57.8, 47, 38.6, 30.4, 24.7];

/**
 * Expand one brand colour into a full shade ramp. Saturation is preserved but
 * gently reduced at the extremes, which is what keeps very light and very dark
 * shades from turning neon or muddy.
 */
export function buildRamp(baseHex: string, shades: readonly number[], lightness: readonly number[]): Record<number, string> {
  const rgb = parseHex(baseHex);
  const fallback = rgb ? baseHex : "#0a5c36";
  const hsl = rgbToHsl(parseHex(fallback)!);
  const out: Record<number, string> = {};
  shades.forEach((shade, i) => {
    const l = lightness[i];
    // Desaturate toward the ends so 50 stays a tint and 950 stays readable.
    const distanceFromMid = Math.abs(l - 50) / 50;
    const s = Math.max(6, hsl.s * (1 - 0.35 * distanceFromMid));
    out[shade] = toHex(hslToRgb({ h: hsl.h, s, l }));
  });
  return out;
}

export function evergreenRamp(primaryHex: string): Record<number, string> {
  return buildRamp(primaryHex, EVERGREEN_SHADES, EVERGREEN_LIGHTNESS);
}

export function goldRamp(accentHex: string): Record<number, string> {
  return buildRamp(accentHex, GOLD_SHADES, GOLD_LIGHTNESS);
}

/** Linear blend of two colours; `amount` 0 = a, 1 = b. */
export function mix(a: string, b: string, amount: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const t = Math.max(0, Math.min(1, amount));
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
  });
}

/** Font stacks for the selectable families. Only bundled/system fonts. */
export const FONT_STACKS: Record<string, string> = {
  fraunces: '"Fraunces Variable", Georgia, serif',
  public_sans: '"Public Sans Variable", ui-sans-serif, system-ui, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  system_sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export function fontStack(choice: unknown): string {
  const key = String(choice ?? "").trim();
  return FONT_STACKS[key] ?? FONT_STACKS.public_sans;
}

/** The effective brand values the interface is rendered with. */
export interface EffectiveBrand {
  name: string;
  tagline: string;
  description: string;
  supportEmail: string;
  logo: {
    icon: string;
    horizontalLight: string;
    horizontalDark: string;
    stacked: string;
    favicon: string;
  };
  colors: {
    primary: string;
    primaryDeep: string;
    accent: string;
    cream: string;
    ink: string;
    inkSoft: string;
    paper: string;
  };
  fonts: { display: string; sans: string };
  theme: string;
  /** True when any value came from configuration rather than the code default. */
  customized: boolean;
}

/**
 * Emit the CSS custom-property overrides that re-theme the whole application.
 * Variable names match the `@theme` block in src/app/globals.css exactly, so
 * every existing utility class picks the new values up with no component
 * changes. Returns "" for an uncustomized brand — the stylesheet's own values
 * then apply untouched.
 */
export function brandCssVariables(brand: EffectiveBrand): string {
  if (!brand.customized) return "";
  const evergreen = evergreenRamp(brand.colors.primary);
  const gold = goldRamp(brand.colors.accent);
  const lines: string[] = [":root{"];
  for (const shade of EVERGREEN_SHADES) lines.push(`--color-evergreen-${shade}:${evergreen[shade]};`);
  for (const shade of GOLD_SHADES) lines.push(`--color-gold-${shade}:${gold[shade]};`);
  lines.push(`--color-cream:${brand.colors.cream};`);
  lines.push(`--color-ink:${brand.colors.ink};`);
  lines.push(`--color-ink-soft:${brand.colors.inkSoft};`);
  lines.push(`--color-paper:${brand.colors.paper};`);
  lines.push(`--font-display:${brand.fonts.display};`);
  lines.push(`--font-sans:${brand.fonts.sans};`);
  lines.push("}");
  return lines.join("");
}
