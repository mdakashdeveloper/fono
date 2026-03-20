import { defineConfig } from 'tsup'

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
  // types — emits types.d.ts; consumed by core/server/client via their own re-exports
  {
    entry:   { types: 'types.ts' },
    format:  ['esm'],
    dts:     { only: true },   // declaration only — no runtime bundle needed
    clean:   true,
    outDir:  'dist',
    target:  'es2022',
    external,
  },
  // core — shared builders + path matching; re-exports everything from types
  {
    entry:   { core: 'core.ts' },
    format:  ['esm'],
    dts:     true,
    clean:   false,
    outDir:  'dist',
    target:  'es2022',
    external,
  },
  // server — Hono app factory + streaming SSR renderer + Vite plugin (Node)
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
  // client — browser hydration + Vue Router SPA + reactive page data
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