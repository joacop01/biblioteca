import type { Book } from "../data/books";
import { foldText } from "./bookPhysics";
import { SUPABASE_URL, SUPABASE_KEY, hasBackend } from "../config";

// ---------- local search (always available) ----------

const STOP = new Set(
  (
    "a al algo alguna alguno algun ante como con contra cual cuando de del desde donde dos e el ella ellas ellos en entre era es esa ese eso esta este esto estoy hay la las le les lo los mas me mi mis muy mucho nada ni no nos o otra otro para pero poco por que quiero quien se sea ser si sin sobre son su sus tal tan te tiene toda todo tu tus un una uno unos unas y ya yo " +
    "about an and any are as at be book books but by for from have i in is it libro libros like me my of on or read some something that the this to want with leer lei leido busco buscando tipo tema temas onda estilo"
  ).split(" "),
);

/** Words that point at a genre. Checked in order; a match is removed from the query. */
const GENRE_HINTS: Array<[RegExp, string]> = [
  [/\b(ciencia ?ficcion|sci-?fi|science ?fiction|distopi\w*|dystopi\w*|cyberpunk|espacial\w*|space ?opera)\b/g, "Ciencia ficción"],
  [/\b(fantasia\w*|fantasy|magia|magic\w*|hadas?|faer\w*|fae|dragon\w*|brujas?|witch\w*)\b/g, "Fantasía"],
  [/\b(misterio\w*|myster\w*|thriller\w*|policial\w*|suspenso|suspense|crimen\w*|crime|detective\w*|noir|asesinato\w*|murder)\b/g, "Misterio y suspenso"],
  [/\b(romance\w*|romantic\w*|romantica\w*|amor\w*|love)\b/g, "Romance"],
  [/\b(no ?ficcion|non-?fiction|ensayo\w*|essay\w*|divulgacion|biografia\w*|memorias?|memoir\w*)\b/g, "No ficción"],
  [/\b(novela\w*|novel\w*|ficcion|fiction|cuentos?|relatos?)\b/g, "Ficción"],
];

function stem(t: string): string {
  if (t.length > 5 && t.endsWith("es")) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

const words = (s: string) => foldText(s).split(/[^a-z0-9ñ]+/).filter(Boolean);

type Indexed = { book: Book; title: string; author: string; tw: string[]; aw: string[]; bw: string[]; pw: string[] };
const indexCache = new WeakMap<Book, Indexed>();

function indexed(book: Book): Indexed {
  let entry = indexCache.get(book);
  if (!entry) {
    entry = {
      book,
      title: foldText(book.title),
      author: foldText(book.author),
      tw: words(book.title),
      aw: words(book.author),
      bw: words(book.blurb),
      pw: words(book.publisher),
    };
    indexCache.set(book, entry);
  }
  return entry;
}

const hit = (list: string[], token: string) => list.some((w) => w.startsWith(token));

/**
 * Plain client-side ranking: accent-insensitive word matching against title,
 * author, genres, publisher and blurb, with genre words in the query mapped to
 * the genre pills. Returns ids, best match first.
 */
export function localSearch(query: string, books: Book[]): string[] {
  const q = foldText(query).trim().replace(/\s+/g, " ");
  if (q.length < 2) return [];
  let rest = ` ${q} `;
  const wanted = new Set<string>();
  for (const [re, genre] of GENRE_HINTS) {
    re.lastIndex = 0;
    if (re.test(rest)) {
      wanted.add(genre);
      re.lastIndex = 0;
      rest = rest.replace(re, " ");
    }
  }
  const tokens = rest
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 1 && !STOP.has(t))
    .map(stem);

  const scored: Array<{ id: string; score: number }> = [];
  for (const book of books) {
    const ix = indexed(book);
    let score = 0;
    if (q.length > 3 && ix.title.includes(q)) score += 14;
    if (q.length > 3 && ix.author.includes(q)) score += 12;
    let matched = 0;
    for (const t of tokens) {
      let s = 0;
      if (hit(ix.tw, t)) s += 4;
      if (hit(ix.aw, t)) s += 4;
      if (hit(ix.pw, t)) s += 1;
      if (hit(ix.bw, t)) s += 1.25;
      if (/^\d{4}$/.test(t) && String(book.year) === t) s += 4;
      if (s > 0) matched++;
      score += s;
    }
    const genreHit = (book.genres ?? []).some((g) => wanted.has(g));
    if (wanted.size) {
      if (genreHit) score += tokens.length ? 2.5 : 6;
      else if (!tokens.length) score = 0;
    }
    // a multi-word query should mostly match, not hinge on one stray word
    if (tokens.length >= 3 && matched < Math.ceil(tokens.length / 3) && !genreHit) score = 0;
    if (score > 0) scored.push({ id: book.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.id);
}

// ---------- AI search (optional, server side) ----------

let aiAvailable = hasBackend;

export type SmartResult = { ids: string[] } | { error: string };

/**
 * Asks the `library-search` edge function to rank the shelf for a plain-language
 * request. The API key never leaves the server. Resolves null when AI search
 * isn't set up, so the caller keeps the local ranking.
 */
export async function smartSearch(query: string, signal?: AbortSignal): Promise<SmartResult | null> {
  if (!aiAvailable) return null;
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/library-search`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    return null;
  }
  if (res.status === 404 || res.status === 503) {
    aiAvailable = false;
    return null;
  }
  if (res.status === 429) return { error: "Demasiadas búsquedas seguidas. Probá de nuevo en un minuto." };
  if (res.status === 402) return { error: "Se terminaron los créditos de búsqueda." };
  if (!res.ok) return null;
  const json = (await res.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(json.ids) ? json.ids.filter((x): x is string => typeof x === "string") : [];
  return { ids };
}
