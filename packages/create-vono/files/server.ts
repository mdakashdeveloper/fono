// ─────────────────────────────────────────────────────────────────────────────
//  server.ts · Production entry point
//
//  Top-level await works here because vonoVitePlugin builds the server bundle
//  with `target: 'node18'`, which enables ES2022 top-level await.
//
//  serve() auto-detects the runtime (Node.js / Bun / Deno) at startup and
//  selects the correct HTTP adapter automatically.  You can override the
//  detection by passing `runtime: 'node' | 'bun' | 'deno'` explicitly.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from '@netrojs/vono/server'
import { vono }  from './app'

await serve({
  app:       vono,
  port:      Number(process.env['PORT'] ?? 3000),
  staticDir: './dist',
})
