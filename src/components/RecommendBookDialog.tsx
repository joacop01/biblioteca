import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "../data/books";
import { buildBook, searchBooks, type OpenLibraryResult } from "../lib/openLibrary";
import type { RecommendationInput } from "../hooks/useRecommendations";

type Props = {
  open: boolean;
  onClose: () => void;
  onRecommend: (input: RecommendationInput) => Promise<Book>;
};

/** Visitors find a real book on Open Library and leave it on the "Me recomendaron" shelf. */
export function RecommendBookDialog({ open, onClose, onRecommend }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<OpenLibraryResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [picked, setPicked] = useState<OpenLibraryResult | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // reset every time it opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setPicked(null);
    setNote("");
    setError("");
    setSearchError("");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const id = window.setTimeout(() => searchRef.current?.focus(), 60);
    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prev;
    };
  }, [open]);

  // live search, debounced and abortable
  useEffect(() => {
    if (!open || picked) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      setSearchError("");
      return;
    }
    const ctl = new AbortController();
    const id = window.setTimeout(async () => {
      setSearching(true);
      setSearchError("");
      try {
        const found = await searchBooks(q, ctl.signal);
        setResults(found);
      } catch {
        if (!ctl.signal.aborted) setSearchError("Open Library no respondió. Probá de nuevo en un momento.");
      } finally {
        if (!ctl.signal.aborted) setSearching(false);
      }
    }, 280);
    return () => {
      window.clearTimeout(id);
      ctl.abort();
    };
  }, [query, open, picked]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !sending) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, sending]);

  useEffect(() => {
    if (picked) window.setTimeout(() => nameRef.current?.focus(), 40);
  }, [picked]);

  if (!open) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!picked || sending) return;
    const who = name.trim();
    if (!who) {
      setError("Escribí tu nombre para que sepa quién me lo recomienda.");
      nameRef.current?.focus();
      return;
    }
    setSending(true);
    setError("");
    try {
      const draft = await buildBook(picked);
      await onRecommend({ ...draft, recommender: who, note });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la recomendación. Probá de nuevo en un rato.");
    } finally {
      setSending(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto px-4 py-[max(24px,6vh)]">
      <div
        className="animate-fade-in fixed inset-0 bg-background/70 backdrop-blur-lg"
        onClick={() => !sending && onClose()}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recommend-title"
        className="animate-rise relative w-full max-w-[560px] rounded-[22px] border border-foreground/10 bg-popover p-6 text-popover-foreground shadow-[0_40px_90px_-40px_color-mix(in_oklch,var(--shade)_55%,transparent)] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-[10.5px] tracking-[0.24em] text-muted-foreground uppercase">Para el segundo estante</p>
            <h2 id="recommend-title" className="mt-2 font-display text-[2rem] leading-none font-light italic">
              Recomendame un libro
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            aria-label="Cerrar"
            className="-mt-1 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/55 transition-colors hover:bg-foreground/6 hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {!picked ? (
          <div className="mt-6">
            <label htmlFor="recommend-search" className="sr-only">
              Buscá por título o autor
            </label>
            <input
              ref={searchRef}
              id="recommend-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscá por título o autor…"
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-full border border-foreground/14 bg-card/60 px-5 py-3 text-[16px] outline-none placeholder:text-foreground/40 focus:border-primary/50 [&::-webkit-search-cancel-button]:appearance-none"
            />
            <div className="mt-4 max-h-[min(52vh,440px)] overflow-y-auto pr-1" aria-live="polite">
              {searching && results.length === 0 && (
                <p className="py-6 text-center font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">
                  Buscando…
                </p>
              )}
              {searchError && <p className="py-4 text-[14px] text-destructive">{searchError}</p>}
              {!searching && !searchError && query.trim().length >= 2 && results.length === 0 && (
                <p className="py-6 text-center text-[14px] text-muted-foreground">
                  No encontré nada con ese nombre. Probá con el autor o con otra parte del título.
                </p>
              )}
              {query.trim().length < 2 && (
                <p className="py-4 text-[14px] leading-relaxed text-muted-foreground">
                  Busco en el catálogo de Open Library, así el libro llega con su tapa real.
                </p>
              )}
              <ul className="flex flex-col">
                {results.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => setPicked(r)}
                      className="group flex w-full items-center gap-4 rounded-[12px] px-2 py-2.5 text-left transition-colors hover:bg-foreground/5"
                    >
                      <img
                        src={r.thumb}
                        alt=""
                        loading="lazy"
                        className="h-[60px] w-[40px] shrink-0 rounded-[3px] bg-muted object-cover shadow-[0_4px_10px_-4px_color-mix(in_oklch,var(--shade)_50%,transparent)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[18px] leading-tight">{r.title}</span>
                        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                          {[r.author, r.year || ""].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] tracking-[0.16em] text-primary uppercase opacity-70 transition-opacity group-hover:opacity-100">
                        Elegir
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6" noValidate>
            <div className="flex gap-5">
              <img
                src={picked.thumb}
                alt=""
                className="h-[132px] w-[88px] shrink-0 rounded-[4px] bg-muted object-cover shadow-[0_14px_28px_-14px_color-mix(in_oklch,var(--shade)_60%,transparent)]"
              />
              <div className="min-w-0 pt-1">
                <p className="font-display text-[1.45rem] leading-[1.1] text-balance">{picked.title}</p>
                <p className="mt-1.5 text-[14px] text-muted-foreground">
                  {[picked.author, picked.year || ""].filter(Boolean).join(" · ")}
                </p>
                <button
                  type="button"
                  onClick={() => setPicked(null)}
                  className="mt-3 font-mono text-[10.5px] tracking-[0.16em] text-primary uppercase underline-offset-4 hover:underline"
                >
                  Elegir otro
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-4">
              <div>
                <label htmlFor="recommend-name" className="text-[13px] text-foreground/75">
                  Tu nombre
                </label>
                <input
                  ref={nameRef}
                  id="recommend-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  autoComplete="given-name"
                  required
                  className="mt-1.5 w-full rounded-[12px] border border-foreground/14 bg-card/60 px-4 py-2.5 text-[16px] outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="recommend-note" className="text-[13px] text-foreground/75">
                    ¿Por qué debería leerlo?
                  </label>
                  <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">{note.length}/500</span>
                </div>
                <textarea
                  id="recommend-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={4}
                  className="mt-1.5 w-full resize-none rounded-[12px] border border-foreground/14 bg-card/60 px-4 py-3 text-[15px] leading-relaxed outline-none focus:border-primary/50"
                />
              </div>
            </div>

            {error && <p className="mt-4 text-[14px] text-destructive">{error}</p>}

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="rounded-full px-4 py-2.5 text-[14px] text-foreground/70 transition-colors hover:bg-foreground/5"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sending}
                className="rounded-full bg-foreground px-5 py-2.5 text-[14px] text-background transition-opacity hover:opacity-85 disabled:opacity-60"
              >
                {sending ? "Guardando…" : "Dejarlo en el estante"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
