// Natural-language search over the shelf ("algo corto y triste", "distopías
// con vigilancia"). The AI key lives only in this function's secrets:
//   GEMINI_API_KEY (free at aistudio.google.com) · OPENAI_API_KEY · ANTHROPIC_API_KEY
// Optional: AI_MODEL to pick a model. Without any key the function answers 503
// and the site quietly keeps its local ranking.

// The published site's catalogue (written by scripts/import-goodreads.ts).
const CATALOGUE_URL = Deno.env.get("CATALOGUE_URL") || "__CATALOGUE_URL__";

const hasKey = () =>
  Boolean(Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENAI_API_KEY") || Deno.env.get("ANTHROPIC_API_KEY"));

type Entry = { id: string; title: string; author: string; year: number; genres?: string[]; blurb: string };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

let cached: { at: number; list: Entry[] } | null = null;
async function catalogue(): Promise<Entry[]> {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.list;
  const res = await fetch(CATALOGUE_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`catalogue ${res.status}`);
  const list = (await res.json()) as Entry[];
  cached = { at: Date.now(), list };
  return list;
}

// best-effort per-IP throttle, per isolate
const hits = new Map<string, { n: number; reset: number }>();
function throttled(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  h.n += 1;
  return h.n > 24;
}

const SYSTEM = [
  "You are the librarian of one person's private bookshelf.",
  "Match the reader's request (any language, usually Spanish) against the catalogue lines, by meaning: themes, mood, setting, genre, era, author, length cues.",
  'Return ONLY a JSON object {"ids":["id1","id2"]} with the ids of the books that fit, best match first, at most 20.',
  'If nothing fits, return {"ids":[]}. Never invent ids.',
].join(" ");

class Upstream extends Error {
  constructor(public status: number) {
    super(`upstream ${status}`);
  }
}

function parseIds(text: string): string[] {
  const match = text.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(match ? match[0] : text) as { ids?: unknown };
    return Array.isArray(parsed.ids) ? parsed.ids.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function rank(query: string, lines: string): Promise<string[] | null> {
  const user = `Catalogue (id :: title :: author :: year :: genres :: blurb):\n${lines}\n\nReader's request: ${query}`;
  const gemini = Deno.env.get("GEMINI_API_KEY");
  const openai = Deno.env.get("OPENAI_API_KEY");
  const anthropic = Deno.env.get("ANTHROPIC_API_KEY");

  if (gemini || openai) {
    const url = gemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${gemini ?? openai}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") ?? (gemini ? "gemini-2.5-flash" : "gpt-4o-mini"),
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0,
      }),
    });
    if (!res.ok) throw new Upstream(res.status);
    const body = await res.json();
    return parseIds(body?.choices?.[0]?.message?.content ?? "");
  }

  if (anthropic) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": anthropic, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("AI_MODEL") ?? "claude-haiku-4-5",
        max_tokens: 500,
        system: SYSTEM,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) throw new Upstream(res.status);
    const body = await res.json();
    const text = (body?.content ?? []).find((c: { type: string }) => c.type === "text")?.text ?? "";
    return parseIds(text);
  }

  return null; // no key configured
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Usá POST." }, 405);
  if (!hasKey() || CATALOGUE_URL.startsWith("__")) {
    return json({ error: "La búsqueda inteligente no está configurada." }, 503);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anon";
  if (throttled(ip)) return json({ error: "Demasiadas búsquedas seguidas. Probá de nuevo en un minuto." }, 429);

  let query = "";
  try {
    query = String(((await req.json()) as { query?: unknown }).query ?? "").trim();
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
  if (query.length < 2 || query.length > 200) return json({ error: "La búsqueda tiene que tener entre 2 y 200 caracteres." }, 400);

  try {
    const books = await catalogue();
    const lines = books
      .map((b) => [b.id, b.title, b.author, b.year || "", (b.genres ?? []).join(", "), (b.blurb ?? "").slice(0, 160)].join(" :: "))
      .join("\n");
    const ids = await rank(query, lines);
    if (ids === null) return json({ error: "La búsqueda inteligente no está configurada." }, 503);
    const known = new Set(books.map((b) => b.id));
    return json({ ids: [...new Set(ids)].filter((id) => known.has(id)).slice(0, 20) });
  } catch (err) {
    if (err instanceof Upstream) {
      if (err.status === 429) return json({ error: "Demasiadas búsquedas seguidas. Probá de nuevo en un minuto." }, 429);
      if (err.status === 402) return json({ error: "Se terminaron los créditos de búsqueda." }, 402);
    }
    console.error(err);
    return json({ error: "La búsqueda no respondió." }, 502);
  }
});
