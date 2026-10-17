import { defineConfig } from 'vite'

// El visor se publica como modulo ES: la portada lo importa y lo monta.
export default defineConfig({
  build: {
    target: 'es2020',
    lib: {
      entry: 'src/nanohilo.js',
      formats: ['es'],
      fileName: 'nanohilo',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
    reportCompressedSize: true,
  },
})
