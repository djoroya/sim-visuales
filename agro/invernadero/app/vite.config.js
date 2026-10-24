import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa: la compilación se sirve desde /sims/invernadero/ en la web.
// portada.html no se publica en la web: es la escena desde la que se graba el bucle del carrusel.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist", assetsDir: "js", rollupOptions: { input: { index: "index.html", portada: "portada.html" } } },
});
