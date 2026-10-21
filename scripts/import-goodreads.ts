/**
 * Regenerates src/data/books.ts and public/catalogue.json from a Goodreads export.
 *
 *   npm run import                       # data/goodreads.csv → books.ts
 *   npm run import -- --from export.csv  # sanitize a full export into data/goodreads.csv first
 *   npm run import -- --offline          # no network: use only what's cached
 *   npm run import -- --refresh          # re-fetch every book from Open Library
 *
 * Only rows on the "read" or "currently-reading" shelf are shelved. Each book is
 * looked up on Open Library (ISBN first, then title + author) for its cover,
 * first publication year and description; the cover's left edge is sampled into
 * the spine color. Lookups are cached in data/openlibrary.json, so a re-run only
 * fetches new books. Hand-written blurbs and genres in data/curated.json win over
 * anything fetched.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import jpeg from "jpeg-js";
import {
  GENRES,
  READING_NOW,
  derivePhysical,
  fallbackPalette,
  foldText,
  formatMonthYear,
  paletteFromPixels,
  parseTitle,
  slugify,
  type Palette,
} from "../src/lib/bookPhysics.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const paths = {
  csv: resolve(root, "data/goodreads.csv"),
  cache: resolve(root, "data/openlibrary.json"),
  curated: resolve(root, "data/curated.json"),
  report: resolve(root, "data/import-report.txt"),
  books: resolve(root, "src/data/books.ts"),
  catalogue: resolve(root, "public/catalogue.json"),
};

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const refresh = args.includes("--refresh");
const fromIdx = args.indexOf("--from");
const fromPath = fromIdx >= 0 ? args[fromIdx + 1] : null;

// ---------------------------------------------------------------- CSV

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

const csvCell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Columns kept in data/goodreads.csv. Reviews and private notes never leave the export. */
const KEEP = [
  "Book Id",
  "Title",
  "Author",
  "Additional Authors",
  "ISBN",
  "ISBN13",
  "My Rating",
  "Publisher",
  "Binding",
  "Number of Pages",
  "Year Published",
  "Original Publication Year",
  "Date Read",
  "Date Added",
  "Bookshelves",
  "Exclusive Shelf",
];

async function sanitize(from: string) {
  const rows = parseCSV(await readFile(from, "utf8"));
  const header = rows[0];
  const idx = KEEP.map((k) => header.indexOf(k));
  if (idx[KEEP.indexOf("Title")] < 0 || idx[KEEP.indexOf("Exclusive Shelf")] < 0) {
    throw new Error(`${from} doesn't look like a Goodreads export (no Title / Exclusive Shelf columns).`);
  }
  const out = [KEEP.join(",")];
  for (const r of rows.slice(1)) out.push(idx.map((i) => csvCell(i >= 0 ? (r[i] ?? "") : "")).join(","));
  await mkdir(dirname(paths.csv), { recursive: true });
  await writeFile(paths.csv, out.join("\n") + "\n");
  console.log(`Sanitized ${rows.length - 1} rows into data/goodreads.csv`);
}

type Row = Record<string, string>;

async function readRows(): Promise<Row[]> {
  const rows = parseCSV(await readFile(paths.csv, "utf8"));
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const isbnOf = (raw: string | undefined) => (raw ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
const num = (raw: string | undefined) => {
  const n = parseFloat((raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------- Open Library

type OLEntry = {
  fetchedAt: string;
  matchedBy: "isbn" | "search" | null;
  workKey: string | null;
  editionKey: string | null;
  olTitle: string;
  coverId: number | null;
  coverSource: "edition" | "spanish-edition" | "work" | null;
  firstPublishYear: number | null;
  pages: number | null;
  description: string;
  subjects: string[];
};

type Cache = { books: Record<string, OLEntry>; palettes: Record<string, Palette | null> };

const UA = "biblioteca-virtual-import/1.0 (personal bookshelf; GitHub Actions)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let lastApi = 0;

async function get(url: string, as: "json" | "buffer"): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    if (as === "json") {
      const wait = lastApi + 420 - Date.now();
      if (wait > 0) await sleep(wait);
      lastApi = Date.now();
    }
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": UA, Accept: as === "json" ? "application/json" : "image/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 404) return null;
      if (res.status === 429 || res.status >= 500) {
        await sleep(2500 * (attempt + 1));
        continue;
      }
      if (!res.ok) return null;
      return as === "json" ? await res.json() : Buffer.from(await res.arrayBuffer());
    } catch {
      await sleep(1500 * (attempt + 1));
    }
  }
  return null;
}

const SEARCH_FIELDS =
  "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject,cover_edition_key";

type SearchDoc = {
  key: string;
  title: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  subject?: string[];
  cover_edition_key?: string;
};

const words = (s: string) => new Set(foldText(s).split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2));
function similarity(a: string, b: string): number {
  const A = words(a);
  const B = words(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
const surname = (author: string) => foldText(author).split(/[\s.]+/).filter(Boolean).pop() ?? "";

function pickDoc(docs: SearchDoc[], title: string, author: string): SearchDoc | null {
  const last = surname(author);
  const byAuthor = docs.filter((d) => d.author_name?.some((a) => foldText(a).includes(last)));
  if (byAuthor.length) {
    return byAuthor.sort((a, b) => similarity(b.title, title) - similarity(a.title, title))[0];
  }
  const close = docs.find((d) => similarity(d.title, title) >= 0.8);
  return close ?? null;
}

function cleanDescription(raw: unknown): string {
  const text = typeof raw === "string" ? raw : (raw as { value?: string } | null)?.value ?? "";
  return text
    .replace(/\r/g, "")
    .split(/\n-{3,}|\n\*{3,}|\n_{3,}/)[0] // drop "----" source/contents sections
    .replace(/\[([^\]]+)\]\[\d+\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\(\[source\]\[\d+\]\)/gi, "")
    .replace(/^\s*\[\d+\]:.*$/gm, "")
    .replace(/[*_#>]+/g, "")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
}

async function samplePalette(coverId: number): Promise<Palette | null> {
  const buf: Buffer | null = await get(`https://covers.openlibrary.org/b/id/${coverId}-M.jpg`, "buffer");
  if (!buf || buf.length < 400) return null;
  try {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 96 });
    return paletteFromPixels(img.data, img.width, img.height, 4);
  } catch {
    return null;
  }
}

async function lookup(row: Row): Promise<OLEntry> {
  const { main } = parseTitle(row["Title"]);
  const author = row["Author"];
  const entry: OLEntry = {
    fetchedAt: new Date().toISOString(),
    matchedBy: null,
    workKey: null,
    editionKey: null,
    olTitle: "",
    coverId: null,
    coverSource: null,
    firstPublishYear: null,
    pages: null,
    description: "",
    subjects: [],
  };

  let doc: SearchDoc | null = null;
  let edition: any = null;
  for (const isbn of [isbnOf(row["ISBN13"]), isbnOf(row["ISBN"])].filter(Boolean)) {
    edition = await get(`https://openlibrary.org/isbn/${isbn}.json`, "json");
    if (edition) {
      const s = await get(`https://openlibrary.org/search.json?q=isbn:${isbn}&limit=1&fields=${SEARCH_FIELDS}`, "json");
      doc = s?.docs?.[0] ?? null;
      entry.matchedBy = "isbn";
      break;
    }
  }
  if (!doc) {
    const q = `title=${encodeURIComponent(main)}&author=${encodeURIComponent(author)}`;
    let s = await get(`https://openlibrary.org/search.json?${q}&limit=8&fields=${SEARCH_FIELDS}`, "json");
    doc = pickDoc(s?.docs ?? [], main, author);
    if (!doc) {
      s = await get(
        `https://openlibrary.org/search.json?q=${encodeURIComponent(`${main} ${author}`)}&limit=8&fields=${SEARCH_FIELDS}`,
        "json",
      );
      doc = pickDoc(s?.docs ?? [], main, author);
    }
    if (doc && !entry.matchedBy) entry.matchedBy = "search";
  }

  const workKey: string | null = doc?.key ?? edition?.works?.[0]?.key ?? null;
  entry.workKey = workKey;
  entry.editionKey = edition?.key ?? null;
  entry.olTitle = doc?.title ?? edition?.title ?? "";
  entry.firstPublishYear = doc?.first_publish_year ?? null;
  entry.pages = edition?.number_of_pages ?? doc?.number_of_pages_median ?? null;
  entry.subjects = (doc?.subject ?? []).slice(0, 40);

  const editionCover = (edition?.covers ?? []).find((c: number) => c > 0);
  if (editionCover) {
    entry.coverId = editionCover;
    entry.coverSource = "edition";
  }

  let work: any = null;
  if (workKey) {
    work = await get(`https://openlibrary.org${workKey}.json`, "json");
    entry.description = cleanDescription(work?.description) || cleanDescription(edition?.description);
    if (!entry.subjects.length) entry.subjects = (work?.subjects ?? []).slice(0, 40);
  }

  // no cover on the exact edition: prefer a Spanish edition's cover over the work's default
  if (!entry.coverId && workKey) {
    const eds = await get(`https://openlibrary.org${workKey}/editions.json?limit=80`, "json");
    const spanish = (eds?.entries ?? []).filter(
      (e: any) =>
        (e.covers ?? []).some((c: number) => c > 0) &&
        (e.languages ?? []).some((l: { key: string }) => l.key === "/languages/spa"),
    );
    if (spanish.length) {
      spanish.sort((a: any, b: any) => similarity(b.title ?? "", main) - similarity(a.title ?? "", main));
      entry.coverId = spanish[0].covers.find((c: number) => c > 0);
      entry.coverSource = "spanish-edition";
    }
  }
  if (!entry.coverId) {
    const workCover = doc?.cover_i ?? (work?.covers ?? []).find((c: number) => c > 0);
    if (workCover) {
      entry.coverId = workCover;
      entry.coverSource = "work";
    }
  }
  return entry;
}

// ---------------------------------------------------------------- genres

type Curated = Record<
  string,
  {
    blurb?: string;
    genres?: string[];
    coverId?: number | null;
    /** null when the year is unknown (the export has a wrong one) */
    year?: number | null;
    title?: string;
    author?: string;
    /** leave the book off the shelf (e.g. a second edition of a book already there) */
    hide?: boolean;
  }
>;

function autoGenres(row: Row, ol: OLEntry | undefined): string[] {
  const text = foldText([...(ol?.subjects ?? []), row["Bookshelves"] ?? ""].join(" | "));
  const out: string[] = [];
  const has = (re: RegExp) => re.test(text);
  if (has(/science fiction|ciencia[- ]ficcion|sci-fi|dystopi|distopi|space opera|cyberpunk/)) out.push("Ciencia ficción");
  if (has(/fantasy|fantasia|magic|dragons|fairies/)) out.push("Fantasía");
  if (has(/mystery|detective|thriller|crime|suspense|misterio|policial|noir/)) out.push("Misterio y suspenso");
  if (has(/romance|love stories|romantic/)) out.push("Romance");
  if (!out.length && has(/fiction|novela|ficcion|literary|cuentos|short stories/) && !has(/nonfiction|non-fiction/))
    out.push("Ficción");
  if (!out.length) out.push("No ficción");
  return out.slice(0, 2);
}

function shortBlurb(text: string, max = 420): string {
  const flat = text.replace(/\s*\n+\s*/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  return end > max * 0.45 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, "")}…`;
}

// ---------------------------------------------------------------- main

const BOOK_TYPE = `export type Book = {
  id: string;
  title: string;
  author: string;
  genres?: string[];          // genre tags shown as filter pills
  cover: string;               // real cover art (Open Library URL)
  year: number;
  blurb: string;
  rating: number;              // 0 means unrated
  finished: string;            // e.g. "jul 2026"
  recommender?: string;        // set only when a visitor recommended it
  publisher: string;
  binding: "hardcover" | "paperback" | "mass";
  finish: "cloth" | "gloss" | "matte";   // spine surface material
  spine: string;               // base color, sampled from the cover's left edge
  band?: string;               // accent pulled from the cover art
  ink: string;                 // lettering color
  face: "serif" | "sans" | "mono";       // lettering style
  caps?: boolean;
  width: number;               // spine width in px
  height: number;              // spine height in px
  lean: number;                // degrees of lean on the shelf
  depth: number;               // how far forward/back the book sits, px
  wear: number;                // 0–1 edge wear and ink fade
  spineImage?: string;
};`;

async function readJSON<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main() {
  if (fromPath) await sanitize(resolve(process.cwd(), fromPath));
  if (!existsSync(paths.csv)) throw new Error("data/goodreads.csv not found. Pass --from <goodreads_library_export.csv>.");

  const curated = await readJSON<Curated>(paths.curated, {});
  const rows = (await readRows()).filter((r) => {
    const shelf = (r["Exclusive Shelf"] ?? "").toLowerCase();
    return (shelf === "read" || shelf === "currently-reading") && !curated[r["Book Id"]]?.hide;
  });
  const cache = await readJSON<Cache>(paths.cache, { books: {}, palettes: {} });
  const report: string[] = [];
  const gidOf = (row: Row) => row["Book Id"] || slugify(`${row["Title"]}-${row["Author"]}`);
  const save = () => writeFile(paths.cache, JSON.stringify(cache, null, 1) + "\n");

  let fetched = 0;
  for (const [i, row] of rows.entries()) {
    const id = gidOf(row);
    if (offline || (cache.books[id] && !refresh)) continue;
    process.stdout.write(`[${i + 1}/${rows.length}] ${row["Title"].slice(0, 60)} … `);
    cache.books[id] = await lookup(row);
    fetched++;
    const c = cache.books[id];
    console.log(c.workKey ? `${c.matchedBy}, cover: ${c.coverSource ?? "none"}` : "no match");
    if (fetched % 10 === 0) await save();
  }

  // the cover each book will actually show (a curated id wins; null removes a wrong one)
  const coverFor = (row: Row): number | null => {
    const cur = curated[gidOf(row)];
    if (cur && cur.coverId !== undefined) return cur.coverId;
    return cache.books[gidOf(row)]?.coverId ?? null;
  };
  let sampled = 0;
  for (const row of rows) {
    const coverId = coverFor(row);
    if (offline || !coverId || (String(coverId) in cache.palettes && !refresh)) continue;
    cache.palettes[String(coverId)] = await samplePalette(coverId);
    sampled++;
  }
  if (fetched || sampled) await save();

  const shelved = rows.map((row) => {
    const gid = gidOf(row);
    const ol = cache.books[gid];
    const cur = curated[gid] ?? {};
    const title = cur.title ?? row["Title"];
    const { main } = parseTitle(title);
    const reading = (row["Exclusive Shelf"] ?? "").toLowerCase() === "currently-reading";
    const pages = num(row["Number of Pages"]) || ol?.pages || null;
    const key = ol?.workKey ?? `goodreads:${gid}`;
    const coverId = coverFor(row);
    const palette = (coverId ? cache.palettes[String(coverId)] : null) ?? fallbackPalette(key);
    const genres = (cur.genres ?? autoGenres(row, ol)).filter((g) => (GENRES as readonly string[]).includes(g));
    const year =
      cur.year === null
        ? 0
        : cur.year ||
      num(row["Original Publication Year"]) ||
      ol?.firstPublishYear ||
      num(row["Year Published"]) ||
      0;
    const blurb = cur.blurb ?? (ol?.description ? shortBlurb(ol.description) : "");

    if (!ol?.workKey) report.push(`sin coincidencia en Open Library: ${row["Title"]} — ${row["Author"]}`);
    else if (!coverId) report.push(`sin tapa: ${row["Title"]} — ${row["Author"]}`);
    if (!cur.blurb) report.push(`sinopsis sin curar (${ol?.description ? "inglés/automática" : "vacía"}): ${gid} ${row["Title"]}`);

    return {
      sort: {
        reading,
        read: row["Date Read"] ?? "",
        added: row["Date Added"] ?? "",
      },
      book: {
        id: `${slugify(main, 28) || "libro"}-${gid}`,
        title,
        author: cur.author ?? row["Author"].replace(/\s+/g, " ").trim(),
        genres,
        cover: coverId ? `https://covers.openlibrary.org/b/id/${coverId}-L.jpg` : "",
        year,
        blurb,
        rating: num(row["My Rating"]),
        finished: reading ? READING_NOW : formatMonthYear(row["Date Read"] ?? ""),
        publisher: row["Publisher"] ?? "",
        ...derivePhysical(key, pages),
        ...palette,
      },
    };
  });

  // currently reading first, then newest finished, then undated by date added
  shelved.sort((a, b) => {
    if (a.sort.reading !== b.sort.reading) return a.sort.reading ? -1 : 1;
    if (a.sort.read && b.sort.read) return b.sort.read.localeCompare(a.sort.read);
    if (a.sort.read !== b.sort.read) return a.sort.read ? -1 : 1;
    return b.sort.added.localeCompare(a.sort.added);
  });

  const list = shelved.map((s) => s.book);
  const body =
    `// Generated by scripts/import-goodreads.ts from data/goodreads.csv.\n` +
    `// Run \`npm run import\` after replacing the CSV. Do not edit by hand:\n` +
    `// curated blurbs and genres live in data/curated.json.\n\n` +
    `${BOOK_TYPE}\n\n` +
    `export const books: Book[] = ${JSON.stringify(list, null, 2)};\n`;
  await writeFile(paths.books, body);

  await mkdir(dirname(paths.catalogue), { recursive: true });
  await writeFile(
    paths.catalogue,
    JSON.stringify(list.map(({ id, title, author, year, genres, blurb }) => ({ id, title, author, year, genres, blurb }))) + "\n",
  );

  const withCover = list.filter((b) => b.cover).length;
  const summary = [
    `${list.length} libros en el estante (${rows.length} filas read/currently-reading)`,
    `${withCover} con tapa, ${list.length - withCover} con tapa tipográfica`,
    `${fetched} consultados en Open Library en esta corrida${offline ? " (offline)" : ""}`,
    "",
    ...report,
  ];
  await writeFile(paths.report, summary.join("\n") + "\n");
  console.log(summary.slice(0, 3).join("\n"));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
