import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vitest/config';

/**
 * Fills public/sw.js with the files this build produced, so that the very
 * first visit is already usable offline (not only the second one).
 */
function precache(): Plugin {
  let outDir = 'dist';
  return {
    name: 'darbak-precache',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const path = join(dir, name);
          if (statSync(path).isDirectory()) walk(path);
          else files.push(relative(outDir, path).split('\\').join('/'));
        }
      };
      walk(outDir);

      const urls = files
        .filter((file) => file !== 'sw.js' && !file.endsWith('.map') && !file.startsWith('voice/'))
        .sort();
      const hash = createHash('sha256');
      for (const file of urls) hash.update(file).update(readFileSync(join(outDir, file)));
      const build = hash.digest('hex').slice(0, 10);

      const target = join(outDir, 'sw.js');
      const source = readFileSync(target, 'utf8');
      const list = JSON.stringify(['./', ...urls.map((file) => `./${file}`)]);
      const filled = source
        .replace('__BUILD_ID__', build)
        .replace(/\/\*__PRECACHE__\*\/\s*\[[^\]]*\]/, list);
      if (filled === source) throw new Error('darbak-precache: sw.js has no placeholders to fill');
      writeFileSync(target, filled);
    },
  };
}

/**
 * A strict Content-Security-Policy for the built site: scripts, styles, fonts
 * and data only from the site itself, nothing embeddable, no plug-ins. It is a
 * <meta> tag because static hosts such as GitHub Pages cannot send headers.
 * Not applied in development, where the dev server needs inline scripts.
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'", // React sets inline style attributes
    "img-src 'self' data: blob:", // QR codes and the photo of a sign
    "media-src 'self' blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'darbak-csp',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

// `base: './'` keeps every asset path relative, so the same build runs from a
// domain root, a GitHub Pages sub-path or any static host without changes.
export default defineConfig({
  base: './',
  plugins: [react(), contentSecurityPolicy(), precache()],
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
      include: ['src/navigation/**', 'src/search/**', 'src/i18n/**', 'src/services/**'],
      exclude: ['src/**/*.test.ts'],
    },
  },
});
