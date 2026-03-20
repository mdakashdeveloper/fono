// ─────────────────────────────────────────────────────────────────────────────
//  app.ts  ·  Hono app factory — used by dev server and imported by server.ts
//
//  @hono/vite-dev-server requires a Hono instance as the default export.
//  createVono returns { app, handler }; we export both.
// ─────────────────────────────────────────────────────────────────────────────

import { createVono } from '@netrojs/vono/server'
import { routes, NotFoundPage } from './app/routes'

export const vono = createVono({
  routes,

  // Global SEO defaults — merged with per-page overrides (page wins)
  seo: {
    ogType:      'website',
    ogSiteName:  'Vono Demo',
    twitterCard: 'summary_large_image',
    robots:      'index, follow',
  },

  // Custom <html> attributes
  htmlAttrs: { lang: 'en', 'data-theme': 'dark' },

  // Extra <head> HTML injected on every page (e.g. font preloads, analytics)
  head: `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
  `,

  // Rendered for any unmatched URL (server-side 404)
  notFound: NotFoundPage,
})

// Default export: the raw Hono instance — required by @hono/vite-dev-server
export default vono.app
