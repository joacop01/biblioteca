import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// base "./" keeps every asset path relative, so the build works on a
// GitHub Pages project URL (usuario.github.io/repo/) without extra config.
export default defineConfig({
  base: "./",
  plugins: [react(), tailwindcss()],
});
