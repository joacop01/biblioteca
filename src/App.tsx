import { useMemo, useState } from "react";
import { books, type Book } from "./data/books";
import { Shelf } from "./components/Shelf";
import { TypedTitle } from "./components/TypedTitle";
import { LibraryFilter } from "./components/LibraryFilter";
import { RecommendBookDialog } from "./components/RecommendBookDialog";
import { useRecommendations } from "./hooks/useRecommendations";
import { hashString } from "./lib/bookPhysics";

const gutter = "px-[max(16px,env(safe-area-inset-left,0px))]";

export default function App() {
  const [shown, setShown] = useState<Book[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { recommendations, recommend, justAdded, enabled } = useRecommendations();

  const visible = shown ?? books;
  // remount the main shelf whenever the filtered set changes, so it rises in fresh
  const shelfKey = useMemo(() => hashString(visible.map((b) => b.id).join("|")), [visible]);

  return (
    <div className="grain min-h-screen overflow-x-clip bg-background text-foreground">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="animate-drift absolute -inset-[18%]"
          style={{
            background:
              "radial-gradient(42% 38% at 24% 18%, var(--glow) 0%, transparent 70%), radial-gradient(38% 34% at 82% 64%, color-mix(in oklch, var(--accent) 55%, transparent) 0%, transparent 72%), radial-gradient(30% 28% at 56% 96%, color-mix(in oklch, var(--glow) 70%, transparent) 0%, transparent 70%)",
          }}
        />
      </div>

      <header className={`relative z-10 mx-auto w-full max-w-[1120px] ${gutter} pt-[clamp(40px,9vh,96px)]`}>
        <p className="animate-rise font-mono text-[10.5px] tracking-[0.32em] text-muted-foreground uppercase">
          Un archivo personal
        </p>
        <div className="mt-4">
          <TypedTitle />
        </div>
        <div
          className="animate-rise mt-5 flex flex-wrap items-center gap-x-6 gap-y-3"
          style={{ animationDelay: "160ms" }}
        >
          <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase tabular-nums">
            {books.length} {books.length === 1 ? "volumen" : "volúmenes"}
          </p>
          {enabled && (
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="group inline-flex items-center gap-2 rounded-full border border-foreground/15 bg-card/40 px-4 py-2 text-[14px] text-foreground/85 backdrop-blur-sm transition-colors hover:border-primary/45 hover:bg-card/80"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" className="text-primary">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              Recomendame un libro
            </button>
          )}
        </div>
        <div className="animate-rise mt-8" style={{ animationDelay: "260ms" }}>
          <LibraryFilter books={books} onChange={setShown} />
        </div>
      </header>

      <main className="relative pb-2">
        {books.length === 0 ? (
          <div className={`mx-auto max-w-[1120px] ${gutter} py-24`}>
            <p className="font-display text-[1.6rem] text-foreground/70 italic">Todavía no hay libros en el estante.</p>
          </div>
        ) : visible.length ? (
          <div key={shelfKey} className="animate-rise" style={{ animationDelay: shown ? "0ms" : "380ms" }}>
            <Shelf books={visible} label="Mis libros" arrowKeys />
          </div>
        ) : (
          <div className={`mx-auto flex max-w-[1120px] flex-col items-start gap-3 ${gutter} py-20`}>
            <p className="font-display text-[1.7rem] leading-tight text-foreground/75 italic">
              Ningún libro coincide con eso.
            </p>
            <p className="text-[15px] text-muted-foreground">Probá con otras palabras o sacá el filtro de género.</p>
          </div>
        )}
      </main>

      {recommendations.length > 0 && (
        <section aria-labelledby="recommended-title" className="relative pt-2">
          <div className={`mx-auto flex max-w-[1120px] items-baseline justify-between gap-4 ${gutter}`}>
            <h2 id="recommended-title" className="font-display text-[clamp(1.6rem,3vw,2.1rem)] leading-none font-light italic">
              Me recomendaron
            </h2>
            <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase tabular-nums">
              {recommendations.length} {recommendations.length === 1 ? "libro" : "libros"}
            </p>
          </div>
          <Shelf books={recommendations} justAdded={justAdded} label="Libros que me recomendaron" />
        </section>
      )}

      <footer className={`mx-auto max-w-[1120px] ${gutter} pt-10 pb-[max(32px,env(safe-area-inset-bottom,0px))]`}>
        <p className="font-mono text-[10px] leading-relaxed tracking-[0.16em] text-muted-foreground/80 uppercase">
          Lecturas de Goodreads · Tapas y sinopsis de{" "}
          <a href="https://openlibrary.org" className="underline-offset-4 hover:underline" target="_blank" rel="noreferrer">
            Open Library
          </a>
        </p>
      </footer>

      {enabled && (
        <RecommendBookDialog open={dialogOpen} onClose={() => setDialogOpen(false)} onRecommend={recommend} />
      )}
    </div>
  );
}
