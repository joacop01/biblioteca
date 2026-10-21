const STAR =
  "M12 2.6l2.83 6.07 6.64.73-4.95 4.5 1.38 6.55L12 17.1l-5.9 3.35 1.38-6.55-4.95-4.5 6.64-.73L12 2.6z";

/** Five stars with fractional fill (Goodreads now allows halves and quarters). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-[3px]" aria-label={`${value} de 5`} role="img">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <svg viewBox="0 0 24 24" width={size} height={size} className="absolute inset-0" aria-hidden="true">
              <path d={STAR} fill="none" stroke="var(--star)" strokeOpacity="0.45" strokeWidth="1.2" />
            </svg>
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
                  <path d={STAR} fill="var(--star)" />
                </svg>
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
