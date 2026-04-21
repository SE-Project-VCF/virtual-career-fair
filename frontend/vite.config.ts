/// <reference types="vitest/config" />
import { cpus } from 'node:os'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cap parallel test workers: many jsdom + userEvent suites in parallel can exceed timeouts on
// busy CPUs (common on Windows and in CI). Vitest defaults to cpu count, which is often too high.
const maxTestWorkers = Math.min(4, cpus().length)

// https://vite.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    maxWorkers: maxTestWorkers,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportOnFailure: true,
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.css',
      ]
    }
  },
})
