# La biblioteca de Joaco

Los libros que leí, en un estante 3D que se puede recorrer: pasá el mouse por un lomo para sacarlo un poco, hacé clic para ver la tapa, buscá en lenguaje natural o recomendame un libro.

Hecho a partir de la [guía de carollia99](https://github.com/carollia99/virtual-library-guide) con React, TypeScript, Tailwind y Vite. Se publica solo en GitHub Pages con cada push a `main`.

## Actualizar los libros

1. Exportá la biblioteca desde Goodreads (**My Books → Import and export → Export Library**).
2. Corré `npm run import -- --from ruta/al/goodreads_library_export.csv`.
   El script copia a `data/goodreads.csv` solo las columnas que usa (nunca las reseñas ni las notas privadas), busca cada libro nuevo en Open Library (tapa, año, sinopsis), saca el color del lomo del borde izquierdo de la tapa y reescribe `src/data/books.ts`.
3. Hacé push. El workflow completa lo que falte y publica.

Si no tenés Node a mano, podés reemplazar `data/goodreads.csv` desde la web de GitHub con una exportación a la que le hayas borrado las columnas *My Review* y *Private Notes*: el workflow hace el resto.

- `data/curated.json` guarda las sinopsis en castellano y los géneros elegidos a mano; ganan sobre lo que venga de Open Library. Con `"coverId": 12345` se fuerza una tapa y con `"coverId": null` se saca una que esté mal.
- `data/import-report.txt` lista los libros sin tapa o sin coincidencia.
- Los géneros válidos son seis: Ficción, No ficción, Ciencia ficción, Misterio y suspenso, Fantasía y Romance. Los filtros se arman solos con los que aparezcan.

## Recomendaciones

Las recomendaciones de los visitantes se guardan en Supabase (tabla `recommendations`, creada por `supabase/migrations`). Cualquiera puede leer y agregar; nadie puede editar ni borrar desde la página. Para borrar una, entrá al panel de Supabase → **Table Editor → recommendations**.

## Búsqueda inteligente (opcional)

Sin configuración, la búsqueda ordena por coincidencia de palabras. Para que entienda pedidos como *"algo corto y triste"*:

1. Sacá una clave gratis de Gemini en [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. En Supabase: **Edge Functions → Secrets**, agregá `GEMINI_API_KEY` con esa clave.

La función `library-search` lee el catálogo publicado (`catalogue.json`) y la clave nunca llega al navegador. También acepta `OPENAI_API_KEY` o `ANTHROPIC_API_KEY`.

## Desarrollo

```bash
npm install
npm run dev
```

Las variables públicas de Supabase van en `.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). Sin ellas, el sitio funciona igual pero sin el botón de recomendaciones.
