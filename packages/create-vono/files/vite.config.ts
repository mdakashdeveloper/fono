// ─────────────────────────────────────────────────────────────────────────────
//  vite.config.ts
//
//  Plugin order matters:
//    1. vue()            — transforms .vue SFCs in dev mode and the SSR build
//    2. vonoVitePlugin() — orchestrates the dual production build
//    3. devServer()      — routes dev requests through the Hono app (app.ts)
//
//  Build outputs:
//    dist/server/server.js — SSR bundle (ESM, target node18, top-level await)
//    dist/assets/          — client SPA bundle + .vite/manifest.json
// ─────────────────────────────────────────────────────────────────────────────

import { defineConfig }    from 'vite'
import vue                 from '@vitejs/plugin-vue'
import { vonoVitePlugin }  from '@netrojs/vono/vite'
import devServer           from '@hono/vite-dev-server'

export default defineConfig({
  plugins: [
    // Transforms .vue SFCs in both dev mode and the server SSR build.
    vue(),

    // Dual-bundle build orchestration:
    //   vite build  → dist/server/server.js  (SSR bundle)
    //   closeBundle → dist/assets/…          (client SPA bundle)
    vonoVitePlugin({
      serverEntry:  'server.ts',
      clientEntry:  'client.ts',
      serverOutDir: 'dist/server',
      clientOutDir: 'dist/assets',
    }),

    // Proxies dev requests through the Vono Hono app (app.ts default export).
    // injectClientScript: false — Vono builds and injects the client script
    // itself via buildShell(); allowing the dev-server to inject a second copy
    // would cause a double-hydration error.
    devServer({
      entry:             'app.ts',
      injectClientScript: false,
    }),
  ],

  server: {
    // Prevent Vite from restarting when dist/ is written during a production
    // build that is running in the background.
    watch: { ignored: ['**/dist/**'] },
  },

  optimizeDeps: {
    // Pre-bundle these packages once so Vite doesn't re-transform them on
    // every HMR update during development.
    include: ['vue', 'vue-router'],
  },
})
