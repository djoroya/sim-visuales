import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa: la compilación se sirve desde /sims/pila-sofc/ en la web.
// Dos páginas: el visor del modelo (index.html) y la geometría en 3D (geometria.html).
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", assetsDir: "js", rollupOptions: { input: { index: "index.html", geometria: "geometria.html" } } },
});
