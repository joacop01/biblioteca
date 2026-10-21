import { useCallback, useEffect, useRef, useState } from "react";
import type { Book } from "../data/books";
import { bindingLabel, finishedLabel, parseTitle } from "../lib/bookPhysics";
import { BookBody } from "./BookSpine";
import { LIFT, PULL, coverDepth } from "./bookFaces";
import { Stars } from "./Stars";

export type Rect = { left: number; top: number; width: number; height: number };

type Props = {
  book: Book;
  index: number;
  total: number;
  rect: Rect;
  ry: number;
  origin: { x: number; y: number };
  pulled: boolean;
  swap: "next" | "prev" | null;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClosed: () => void;
};

function useViewport() {
  const read = () => ({ w: window.innerWidth, h: window.innerHeight });
  const [vp, setVp] = useState(read);
  useEffect(() => {
    const on = () => setVp(read());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return vp;
}

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

/** Pose of the book in the shelf, rebuilt in viewport space for the overlay. */
function shelfPose(ry: number, z: number, lift: number) {
  const rad = (ry * Math.PI) / 180;
  return `translate3d(${(z * Math.sin(rad)).toFixed(2)}px, ${lift}px, ${(z * Math.cos(rad)).toFixed(2)}px) scale(1) rotateY(${ry}deg)`;
}

/**
 * The pulled-out book. Starts at the spine's captured shelf pose and swings
 * on its hinge until the front cover faces you, with the shelf blurred behind.
 */
export function BookDetail({
  book,
  index,
  total,
  rect,
  ry,
  origin,
  pulled,
  swap,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onClosed,
}: Props) {
  const vp = useViewport();
  const [out, setOut] = useState(Boolean(swap));
  const [leaving, setLeaving] = useState(false);
  const [swapAnim, setSwapAnim] = useState(swap);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const { main, subtitle, series } = parseTitle(book.title);

  useEffect(() => {
    if (swap) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setOut(true));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [swap]);

  const retract = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setOut(false);
    closeTimer.current = window.setTimeout(onClosed, 620);
  }, [leaving, onClosed]);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        retract();
      } else if (e.key === "ArrowLeft" && canPrev && !leaving) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && canNext && !leaving) {
        e.preventDefault();
        onNext();
      } else if (e.key === "Tab" && dialogRef.current) {
        const focusables = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]"),
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialogRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [retract, canPrev, canNext, leaving, onPrev, onNext]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // ---- where the cover lands ----
  const narrow = vp.w < 720;
  const coverH = narrow ? vp.h * 0.42 : Math.min(vp.h * 0.6, 480);
  const scale = coverH / rect.height;
  const coverW = coverDepth(book) * scale;
  const gap = narrow ? 0 : Math.min(88, Math.max(40, vp.w * 0.05));
  const panelW = narrow ? Math.min(vp.w - 32, 560) : Math.min(440, Math.max(280, vp.w - coverW - gap - 96));
  const totalW = narrow ? coverW : coverW + gap + panelW;
  const coverLeft = (vp.w - totalW) / 2;
  const coverTop = narrow ? Math.max(32, vp.h * 0.07) : (vp.h - coverH) / 2;
  const hingeX = rect.left + rect.width;
  const hingeY = rect.top + rect.height / 2;
  const dx = coverLeft - hingeX;
  const dy = coverTop + coverH / 2 - hingeY;

  const start = pulled ? shelfPose(ry, PULL + book.depth, LIFT) : shelfPose(ry, book.depth, 0);
  const rest = shelfPose(ry, book.depth, 0);
  const end = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0px) scale(${scale.toFixed(4)}) rotateY(-90deg)`;
  const transform = out ? end : leaving ? rest : start;

  const showPanel = out && !leaving;
  const meta = [book.year ? String(book.year) : "", book.publisher, bindingLabel[book.binding]].filter(Boolean);

  const panelStyle: React.CSSProperties = narrow
    ? {
        left: 16,
        right: 16,
        top: coverTop + coverH + 26,
        bottom: 0,
        overflowY: "auto",
        paddingBottom: "max(28px, env(safe-area-inset-bottom, 0px))",
      }
    : {
        left: coverLeft + coverW + gap,
        top: "50%",
        width: panelW,
        maxHeight: "86vh",
        overflowY: "auto",
        translate: "0 -50%",
      };

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="book-detail-title"
      tabIndex={-1}
      className="fixed inset-0 z-50 outline-none"
      style={{ perspective: "1400px", perspectiveOrigin: `${origin.x}px ${origin.y}px` }}
    >
      <div
        className="absolute inset-0 bg-background/70 backdrop-blur-xl"
        style={{ opacity: out ? 1 : 0, transition: "opacity 700ms ease" }}
        onClick={retract}
      />

      <div
        className={`pointer-events-none absolute inset-0 ${
          swapAnim === "next" ? "animate-swap-next" : swapAnim === "prev" ? "animate-swap-prev" : "preserve-3d"
        }`}
        onAnimationEnd={() => setSwapAnim(null)}
      >
        <div
          className="absolute preserve-3d"
          style={{
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            transformOrigin: "100% 50%",
            transform,
            transition: `transform 900ms ${EASE}`,
          }}
        >
          <BookBody book={book} eager />
        </div>
        {/* contact shadow under the cover once it's out */}
        <div
          className="absolute rounded-[50%] bg-shade/30 blur-2xl"
          style={{
            left: coverLeft + coverW * 0.1,
            top: coverTop + coverH * 0.92,
            width: coverW * 0.8,
            height: Math.max(18, coverH * 0.07),
            opacity: showPanel ? 1 : 0,
            transition: "opacity 600ms ease 200ms",
          }}
        />
      </div>

      <section
        key={book.id}
        className={`absolute ${swapAnim ? "animate-fade-in" : ""}`}
        style={{
          ...panelStyle,
          opacity: showPanel ? 1 : 0,
          filter: showPanel ? "none" : "blur(4px)",
          transform: showPanel ? "none" : "translate3d(0, 14px, 0)",
          transition: showPanel
            ? `opacity 700ms ease 260ms, transform 900ms ${EASE} 260ms, filter 700ms ease 260ms`
            : "opacity 200ms ease, transform 300ms ease, filter 200ms ease",
        }}
      >
        <div className="flex items-baseline justify-between gap-4 font-mono text-[11px] text-muted-foreground uppercase">
          <p className="tracking-[0.22em]">{finishedLabel(book)}</p>
          <p className="shrink-0 tracking-[0.08em] tabular-nums">
            {index + 1} / {total}
          </p>
        </div>
        {series && (
          <p className="mt-4 font-mono text-[10.5px] tracking-[0.18em] text-primary uppercase">{series}</p>
        )}
        <h2
          id="book-detail-title"
          className={`${series ? "mt-1.5" : "mt-4"} font-display text-[clamp(2.1rem,4.2vw,3.3rem)] leading-[1.02] font-light text-balance`}
        >
          {main}
        </h2>
        {subtitle && (
          <p className="mt-2 font-display text-[clamp(1.15rem,1.8vw,1.4rem)] leading-snug text-pretty text-foreground/70 italic">
            {subtitle}
          </p>
        )}
        <p className="mt-4 text-[17px] text-foreground/85">{book.author}</p>
        {meta.length > 0 && (
          <p className="mt-1.5 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase tabular-nums">
            {meta.join(" · ")}
          </p>
        )}
        {book.genres && book.genres.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Géneros">
            {book.genres.map((g) => (
              <li
                key={g}
                className="rounded-full border border-foreground/12 px-2.5 py-[3px] text-[12.5px] text-foreground/75"
              >
                {g}
              </li>
            ))}
          </ul>
        )}

        {book.blurb &&
          (book.recommender ? (
            <blockquote className="mt-6 border-l-2 border-primary/50 pl-4 font-display text-[1.3rem] leading-[1.45] text-pretty text-foreground/85 italic">
              {book.blurb}
            </blockquote>
          ) : (
            <p className="mt-6 max-w-[62ch] text-[15.5px] leading-[1.7] text-pretty text-foreground/80">
              {book.blurb}
            </p>
          ))}

        {!book.recommender && (
          <div className="mt-6 flex items-center gap-3">
            {book.rating > 0 ? (
              <>
                <Stars value={book.rating} size={18} />
                <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
                  Mi puntaje · {book.rating}/5
                </span>
              </>
            ) : (
              <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
                Sin puntaje
              </span>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPrev}
            disabled={!canPrev || leaving}
            className="rounded-full border border-foreground/15 px-4 py-2 text-[14px] text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-35"
          >
            <span aria-hidden="true">←</span> Anterior
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext || leaving}
            className="rounded-full border border-foreground/15 px-4 py-2 text-[14px] text-foreground/80 transition-colors hover:bg-foreground/5 disabled:opacity-35"
          >
            Siguiente <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            onClick={retract}
            className="rounded-full bg-foreground px-4 py-2 text-[14px] text-background transition-opacity hover:opacity-85"
          >
            Devolver al estante
          </button>
        </div>
        <p className="mt-4 hidden font-mono text-[10.5px] tracking-[0.12em] text-muted-foreground/80 uppercase sm:block">
          Esc para devolverlo · ← → para recorrer
        </p>
      </section>

      <button
        type="button"
        onClick={retract}
        aria-label="Cerrar"
        className="absolute flex h-10 w-10 items-center justify-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/5 hover:text-foreground"
        style={{
          top: "max(14px, env(safe-area-inset-top, 0px))",
          right: "max(14px, env(safe-area-inset-right, 0px))",
          opacity: showPanel ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
