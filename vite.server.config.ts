import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/server.ts'),
      formats: ['es'],
      fileName: () => 'server.mjs',
    },
    rollupOptions: {
      external: id => id === 'source-map' || id.startsWith('node:'),
    },
    sourcemap: true,
  },
})
