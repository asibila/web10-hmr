import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Vite runs in middleware mode inside the NestJS process (see
 * `apps/api/src/main.ts`), so this file only describes the build: the app root
 * is `apps/web`, and `@web10/shared` resolves to TypeScript source so contract
 * edits are picked up without rebuilding the package.
 *
 * There is deliberately no `server.port` or proxy here — the API owns the port.
 */
/** Repo root, two levels up from `apps/web`. */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  // Vite resolves `root` from the process cwd by default, which is the API's
  // folder when it loads this config. Pin it to the web app instead.
  root: fileURLToPath(new URL('.', import.meta.url)),
  // Vite would otherwise pick `<nearest package.json>/node_modules/.vite`,
  // creating a second node_modules in this app. Point it at the hoisted
  // workspace install so the repo keeps exactly one node_modules folder.
  cacheDir: join(repoRoot, 'node_modules', '.vite', 'web'),
  plugins: [react()],
  resolve: {
    alias: {
      '@web10/shared': fileURLToPath(
        new URL('../../packages/shared/src/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
