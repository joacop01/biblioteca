// Public connection details for the optional backend (Supabase). The anon /
// publishable key is meant to ship in the browser: row-level security on the
// `recommendations` table is what keeps it safe. Leave both empty to build the
// site without the "Recomendame un libro" shelf.

export const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
export const SUPABASE_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? "");

export const hasBackend = Boolean(SUPABASE_URL && SUPABASE_KEY);

/** Headers for PostgREST. Legacy anon keys are JWTs and also go in Authorization. */
export function restHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { apikey: SUPABASE_KEY, ...extra };
  if (SUPABASE_KEY.startsWith("eyJ")) headers.Authorization = `Bearer ${SUPABASE_KEY}`;
  return headers;
}
