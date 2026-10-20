import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base relativa: la compilación se sirve desde /sims/invernadero/ en la web
export default defineConfig({ plugins: [react()], base: "./", build: { outDir: "dist", assetsDir: "js" } });
