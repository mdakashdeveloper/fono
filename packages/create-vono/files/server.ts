// ─────────────────────────────────────────────────────────────────────────────
//  server.ts  ·  Production server entry
//
//  Top-level await is used here because the SSR bundle is built with
//  target: 'node18' by vonoVitePlugin — which enables it in the output.
//  See packages/vono/server.ts → vonoVitePlugin → config() → target.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from '@netrojs/vono/server'
import { vono } from './app'

await serve({
  app:      vono,
  port:     Number(process.env['PORT'] ?? 3000),
  runtime:  'node',
  // Points to your built output folder — serve-static serves /assets/* from here
  staticDir: './dist',
})
