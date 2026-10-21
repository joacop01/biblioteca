import { createPortal } from "react-dom";
import type { Book } from "../data/books";
import { bindingLabel, parseTitle } from "../lib/bookPhysics";
import { Stars } from "./Stars";

type Anchor = { left: number; top: number; width: number };

const CARD_W = 248;

/**
 * Floating metadata for the hovered spine. Portaled to <body> so it can float
 * over the search bar; fixed at the spine's top-center and translated up.
 */
export function HoverCard({ book, anchor }: { book: Book; anchor: Anchor }) {
  const { main, series } = parseTitle(book.title);
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const left = Math.min(vw - CARD_W / 2 - 12, Math.max(CARD_W / 2 + 12, anchor.left + anchor.width / 2));
  const top = anchor.top - 14;
  const meta = [book.year ? String(book.year) : "", bindingLabel[book.binding]].filter(Boolean);

  return createPortal(
    <div
      role="tooltip"
      className="pointer-events-none fixed z-[100] w-[248px]"
      style={{ left, top, transform: "translate(-50%, calc(-100% - 52px))" }}
    >
      <div className="animate-card-in rounded-[14px] border border-foreground/10 bg-popover/92 px-[18px] pt-[15px] pb-[16px] text-popover-foreground shadow-[0_22px_48px_-20px_color-mix(in_oklch,var(--shade)_48%,transparent),0_2px_6px_-2px_color-mix(in_oklch,var(--shade)_14%,transparent)] backdrop-blur-md">
        {series && (
          <p className="mb-1.5 truncate font-mono text-[10px] tracking-[0.18em] text-primary uppercase">{series}</p>
        )}
        <p className="line-clamp-3 font-display text-[20px] leading-[1.08] font-normal text-balance">{main}</p>
        <p className="mt-1.5 truncate text-[15px] text-foreground/75">{book.author}</p>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-foreground/10 pt-2.5 text-[14px]">
          <span className="truncate text-[14px] text-muted-foreground tabular-nums">{meta.join(" · ")}</span>
          {book.recommender ? null : book.rating > 0 ? (
            <Stars value={book.rating} size={13} />
          ) : (
            <span className="shrink-0 text-[14px] text-muted-foreground/80 italic">Sin puntaje</span>
          )}
        </div>
        {book.recommender ? (
          <p className="mt-2 text-[14px] text-foreground/70 italic">Recomendado por {book.recommender}</p>
        ) : book.genres?.length ? (
          <p className="mt-2 text-[14px] text-foreground/70">{book.genres.join(" · ")}</p>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
