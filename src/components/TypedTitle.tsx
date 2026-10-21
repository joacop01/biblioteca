import { useEffect, useState } from "react";

const FULL = "Bienvenidos a mi biblioteca";

/** Types the heading one character every 95ms; the caret pulses once it's done. */
export function TypedTitle() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCount(FULL.length);
      return;
    }
    let n = 0;
    const id = window.setInterval(() => {
      n += 1;
      setCount(n);
      if (n >= FULL.length) window.clearInterval(id);
    }, 95);
    return () => window.clearInterval(id);
  }, []);

  const done = count >= FULL.length;

  return (
    <h1
      aria-label={FULL}
      className="font-display text-[clamp(2.5rem,7.2vw,4.75rem)] leading-[0.98] font-light tracking-[-0.012em] italic"
    >
      <span aria-hidden="true" className="grid">
        {/* invisible full line reserves the final size, so nothing shifts while typing */}
        <span className="invisible col-start-1 row-start-1">{FULL}</span>
        <span className="col-start-1 row-start-1">
          {FULL.slice(0, count)}
          <span
            className={`ml-[0.06em] inline-block h-[0.82em] w-[2px] translate-y-[0.1em] bg-primary/80 align-baseline ${
              done ? "animate-caret" : ""
            }`}
          />
        </span>
      </span>
    </h1>
  );
}
