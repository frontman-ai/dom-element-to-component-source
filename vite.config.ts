import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/browser.ts'),
      name: 'DomElementToComponentSource',
      formats: ['es'],
      fileName: () => 'dom-element-to-component-source.es.mjs',
    },
    sourcemap: true
  },
  test: {
    globals: true,
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}']
  }
})
