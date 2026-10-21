-- Visitor recommendations: the only database piece. Public read, public insert
-- with length limits, no update or delete through the public API.

CREATE TABLE public.recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  recommender text NOT NULL,
  note text,
  title text NOT NULL,
  author text NOT NULL,
  cover text NOT NULL DEFAULT '',
  year int NOT NULL DEFAULT 0,
  publisher text NOT NULL DEFAULT '',
  binding text NOT NULL DEFAULT 'paperback',
  finish text NOT NULL DEFAULT 'matte',
  spine text NOT NULL DEFAULT '#584f46',
  band text,
  ink text NOT NULL DEFAULT '#faf7f0',
  face text NOT NULL DEFAULT 'serif',
  caps boolean NOT NULL DEFAULT false,
  width int NOT NULL DEFAULT 30,
  height int NOT NULL DEFAULT 220,
  lean real NOT NULL DEFAULT 0,
  depth real NOT NULL DEFAULT 0,
  wear real NOT NULL DEFAULT 0
);

GRANT SELECT, INSERT ON public.recommendations TO anon;
GRANT SELECT, INSERT ON public.recommendations TO authenticated;
GRANT ALL ON public.recommendations TO service_role;

ALTER TABLE public.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recommendations are publicly readable"
  ON public.recommendations FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Anyone can recommend a book"
  ON public.recommendations FOR INSERT TO anon, authenticated
  WITH CHECK (
    length(trim(recommender)) BETWEEN 1 AND 60
    AND length(title) BETWEEN 1 AND 300
    AND length(author) <= 200
    AND (note IS NULL OR length(note) <= 500)
  );

CREATE INDEX recommendations_created_at_idx ON public.recommendations (created_at DESC);
