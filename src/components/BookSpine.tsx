import { memo, useRef, type CSSProperties } from "react";
import type { Book } from "../data/books";
import { parseTitle } from "../lib/bookPhysics";
import { LIFT, PULL, coverDepth, faceFont, finishSheen, finishTexture } from "./bookFaces";

const tint = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

function publisherMark(publisher: string): string {
  const words = publisher
    .replace(/\b(editorial|ediciones|editores|edicions|publishing|publishers|books|press|group|s\.?a\.?)\b/gi, "")
    .split(/[\s/&,.-]+/)
    .filter(Boolean);
  return words
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** The cover as a typeset card, for books without artwork. */
export function TypesetCover({ book }: { book: Book }) {
  const { main } = parseTitle(book.title);
  return (
    <span
      className="absolute inset-0 flex flex-col justify-between px-[9%] py-[11%]"
      style={{ background: book.spine, color: book.ink }}
    >
      <span className="block h-px w-full" style={{ background: book.band ?? book.ink, opacity: 0.8 }} />
      <span className="block">
        <span className="block font-display text-[19px] leading-[1.05] font-normal text-balance">{main}</span>
        <span className="mt-3 block font-sans text-[10px] tracking-[0.16em] uppercase opacity-80">{book.author}</span>
      </span>
      <span className="block h-[3px] w-1/3" style={{ background: book.band ?? book.ink, opacity: 0.85 }} />
    </span>
  );
}

/**
 * The three visible faces of a book: spine, front cover (hinged at the spine's
 * right edge and turned 90° into the shelf) and the page block on top. Shared
 * by the shelf and the pulled-out detail view.
 */
export function BookBody({ book, eager = false }: { book: Book; eager?: boolean }) {
  const { main } = parseTitle(book.title);
  const w = book.width;
  const showAuthor = w >= 44;
  const showMark = w >= 30;
  const mark = showMark ? publisherMark(book.publisher) : "";
  const base = Math.max(9, Math.min(17, Math.round(w * 0.47)));
  const scale = book.face === "serif" ? 1.12 : book.face === "mono" ? 0.84 : 1;
  const titleSize = Math.round(base * scale * (book.caps ? 0.82 : 1) * 10) / 10;
  const band = book.band ?? book.ink;
  const loading = eager ? "eager" : "lazy";
  const depth = coverDepth(book);

  return (
    <>
      {/* spine */}
      <span
        className="absolute inset-0 block overflow-hidden rounded-[1.5px] [backface-visibility:hidden]"
        style={{ background: book.spine }}
      >
        {book.cover && (
          <img
            src={book.cover}
            alt=""
            loading={loading}
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: "0% 50%" }}
          />
        )}
        {/* the cover art settles into the sampled base color */}
        <span
          className="absolute inset-0 block"
          style={{
            background: `linear-gradient(180deg, ${tint(book.spine, 90)} 0%, ${tint(book.spine, 84)} 48%, ${tint(book.spine, 92)} 100%)`,
          }}
        />
        {/* head and foot rules in the accent */}
        <span className="absolute inset-x-0 top-[11px] block h-px" style={{ background: band, opacity: 0.85 }} />
        <span className="absolute inset-x-0 top-[15px] block h-[3px]" style={{ background: band, opacity: 0.9 }} />
        <span className="absolute inset-x-0 bottom-[15px] block h-[3px]" style={{ background: band, opacity: 0.9 }} />
        <span className="absolute inset-x-0 bottom-[11px] block h-px" style={{ background: band, opacity: 0.85 }} />

        {/* lettering */}
        <span
          className={`absolute inset-x-0 flex items-center justify-center gap-[0.9em] overflow-hidden [writing-mode:vertical-rl] ${faceFont[book.face]}`}
          style={{
            top: 26,
            bottom: showMark ? 40 : 26,
            color: book.ink,
            opacity: 1 - book.wear * 0.55,
          }}
        >
          <span
            className="block max-h-full overflow-hidden leading-none text-ellipsis whitespace-nowrap"
            style={{
              fontSize: titleSize,
              fontWeight: book.face === "serif" ? 500 : book.face === "mono" ? 700 : 500,
              letterSpacing: book.caps ? "0.14em" : book.face === "mono" ? "0.02em" : "0.01em",
              textTransform: book.caps ? "uppercase" : undefined,
            }}
          >
            {main}
          </span>
          {showAuthor && (
            <span
              className="block shrink-0 overflow-hidden leading-none text-ellipsis whitespace-nowrap opacity-80"
              style={{
                fontSize: Math.max(8.5, titleSize * 0.62),
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                maxHeight: "40%",
              }}
            >
              {book.author}
            </span>
          )}
        </span>

        {/* publisher mark at the foot */}
        {mark && (
          <span
            className="absolute bottom-[22px] left-1/2 flex h-[13px] min-w-[13px] -translate-x-1/2 items-center justify-center rounded-full border px-[2px] font-mono text-[6.5px] leading-none font-bold"
            style={{ color: book.ink, borderColor: tint(book.ink, 55), opacity: 0.85 - book.wear * 0.4 }}
          >
            {mark}
          </span>
        )}

        {/* material texture and sheen sit over the ink, so the type reads as printed into it */}
        <span className={`pointer-events-none absolute inset-0 block ${finishTexture[book.finish]}`} />
        <span className={`pointer-events-none absolute inset-0 block ${finishSheen[book.finish]}`} />
        <span className="wear pointer-events-none absolute inset-0 block" style={{ opacity: book.wear }} />
        <span className="pointer-events-none absolute inset-0 block rounded-[1.5px] shadow-[inset_1px_0_0_color-mix(in_oklch,var(--light)_26%,transparent),inset_-1px_0_0_color-mix(in_oklch,var(--shade)_32%,transparent),inset_0_1px_0_color-mix(in_oklch,var(--light)_18%,transparent)]" />
      </span>

      {/* front cover, hinged on the spine's right edge */}
      <span
        className="absolute top-0 left-full block h-full overflow-hidden rounded-r-[2px] [backface-visibility:hidden]"
        style={{
          width: depth,
          transformOrigin: "left center",
          transform: "rotateY(90deg)",
          background: book.spine,
        }}
      >
        {book.cover ? (
          <img
            src={book.cover}
            alt=""
            loading={loading}
            decoding="async"
            draggable={false}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <TypesetCover book={book} />
        )}
        {/* the hinge crease and a soft board sheen */}
        <span className="pointer-events-none absolute inset-0 block bg-[linear-gradient(90deg,color-mix(in_oklch,var(--shade)_34%,transparent)_0%,transparent_4%,color-mix(in_oklch,var(--light)_10%,transparent)_7%,transparent_14%,transparent_85%,color-mix(in_oklch,var(--shade)_14%,transparent)_100%)]" />
      </span>

      {/* page block on top */}
      <span
        className="page-edges absolute bottom-full left-0 block [backface-visibility:hidden]"
        style={{
          width: w,
          height: depth,
          transformOrigin: "bottom center",
          transform: "rotateX(78deg)",
        }}
      >
        {book.binding === "hardcover" && (
          <span
            className="headband absolute bottom-0 left-0 block h-[3px] w-full"
            style={{ "--band": band } as CSSProperties}
          />
        )}
      </span>
    </>
  );
}

type SpineProps = {
  book: Book;
  index: number;
  copy: number;
  hovered: boolean;
  hidden: boolean;
  shelving: boolean;
  onEnter: (el: HTMLButtonElement, index: number, copy: number) => void;
  onLeave: () => void;
  onOpen: (el: HTMLButtonElement, index: number, copy: number) => void;
};

/**
 * One book on the shelf. The outer button never transforms, so it stays put
 * as the hover and click target while the inner assembly pulls out of the row.
 */
export const BookSpine = memo(function BookSpine({
  book,
  index,
  copy,
  hovered,
  hidden,
  shelving,
  onEnter,
  onLeave,
  onOpen,
}: SpineProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const { main } = parseTitle(book.title);
  const lean = hovered ? 0 : book.lean;
  const pull = hovered ? PULL : 0;
  const lift = hovered ? LIFT : 0;

  return (
    <button
      ref={ref}
      type="button"
      data-spine=""
      data-index={index}
      data-copy={copy}
      aria-label={`${main}, de ${book.author}`}
      className={`relative block shrink-0 preserve-3d outline-none ${shelving ? "animate-shelve-in" : ""}`}
      style={
        {
          width: book.width,
          height: book.height,
          zIndex: hovered ? 40 : undefined,
          "--spine-w": `${book.width}px`,
        } as CSSProperties
      }
      onPointerEnter={(e) => {
        if (e.pointerType !== "touch" && ref.current) onEnter(ref.current, index, copy);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") onLeave();
      }}
      onFocus={() => ref.current && onEnter(ref.current, index, copy)}
      onBlur={onLeave}
      onClick={() => ref.current && onOpen(ref.current, index, copy)}
    >
      <span
        data-assembly=""
        className="absolute bottom-0 left-0 block preserve-3d"
        style={{
          width: book.width,
          height: book.height,
          transform: "rotateY(var(--ry, 0deg))",
          visibility: hidden ? "hidden" : undefined,
        }}
      >
        <span
          className="absolute inset-0 block preserve-3d transition-transform duration-[650ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{
            transformOrigin: "0% 100%",
            transform: `rotateZ(${lean}deg) translateZ(${pull + book.depth}px) translateY(${lift}px)`,
          }}
        >
          <BookBody book={book} />
        </span>
      </span>
    </button>
  );
});
