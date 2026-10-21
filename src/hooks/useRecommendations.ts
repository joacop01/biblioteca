import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "../data/books";
import type { BookDraft } from "../lib/openLibrary";
import { SUPABASE_URL, hasBackend, restHeaders } from "../config";

type RecommendationRow = {
  id: string;
  created_at: string;
  recommender: string;
  note: string | null;
  title: string;
  author: string;
  cover: string;
  year: number;
  publisher: string;
  binding: string;
  finish: string;
  spine: string;
  band: string | null;
  ink: string;
  face: string;
  caps: boolean;
  width: number;
  height: number;
  lean: number;
  depth: number;
  wear: number;
};

export type RecommendationInput = BookDraft & { recommender: string; note: string };

const pick = <T extends string>(value: string, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** A database row becomes a shelvable book: the visitor's note is its blurb. */
function toBook(row: RecommendationRow): Book {
  return {
    id: `rec-${row.id}`,
    title: row.title,
    author: row.author,
    genres: [],
    cover: row.cover,
    year: row.year,
    blurb: row.note ?? "",
    rating: 0,
    finished: `Recomendado por ${row.recommender}`,
    recommender: row.recommender,
    publisher: row.publisher,
    binding: pick(row.binding, ["hardcover", "paperback", "mass"] as const, "paperback"),
    finish: pick(row.finish, ["cloth", "gloss", "matte"] as const, "matte"),
    spine: row.spine,
    band: row.band ?? undefined,
    ink: row.ink,
    face: pick(row.face, ["serif", "sans", "mono"] as const, "serif"),
    caps: row.caps,
    width: row.width,
    height: row.height,
    lean: row.lean,
    depth: row.depth,
    wear: row.wear,
  };
}

const ENDPOINT = `${SUPABASE_URL}/rest/v1/recommendations`;

export function useRecommendations() {
  const [recommendations, setRecommendations] = useState<Book[]>([]);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!hasBackend) return;
    const ctl = new AbortController();
    fetch(`${ENDPOINT}?select=*&order=created_at.desc&limit=200`, {
      headers: restHeaders(),
      signal: ctl.signal,
    })
      .then((res) => (res.ok ? (res.json() as Promise<RecommendationRow[]>) : Promise.reject(res.status)))
      .then((rows) => setRecommendations(rows.map(toBook)))
      .catch(() => {
        /* the shelf simply stays hidden */
      });
    return () => {
      ctl.abort();
      window.clearTimeout(timer.current);
    };
  }, []);

  const recommend = useCallback(async (input: RecommendationInput): Promise<Book> => {
    const row = {
      recommender: input.recommender.trim().slice(0, 60),
      note: input.note.trim() ? input.note.trim().slice(0, 500) : null,
      title: input.title.slice(0, 300),
      author: input.author.slice(0, 200),
      cover: input.cover,
      year: Math.round(input.year || 0),
      publisher: input.publisher,
      binding: input.binding,
      finish: input.finish,
      spine: input.spine,
      band: input.band ?? null,
      ink: input.ink,
      face: input.face,
      caps: Boolean(input.caps),
      width: Math.round(input.width),
      height: Math.round(input.height),
      lean: input.lean,
      depth: input.depth,
      wear: input.wear,
    };
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: restHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      throw new Error(
        res.status === 400 || res.status === 403
          ? "Revisá tu nombre (hasta 60 caracteres) y el mensaje (hasta 500)."
          : "No se pudo guardar la recomendación. Probá de nuevo en un rato.",
      );
    }
    const [created] = (await res.json()) as RecommendationRow[];
    const book = toBook(created);
    setRecommendations((prev) => [book, ...prev]);
    setJustAdded(book.id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setJustAdded(null), 1400);
    return book;
  }, []);

  return { recommendations, recommend, justAdded, enabled: hasBackend };
}
