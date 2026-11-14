import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// `base: './'` keeps every asset path relative, so the same build runs from a
// domain root, a GitHub Pages sub-path or any static host without changes.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2020',
    sourcemap: true,
    outDir: 'dist',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/navigation/**', 'src/search/**', 'src/i18n/**', 'src/services/qr.ts'],
    },
  },
});
