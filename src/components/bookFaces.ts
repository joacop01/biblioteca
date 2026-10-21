import type { Book } from "../data/books";

/** Front-cover depth in un-scaled spine space: how far a book reaches back into the shelf. */
export const COVER_W = 178;

/**
 * A book's own cover width: COVER_W, narrowed for shorter books so the cover
 * keeps a real book's proportions and the art isn't cropped.
 */
export const coverDepth = (book: Pick<Book, "height">) => Math.min(COVER_W, Math.round(book.height * 0.7));

/** Spine lettering style → Tailwind font utility. */
export const faceFont: Record<Book["face"], string> = {
  serif: "font-display",
  sans: "font-sans",
  mono: "font-mono",
};

/** Cylindrical sheen per surface finish (classes live in styles.css). */
export const finishSheen: Record<Book["finish"], string> = {
  gloss: "sheen-gloss",
  matte: "sheen-matte",
  cloth: "sheen-cloth",
};

export const finishTexture: Record<Book["finish"], string> = {
  gloss: "texture-gloss",
  matte: "texture-matte",
  cloth: "texture-cloth",
};

/** Hover pose: how far a book pulls toward you and lifts out of the row. */
export const PULL = 96;
export const LIFT = -26;
