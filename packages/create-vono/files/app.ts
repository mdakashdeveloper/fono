// ─────────────────────────────────────────────────────────────────────────────
//  app.ts · Shared Hono app factory
//
//  Used by:
//    • @hono/vite-dev-server (default export → Hono instance)
//    • server.ts (named export → VonoApp for serve())
//
//  createVono() returns { app, handler }:
//    app     — the Hono instance; attach extra routes or middleware here
//    handler — WinterCG fetch handler for edge runtimes (Cloudflare, etc.)
// ─────────────────────────────────────────────────────────────────────────────

import { createVono } from '@netrojs/vono/server'
import { routes, rootLayout, NotFoundPage } from './app/routes'

export const vono = createVono({
  routes,
  layout: rootLayout,
  notFound: NotFoundPage,

  // Global SEO defaults — per-page seo options are merged on top of these.
  seo: {
    ogType:      'website',
    ogSiteName:  'Vono Demo',
    twitterCard: 'summary_large_image',
    robots:      'index, follow',
  },

  htmlAttrs: { lang: 'en', 'data-theme': 'dark' },

  head: `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  `,
})

// Default export: the raw Hono instance — required by @hono/vite-dev-server.
export default vono.app
