// ─────────────────────────────────────────────────────────────────────────────
//  client.ts  ·  Browser hydration entry
//
//  boot() hydrates the server-rendered HTML into a Vue SPA.
//  It reads SSR-injected state from window.__VONO_STATE__ so the first
//  paint needs zero network requests.
// ─────────────────────────────────────────────────────────────────────────────

import { boot } from '@netrojs/vono/client'
import { routes } from './app/routes'
import './app/style.css'

boot({
  routes,
  // Warm the SPA data cache on link hover — snappy navigation feel
  prefetchOnHover: true,
})
