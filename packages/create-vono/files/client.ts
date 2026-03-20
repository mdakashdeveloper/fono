// ─────────────────────────────────────────────────────────────────────────────
//  client.ts · Browser hydration entry point
//
//  boot() hydrates the server-rendered HTML into a fully reactive Vue 3 SPA.
//  The server injects loader data into window.__VONO_STATE__ so the first
//  paint requires zero client-side network requests.
//
//  Add VonoPlugins to install stores (Pinia, etc.) or global router guards.
//  Add client middleware via useClientMiddleware() for auth checks, analytics,
//  or scroll restoration on SPA navigations.
// ─────────────────────────────────────────────────────────────────────────────

import { boot } from '@netrojs/vono/client'
import { routes, rootLayout } from './app/routes'
import './app/style.css'

boot({
  routes,
  layout: rootLayout,

  // plugins: [
  //   ({ app })    => app.use(pinia),
  //   ({ router }) => router.beforeEach(myAuthGuard),
  // ],

  prefetchOnHover: true,
})
