import { useEffect, useMemo, useRef, useState } from "react";
import type { Book } from "../data/books";
import { localSearch, smartSearch } from "../lib/librarySearch";

type Status =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "done"; n: number }
  | { kind: "error"; message: string };

type Props = {
  books: Book[];
  /** The visible list, ranked; null means "show everything". */
  onChange: (visible: Book[] | null) => void;
};

const found = (n: number) => (n === 0 ? "Nada por acá" : n === 1 ? "1 encontrado" : `${n} encontrados`);

/** Plain-language search plus genre pills built from whatever genres the shelf holds. */
export function LibraryFilter({ books, onChange }: Props) {
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState<string | null>(null);
  const [ranked, setRanked] = useState<string[] | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const reqId = useRef(0);

  const genres = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of books) for (const g of b.genres ?? []) counts.set(g, (counts.get(g) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [books]);

  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    if (q.length < 2) {
      setRanked(null);
      setStatus({ kind: "idle" });
      return;
    }
    const local = localSearch(q, books);
    const ctl = new AbortController();
    // the local ranking lands almost at once; the AI ranking replaces it if it answers
    const quick = window.setTimeout(() => {
      if (id !== reqId.current) return;
      setRanked(local);
      setStatus({ kind: "done", n: local.length });
    }, 160);
    const slow = window.setTimeout(async () => {
      if (id !== reqId.current) return;
      setStatus({ kind: "searching" });
      try {
        const res = await smartSearch(q, ctl.signal);
        if (id !== reqId.current) return;
        if (!res) {
          setStatus({ kind: "done", n: local.length });
          return;
        }
        if ("error" in res) {
          setStatus({ kind: "error", message: res.error });
          return;
        }
        const known = new Set(books.map((b) => b.id));
        const ids = res.ids.filter((x) => known.has(x)).slice(0, 20);
        const next = ids.length ? ids : local;
        setRanked(next);
        setStatus({ kind: "done", n: next.length });
      } catch {
        if (id === reqId.current) setStatus({ kind: "done", n: local.length });
      }
    }, 600);
    return () => {
      window.clearTimeout(quick);
      window.clearTimeout(slow);
      ctl.abort();
    };
  }, [query, books]);

  useEffect(() => {
    let list: Book[] | null = null;
    if (ranked) {
      const byId = new Map(books.map((b) => [b.id, b]));
      list = ranked.map((id) => byId.get(id)).filter((b): b is Book => Boolean(b));
    }
    if (genre) list = (list ?? books).filter((b) => b.genres?.includes(genre));
    onChange(list);
  }, [ranked, genre, books, onChange]);

  const shownCount =
    status.kind === "done" && genre && ranked
      ? ranked.filter((id) => books.find((b) => b.id === id)?.genres?.includes(genre)).length
      : status.kind === "done"
        ? status.n
        : 0;

  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor="library-search"
        className="group relative flex items-center gap-3 rounded-full border border-foreground/12 bg-card/55 py-1 pr-2 pl-5 shadow-[0_10px_40px_-24px_color-mix(in_oklch,var(--shade)_40%,transparent)] backdrop-blur-sm transition-colors focus-within:border-primary/45 focus-within:bg-card/80"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0 text-foreground/45">
          <circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M15.5 15.5L20 20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          id="library-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="¿Qué estás buscando?"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2.5 font-display text-[21px] leading-tight text-foreground italic outline-none placeholder:text-foreground/40 [&::-webkit-search-cancel-button]:appearance-none"
        />
        <span
          aria-live="polite"
          className={`hidden shrink-0 font-mono text-[10.5px] tracking-[0.16em] uppercase tabular-nums sm:block ${
            status.kind === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {status.kind === "searching"
            ? "Buscando en los estantes…"
            : status.kind === "done"
              ? found(shownCount)
              : status.kind === "error"
                ? status.message
                : ""}
        </span>
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Borrar la búsqueda"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </label>

      {status.kind !== "idle" && (
        <p
          aria-hidden="true"
          className={`-mt-1 pl-5 font-mono text-[10.5px] tracking-[0.16em] uppercase sm:hidden ${
            status.kind === "error" ? "text-destructive" : "text-muted-foreground"
          }`}
        >
          {status.kind === "searching"
            ? "Buscando en los estantes…"
            : status.kind === "done"
              ? found(shownCount)
              : status.message}
        </p>
      )}

      {genres.length > 0 && (
        <div
          role="group"
          aria-label="Filtrar por género"
          className="no-scrollbar -mx-[max(16px,env(safe-area-inset-left,0px))] flex gap-2 overflow-x-auto px-[max(16px,env(safe-area-inset-left,0px))] whitespace-nowrap"
        >
          {genres.map(([name, n]) => {
            const active = genre === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={active}
                onClick={() => setGenre((g) => (g === name ? null : name))}
                className={`inline-flex shrink-0 items-baseline gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] transition-colors ${
                  active
                    ? "border-foreground bg-foreground text-background"
                    : "border-foreground/14 bg-card/40 text-foreground/80 hover:border-foreground/30 hover:bg-card/70"
                }`}
              >
                {name}
                <span className={`font-mono text-[10px] tabular-nums ${active ? "text-background/70" : "text-foreground/45"}`}>
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
