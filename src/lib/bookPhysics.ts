// Pure, environment-agnostic helpers shared by the site (recommend dialog)
// and the Goodreads import script (Node). No DOM access in here.

export type Binding = "hardcover" | "paperback" | "mass";
export type Finish = "cloth" | "gloss" | "matte";
export type Face = "serif" | "sans" | "mono";

export type Physical = {
  binding: Binding;
  finish: Finish;
  height: number;
  width: number;
  lean: number;
  depth: number;
  wear: number;
  face: Face;
  caps: boolean;
};

export type Palette = { spine: string; band: string; ink: string };

export const INK_DARK = "#241f19";
export const INK_LIGHT = "#faf7f0";

/** The only genres a book may carry. They become the filter pills. */
export const GENRES = [
  "Ficción",
  "No ficción",
  "Ciencia ficción",
  "Misterio y suspenso",
  "Fantasía",
  "Romance",
] as const;
export type Genre = (typeof GENRES)[number];

// ---------- deterministic randomness ----------

/** FNV-1a, 32 bit. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough to make a shelf look lived-in. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round1 = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Physical presence of a book on the shelf, derived from its page count and
 * varied per book by a hash of a stable key (the Open Library key when known).
 */
export function derivePhysical(key: string, pages?: number | null): Physical {
  const r = seededRandom(hashString(key));
  const known = typeof pages === "number" && Number.isFinite(pages) && pages > 0;
  const p = known ? (pages as number) : 260 + Math.round(r() * 160);
  const binding: Binding = p > 420 ? "hardcover" : p < 260 ? "mass" : "paperback";
  const finish: Finish = binding === "hardcover" ? "cloth" : r() < 0.5 ? "gloss" : "matte";
  const height =
    binding === "hardcover" ? 236 + r() * 18 : binding === "mass" ? 196 + r() * 14 : 214 + r() * 16;
  const width = clamp(Math.round(p * 0.055 + (r() * 4 - 2)), 16, 58);
  // most books stand straight; a few have slumped a little
  const lean = r() < 0.14 ? -round1(1.2 + r() * 3.8) : 0;
  const depth = round1(r() * 14 - 7);
  const wear = round2(r() * 0.35);
  const faceRoll = r();
  const face: Face = faceRoll < 0.5 ? "serif" : faceRoll < 0.82 ? "sans" : "mono";
  const caps = r() < 0.36;
  return { binding, finish, height: Math.round(height), width, lean, depth, wear, face, caps };
}

// ---------- color ----------

const toHex2 = (v: number) =>
  Math.round(clamp(v, 0, 255))
    .toString(16)
    .padStart(2, "0");

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/(.)/g, "$1$1") : h;
  const n = parseInt(full.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Perceived lightness, 0–1, on gamma-encoded channels. */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function inkFor(spineHex: string): string {
  const [r, g, b] = hexToRgb(spineHex);
  return luminance(r, g, b) > 0.55 ? INK_DARK : INK_LIGHT;
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return rgbToHex(f(0) * 255, f(8) * 255, f(4) * 255);
}

function mix(hex: string, toward: [number, number, number], amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(
    r + (toward[0] - r) * amount,
    g + (toward[1] - g) * amount,
    b + (toward[2] - b) * amount,
  );
}

/**
 * Spine and accent colors from raw pixels (RGBA or RGB). The spine is the
 * average of the left 6% of the cover, where the art would wrap around; the
 * band is the most saturated mid-luminance color in the whole image.
 */
export function paletteFromPixels(
  data: ArrayLike<number>,
  width: number,
  height: number,
  channels = 4,
): Palette | null {
  if (!width || !height) return null;
  const edgeW = Math.max(1, Math.round(width * 0.06));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < edgeW; x++) {
      const i = (y * width + x) * channels;
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      n++;
    }
  }
  if (!n) return null;
  const spine = rgbToHex(r / n, g / n, b / n);

  const total = width * height;
  const step = Math.max(1, Math.floor(total / 9000));
  const picks: { score: number; r: number; g: number; b: number }[] = [];
  for (let p = 0; p < total; p += step) {
    const i = p * channels;
    const R = data[i] / 255;
    const G = data[i + 1] / 255;
    const B = data[i + 2] / 255;
    const max = Math.max(R, G, B);
    const min = Math.min(R, G, B);
    const l = (max + min) / 2;
    if (l < 0.22 || l > 0.78) continue;
    const c = max - min;
    if (c < 0.14) continue;
    const s = c / (1 - Math.abs(2 * l - 1));
    picks.push({ score: s * c, r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  let band: string;
  if (picks.length) {
    picks.sort((x, y) => y.score - x.score);
    const top = picks.slice(0, 10);
    const avg = top.reduce((acc, p) => [acc[0] + p.r, acc[1] + p.g, acc[2] + p.b], [0, 0, 0]);
    band = rgbToHex(avg[0] / top.length, avg[1] / top.length, avg[2] / top.length);
  } else {
    const [sr, sg, sb] = hexToRgb(spine);
    band = luminance(sr, sg, sb) > 0.5 ? mix(spine, [30, 24, 18], 0.45) : mix(spine, [240, 226, 196], 0.42);
  }
  return { spine, band, ink: inkFor(spine) };
}

/** A deterministic book-cloth palette for books without cover art. */
export function fallbackPalette(key: string): Palette {
  const r = seededRandom(hashString(`palette:${key}`));
  // oxblood, ochre, bottle green, teal, ink blue, plum, slate
  const hues = [8, 22, 38, 148, 176, 212, 300, 340];
  const hue = hues[Math.floor(r() * hues.length)] + (r() * 10 - 5);
  const light = r() < 0.18;
  const spine = light
    ? hslToHex(hue, 0.18 + r() * 0.12, 0.8 + r() * 0.06)
    : hslToHex(hue, 0.26 + r() * 0.2, 0.22 + r() * 0.14);
  const band = hslToHex((hue + 32 + r() * 20) % 360, 0.42 + r() * 0.2, light ? 0.38 : 0.6);
  return { spine, band, ink: inkFor(spine) };
}

// ---------- text ----------

/** Goodreads titles carry the series in parentheses and a subtitle after a colon. */
export function parseTitle(title: string): { main: string; subtitle: string; series: string } {
  let t = title.trim();
  let series = "";
  const m = t.match(/\s*\(([^()]*#\s*[\d.]+[^()]*)\)\s*$/);
  if (m && m.index !== undefined) {
    const raw = m[1];
    const num = raw.match(/#\s*([\d.]+)/)?.[1] ?? "";
    const name = raw
      .split(";")[0]
      .replace(/,?\s*#\s*[\d.]+.*$/, "")
      .trim();
    series = num ? `${name} · ${num}` : name;
    t = t.slice(0, m.index).trim();
  }
  let main = t;
  let subtitle = "";
  const colon = t.indexOf(": ");
  if (colon > 0) {
    main = t.slice(0, colon).trim();
    subtitle = t.slice(colon + 2).trim();
  }
  return { main, subtitle, series };
}

export function foldText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function slugify(s: string, max = 32): string {
  return foldText(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026/09/13" or "2026-09-13" → "sep 2026". Empty string when unparseable. */
export function formatMonthYear(date: string): string {
  const m = date.trim().match(/^(\d{4})[/-](\d{1,2})(?:[/-](\d{1,2}))?/);
  if (!m) return "";
  const month = Number(m[2]);
  if (month < 1 || month > 12) return "";
  return `${MONTHS[month - 1]} ${m[1]}`;
}

export const READING_NOW = "Leyendo ahora";

export function finishedLabel(book: { finished: string; recommender?: string }): string {
  if (book.recommender) return `Recomendado por ${book.recommender}`;
  const f = book.finished.trim();
  if (!f) return "Leído";
  if (/^[a-z]{3} \d{4}$/.test(f)) return `Leído en ${f}`;
  return f;
}

export const bindingLabel: Record<Binding, string> = {
  hardcover: "Tapa dura",
  paperback: "Rústica",
  mass: "Bolsillo",
};
