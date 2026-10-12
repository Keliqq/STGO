/// <reference types="vitest/config" />
import { defineConfig } from 'vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  // Относительные пути: dist/ работает из любой папки (GitHub Pages)
  base: './',
  resolve: { tsconfigPaths: true },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
  ],
  worker: { format: 'es' },
  build: {
    // Снапшот данных (src/data/snapshot.json) — отдельный ленивый чанк ~1,7 МБ (144 КБ gzip), это ожидаемо
    chunkSizeWarningLimit: 1800,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Бенчмарк упирается в CPU при параллельных воркерах и флакует по времени — запускается отдельно: npm run bench
    exclude: ['**/node_modules/**', ...(process.argv.some((a) => a.includes('bench')) ? [] : ['**/*.bench.test.ts'])],
    environment: 'node',
  },
})

export default config
