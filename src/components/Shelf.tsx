import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Book } from "../data/books";
import { BookSpine } from "./BookSpine";
import { BookDetail, type Rect } from "./BookDetail";
import { HoverCard } from "./HoverCard";

const GAP = 2;
const LOOP_MIN = 2600;
const MAX_RY = 34;
const STEP = 320;

type SpineState = {
  el: HTMLButtonElement;
  index: number;
  copy: number;
  center: number;
  ry: string;
  far: boolean;
};

type OpenState = {
  index: number;
  copy: number;
  rect: Rect;
  ry: number;
  origin: { x: number; y: number };
  pulled: boolean;
  swap: "next" | "prev" | null;
  seq: number;
};

type Hover = { index: number; copy: number; anchor: { left: number; top: number; width: number } };

type Props = {
  books: Book[];
  label: string;
  justAdded?: string | null;
  arrowKeys?: boolean;
};

const anchorOf = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width };
};

/**
 * The scroll rail. Long rows render three copies and wrap the scroll position
 * so the shelf never ends; each spine turns with its distance from the
 * viewport center, so the row curves away in perspective.
 */
export function Shelf({ books, label, justAdded = null, arrowKeys = false }: Props) {
  const railRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const spines = useRef<SpineState[]>([]);
  const period = useRef(0);
  const raf = useRef(0);
  const initialized = useRef(false);
  const drag = useRef<{ x: number; sl: number; moved: boolean; id: number } | null>(null);
  const suppressClick = useRef(false);
  const tween = useRef<{ from: number; to: number; start: number; raf: number } | null>(null);
  const leaveTimer = useRef<number | undefined>(undefined);
  const quietFocus = useRef(false);

  const [railW, setRailW] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [hover, setHover] = useState<Hover | null>(null);
  const [open, setOpen] = useState<OpenState | null>(null);
  const hoverRef = useRef(hover);
  const openRef = useRef(open);
  hoverRef.current = hover;
  openRef.current = open;

  const rowWidth = useMemo(
    () => books.reduce((sum, b) => sum + b.width, 0) + Math.max(0, books.length - 1) * GAP,
    [books],
  );
  const looped = rowWidth > LOOP_MIN;
  const copies = looped ? 3 : 1;
  const padX = looped ? 0 : Math.max(16, railW * 0.04);
  const overflowing = railW > 0 && (looped || rowWidth + padX * 2 > railW);

  // ---------- geometry ----------

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const els = Array.from(track.querySelectorAll<HTMLButtonElement>("[data-spine]"));
    const prev = new Map(spines.current.map((s) => [s.el, s]));
    spines.current = els.map((el) => {
      const old = prev.get(el);
      return {
        el,
        index: Number(el.dataset.index),
        copy: Number(el.dataset.copy),
        center: el.offsetLeft + el.offsetWidth / 2,
        ry: old?.ry ?? "",
        far: old?.far ?? false,
      };
    });
    const n = books.length;
    period.current = looped && els.length >= 2 * n && n > 0 ? els[n].offsetLeft - els[0].offsetLeft : 0;
  }, [books.length, looped]);

  const shift = (delta: number) => {
    if (drag.current) drag.current.sl += delta;
    if (tween.current) {
      tween.current.from += delta;
      tween.current.to += delta;
    }
  };

  const update = useCallback(() => {
    raf.current = 0;
    const rail = railRef.current;
    if (!rail) return;
    let sl = rail.scrollLeft;
    const p = period.current;
    if (p > 0) {
      if (sl < p * 0.5) {
        rail.scrollLeft = sl + p;
        shift(p);
        sl += p;
      } else if (sl > p * 1.5) {
        rail.scrollLeft = sl - p;
        shift(-p);
        sl -= p;
      }
    }
    const half = rail.clientWidth / 2 || 1;
    const mid = sl + half;
    const reach = rail.clientWidth * 1.3 + 260;
    for (const s of spines.current) {
      const d = s.center - mid;
      if (Math.abs(d) > reach) {
        if (!s.far) {
          s.el.dataset.far = "";
          s.far = true;
        }
        continue;
      }
      if (s.far) {
        delete s.el.dataset.far;
        s.far = false;
      }
      const t = Math.max(-1, Math.min(1, d / half));
      const ry = Math.sign(t) * MAX_RY * Math.pow(Math.abs(t), 1.35);
      const v = ry.toFixed(2);
      if (v !== s.ry) {
        s.el.style.setProperty("--ry", `${v}deg`);
        s.ry = v;
      }
    }
    // a hovered book that the scroll carried away loses its card; the pointer
    // finds the next one when the scroll settles. Keyboard focus keeps it.
    const h = hoverRef.current;
    if (h) {
      const s = spines.current.find((x) => x.index === h.index && x.copy === h.copy);
      if (s) {
        const anchor = anchorOf(s.el);
        if (Math.abs(anchor.left - h.anchor.left) > 0.5 || Math.abs(anchor.top - h.anchor.top) > 0.5) {
          setHover(document.activeElement === s.el ? { ...h, anchor } : null);
        }
      }
    }
  }, []);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(update);
  }, [update]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    setRailW(rail.clientWidth);
    const ro = new ResizeObserver(() => setRailW(rail.clientWidth));
    ro.observe(rail);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    measure();
    const rail = railRef.current;
    if (rail && period.current && !initialized.current) {
      rail.scrollLeft = period.current;
      initialized.current = true;
    }
    update();
  }, [measure, update, books, copies, railW, overflowing]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    rail.addEventListener("scroll", schedule, { passive: true });
    return () => {
      rail.removeEventListener("scroll", schedule);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [schedule]);

  // ---------- motion input ----------

  const stopTween = useCallback(() => {
    if (tween.current) {
      cancelAnimationFrame(tween.current.raf);
      tween.current = null;
    }
  }, []);

  const tweenBy = useCallback((dx: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const base = tween.current ? tween.current.to : rail.scrollLeft;
    let to = base + dx;
    if (!period.current) to = Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, to));
    if (tween.current) cancelAnimationFrame(tween.current.raf);
    const t = { from: rail.scrollLeft, to, start: performance.now(), raf: 0 };
    tween.current = t;
    const step = (time: number) => {
      const cur = tween.current;
      if (!cur) return;
      const progress = Math.min(1, (time - cur.start) / 420);
      const eased = 1 - Math.pow(1 - progress, 3);
      rail.scrollLeft = cur.from + (cur.to - cur.from) * eased;
      if (progress < 1) cur.raf = requestAnimationFrame(step);
      else tween.current = null;
    };
    t.raf = requestAnimationFrame(step);
  }, []);

  // vertical wheel → horizontal travel
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const onWheel = (e: WheelEvent) => {
      if (openRef.current) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = rail.scrollWidth - rail.clientWidth;
      if (max <= 0) return;
      const dy = e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? rail.clientWidth : 1);
      if (!period.current && ((dy < 0 && rail.scrollLeft <= 0) || (dy > 0 && rail.scrollLeft >= max - 1))) return;
      e.preventDefault();
      stopTween();
      if (hoverRef.current) setHover(null);
      rail.scrollLeft += dy;
    };
    rail.addEventListener("wheel", onWheel, { passive: false });
    return () => rail.removeEventListener("wheel", onWheel);
  }, [stopTween]);

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) {
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      setDragging(false);
    }
  }, []);

  const focusNeighbor = useCallback((el: HTMLElement, dir: 1 | -1) => {
    const n = books.length;
    const cur = spines.current.find((s) => s.el === el);
    if (!cur || !n) return;
    let index = cur.index + dir;
    let copy = cur.copy;
    if (index < 0 || index >= n) {
      if (!period.current) return;
      index = (index + n) % n;
      copy = Math.max(0, Math.min(2, copy + dir));
    }
    spines.current.find((s) => s.index === index && s.copy === copy)?.el.focus();
  }, [books.length]);

  useEffect(() => {
    if (!arrowKeys) return;
    const onKey = (e: KeyboardEvent) => {
      if (openRef.current || e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='dialog']")) return;
      if (target?.closest("[data-spine]")) return; // handled by the rail's own roving focus
      e.preventDefault();
      tweenBy(e.key === "ArrowRight" ? STEP : -STEP);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arrowKeys, tweenBy]);

  // ---------- hover ----------

  const onEnter = useCallback((el: HTMLButtonElement, index: number, copy: number) => {
    if (quietFocus.current || drag.current?.moved || openRef.current) return;
    window.clearTimeout(leaveTimer.current);
    setHover({ index, copy, anchor: anchorOf(el) });
  }, []);

  const onLeave = useCallback(() => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHover(null), 90);
  }, []);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  // ---------- pull-out ----------

  const openAt = useCallback(
    (el: HTMLButtonElement, index: number, copy: number, swap: "next" | "prev" | null = null) => {
      const rail = railRef.current;
      if (!rail) return;
      const r = el.getBoundingClientRect();
      const rr = rail.getBoundingClientRect();
      const ry = parseFloat(el.style.getPropertyValue("--ry")) || 0;
      const h = hoverRef.current;
      const pulled = !swap && h?.index === index && h?.copy === copy;
      window.clearTimeout(leaveTimer.current);
      setHover(null);
      setOpen((prev) => ({
        index,
        copy,
        rect: { left: r.left, top: r.top, width: r.width, height: r.height },
        ry,
        origin: { x: rr.left + rr.width * 0.5, y: rr.top + rr.height * 0.65 },
        pulled,
        swap,
        seq: (prev?.seq ?? 0) + 1,
      }));
    },
    [],
  );

  const onOpen = useCallback(
    (el: HTMLButtonElement, index: number, copy: number) => {
      if (suppressClick.current || openRef.current) return;
      openAt(el, index, copy);
    },
    [openAt],
  );

  const go = useCallback(
    (dir: 1 | -1) => {
      const o = openRef.current;
      const rail = railRef.current;
      const n = books.length;
      if (!o || !rail || !n) return;
      let next = o.index + dir;
      if (!period.current && (next < 0 || next >= n)) return;
      next = (next + n) % n;
      const from = spines.current.find((s) => s.index === o.index && s.copy === o.copy);
      const twins = spines.current.filter((s) => s.index === next);
      if (!twins.length) return;
      const closest = (x: number) =>
        twins.reduce((a, b) => (Math.abs(b.center - x) < Math.abs(a.center - x) ? b : a));
      const target = closest(from ? from.center : rail.scrollLeft + rail.clientWidth / 2);
      // re-center the shelf behind the blur so the book can go back to its slot
      rail.scrollLeft = target.center - rail.clientWidth / 2;
      update();
      const settled = closest(rail.scrollLeft + rail.clientWidth / 2);
      openAt(settled.el, next, settled.copy, dir > 0 ? "next" : "prev");
    },
    [books.length, openAt, update],
  );

  const onClosed = useCallback(() => {
    const o = openRef.current;
    setOpen(null);
    if (!o) return;
    const s = spines.current.find((x) => x.index === o.index && x.copy === o.copy);
    if (s) {
      quietFocus.current = true;
      s.el.focus({ preventScroll: true });
      quietFocus.current = false;
    }
  }, []);

  const onPrev = useCallback(() => go(-1), [go]);
  const onNext = useCallback(() => go(1), [go]);

  // ---------- a freshly shelved book ----------

  useEffect(() => {
    if (!justAdded) return;
    const index = books.findIndex((b) => b.id === justAdded);
    if (index < 0) return;
    const id = requestAnimationFrame(() => {
      const rail = railRef.current;
      if (!rail) return;
      const mid = rail.scrollLeft + rail.clientWidth / 2;
      const twin = spines.current
        .filter((s) => s.index === index)
        .sort((a, b) => Math.abs(a.center - mid) - Math.abs(b.center - mid))[0];
      if (!twin) return;
      rail.scrollTo({ left: twin.center - rail.clientWidth / 2, behavior: "smooth" });
      rail.parentElement?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(id);
  }, [justAdded, books]);

  const fade = "linear-gradient(90deg, transparent 0, #000 min(7vw, 96px), #000 calc(100% - min(7vw, 96px)), transparent 100%)";

  return (
    <div className="relative">
      <div
        ref={railRef}
        role="region"
        aria-label={label}
        className={`no-scrollbar relative overflow-x-auto overflow-y-hidden overscroll-x-contain ${
          dragging ? "cursor-grabbing select-none" : "cursor-grab"
        }`}
        style={{
          perspective: "1400px",
          perspectiveOrigin: "50% 65%",
          maskImage: overflowing ? fade : undefined,
          WebkitMaskImage: overflowing ? fade : undefined,
        }}
        onPointerDown={(e) => {
          if (e.pointerType === "touch" || e.button !== 0) return;
          stopTween();
          drag.current = { x: e.clientX, sl: e.currentTarget.scrollLeft, moved: false, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const rail = railRef.current;
          if (!d || !rail) return;
          const dx = e.clientX - d.x;
          if (!d.moved && Math.abs(dx) > 5) {
            d.moved = true;
            setDragging(true);
            setHover(null);
            try {
              rail.setPointerCapture(d.id);
            } catch {
              /* pointer already gone */
            }
          }
          if (d.moved) rail.scrollLeft = d.sl - dx;
        }}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerLeave={() => {
          if (drag.current && !drag.current.moved) drag.current = null;
        }}
        onClickCapture={(e) => {
          if (suppressClick.current) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          const el = e.target as HTMLElement;
          if (!el.closest("[data-spine]")) return;
          e.preventDefault();
          focusNeighbor(el.closest("[data-spine]") as HTMLElement, e.key === "ArrowRight" ? 1 : -1);
        }}
      >
        <div
          ref={trackRef}
          className={`relative flex w-max min-w-full items-end gap-[2px] pt-16 pb-6 preserve-3d ${
            overflowing ? "" : "justify-center"
          }`}
          style={{ paddingInline: padX }}
          onAnimationEnd={() => {
            measure();
            update();
          }}
        >
          {Array.from({ length: copies }, (_, copy) =>
            books.map((book, index) => (
              <BookSpine
                key={`${copy}:${book.id}`}
                book={book}
                index={index}
                copy={copy}
                hovered={hover?.index === index && hover?.copy === copy}
                hidden={open?.index === index && open?.copy === copy}
                shelving={book.id === justAdded}
                onEnter={onEnter}
                onLeave={onLeave}
                onOpen={onOpen}
              />
            )),
          )}
        </div>
      </div>

      {/* the shelf itself: a center line and a soft ground shadow */}
      <div aria-hidden="true" className="pointer-events-none relative -mt-6 h-10">
        <div className="absolute inset-x-[3%] top-0 h-px bg-gradient-to-r from-transparent via-foreground/22 to-transparent" />
        <div className="absolute inset-x-0 top-px h-10 bg-[radial-gradient(50%_100%_at_50%_0%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent)]" />
      </div>

      {hover && !open && books[hover.index] && <HoverCard book={books[hover.index]} anchor={hover.anchor} />}

      {open &&
        books[open.index] &&
        createPortal(
          <BookDetail
            key={open.seq}
            book={books[open.index]}
            index={open.index}
            total={books.length}
            rect={open.rect}
            ry={open.ry}
            origin={open.origin}
            pulled={open.pulled}
            swap={open.swap}
            canPrev={Boolean(period.current) || open.index > 0}
            canNext={Boolean(period.current) || open.index < books.length - 1}
            onPrev={onPrev}
            onNext={onNext}
            onClosed={onClosed}
          />,
          document.body,
        )}
    </div>
  );
}
