import type { Book } from "../data/books";
import { derivePhysical, fallbackPalette, paletteFromPixels, type Palette } from "./bookPhysics";

export type OpenLibraryResult = {
  key: string;
  title: string;
  author: string;
  year: number;
  coverId: number;
  cover: string;
  thumb: string;
  pages: number | null;
  publisher: string;
};

type SearchDoc = {
  key?: string;
  title?: string;
  author_name?: string[];
  first_publish_year?: number;
  cover_i?: number;
  number_of_pages_median?: number;
  publisher?: string[];
};

const FIELDS = "key,title,author_name,first_publish_year,cover_i,number_of_pages_median,publisher";

export const coverUrl = (id: number, size: "S" | "M" | "L" = "L") =>
  `https://covers.openlibrary.org/b/id/${id}-${size}.jpg`;

/** Live title/author search. Keeps only books that have a title and cover art. */
export async function searchBooks(q: string, signal?: AbortSignal): Promise<OpenLibraryResult[]> {
  const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&fields=${FIELDS}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open Library respondió ${res.status}`);
  const json = (await res.json()) as { docs?: SearchDoc[] };
  return (json.docs ?? [])
    .filter((d): d is SearchDoc & { key: string; title: string; cover_i: number } =>
      Boolean(d.key && d.title && d.cover_i),
    )
    .map((d) => ({
      key: d.key,
      title: d.title,
      author: d.author_name?.[0] ?? "",
      year: d.first_publish_year ?? 0,
      coverId: d.cover_i,
      cover: coverUrl(d.cover_i, "L"),
      thumb: coverUrl(d.cover_i, "M"),
      pages: d.number_of_pages_median ?? null,
      publisher: d.publisher?.[0] ?? "",
    }));
}

/**
 * Samples a cover into spine/band/ink. Draws it to an 80px-wide canvas,
 * averages the left 6% into `spine` and picks the most saturated mid-tone
 * into `band`. Resolves null when the image can't be read (CORS, 404).
 */
export function readCoverPalette(src: string): Promise<Palette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const timer = window.setTimeout(() => resolve(null), 9000);
    img.onload = () => {
      window.clearTimeout(timer);
      try {
        if (img.naturalWidth < 4 || img.naturalHeight < 4) return resolve(null);
        const w = 80;
        const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        const { data } = ctx.getImageData(0, 0, w, h);
        resolve(paletteFromPixels(data, w, h, 4));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = src;
  });
}

export type BookDraft = Pick<
  Book,
  | "title"
  | "author"
  | "cover"
  | "year"
  | "publisher"
  | "binding"
  | "finish"
  | "spine"
  | "band"
  | "ink"
  | "face"
  | "caps"
  | "width"
  | "height"
  | "lean"
  | "depth"
  | "wear"
>;

/** Turns a search result into a shelvable book, physically derived from its Open Library key. */
export async function buildBook(result: OpenLibraryResult): Promise<BookDraft> {
  const physical = derivePhysical(result.key, result.pages);
  const palette = (await readCoverPalette(result.thumb)) ?? fallbackPalette(result.key);
  return {
    title: result.title,
    author: result.author,
    cover: result.cover,
    year: result.year,
    publisher: result.publisher,
    ...physical,
    ...palette,
  };
}
