import { defineConfig } from 'tsup'

// All peer-dependencies are external — they must be present in the user's
// project and must NOT be bundled into the dist/ output.
const external = [
  'vue',
  'vue-router',
  '@vue/server-renderer',
  '@vitejs/plugin-vue',
  'hono',
  'vite',
  '@hono/node-server',
  '@hono/node-server/serve-static',
  /^node:/,
]

export default defineConfig([
  // ── types.d.ts ─────────────────────────────────────────────────────────────
  // Declaration-only bundle.  Consumed by all three runtime bundles for their
  // re-exported types.  Built first (clean: true) to reset the dist/ folder.
  {
    entry:  { types: 'types.ts' },
    format: ['esm'],
    dts:    { only: true },
    clean:  true,
    outDir: 'dist',
    target: 'es2022',
    external,
  },

  // ── core.js ────────────────────────────────────────────────────────────────
  // Route builders, path utilities, resolution logic.
  // Tree-shaken by both the server and client bundles.
  {
    entry:  { core: 'core.ts' },
    format: ['esm'],
    dts:    true,
    clean:  false,
    outDir: 'dist',
    target: 'es2022',
    external,
  },

  // ── server.js ──────────────────────────────────────────────────────────────
  // Hono app factory, streaming SSR renderer, serve(), Vite plugin.
  // Platform: node — allows Node.js built-in imports in the output.
  {
    entry:    { server: 'server.ts' },
    format:   ['esm'],
    dts:      true,
    clean:    false,
    outDir:   'dist',
    target:   'es2022',
    platform: 'node',
    external,
  },

  // ── client.js ──────────────────────────────────────────────────────────────
  // Browser hydration, SPA routing, composables, lifecycle re-exports.
  // Platform: browser — tree-shakes Node.js-only code paths.
  {
    entry:    { client: 'client.ts' },
    format:   ['esm'],
    dts:      true,
    clean:    false,
    outDir:   'dist',
    target:   'es2022',
    platform: 'browser',
    external,
  },
])
