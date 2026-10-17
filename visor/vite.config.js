import { defineConfig } from 'vite'

// El visor se publica como módulo ES. Importante: NADA de
// inlineDynamicImports, porque entonces three y Plotly acabarían dentro del
// trozo principal y se perdería la carga diferida (que es justo lo que hace
// que la página pese poco si nadie llega a ver la animación).
export default defineConfig({
  build: {
    target: 'es2020',
    lib: {
      entry: { carga: 'src/carga.js', nanohilo: 'src/nanohilo.js' },
      formats: ['es'],
    },
    rollupOptions: {
      output: { chunkFileNames: '[name]-[hash].js' },
    },
    reportCompressedSize: true,
  },
})
