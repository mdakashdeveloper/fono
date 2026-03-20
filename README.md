# ◈ FNetro

**Full-stack Hono + Vue 3 framework — Streaming SSR · SPA · Code Splitting · SEO · TypeScript**

[![npm](https://img.shields.io/npm/v/@netrojs/fnetro)](https://www.npmjs.com/package/@netrojs/fnetro)
[![license](https://img.shields.io/npm/l/@netrojs/fnetro)](./LICENSE)

---

## What is FNetro?

FNetro connects [Hono](https://hono.dev) (server) and [Vue 3](https://vuejs.org) (UI) into a
single full-stack framework.  You define routes once; FNetro renders them on the server with
streaming SSR and hydrates them in the browser as a SPA — with zero boilerplate.

### Key features

| Feature | Detail |
|---|---|
| **Streaming SSR** | Uses Vue's `renderToWebStream` — `<head>` is flushed immediately while the body streams, giving the browser a head start on CSS and scripts |
| **SPA navigation** | Client-side routing via [Vue Router](https://router.vuejs.org); page data is fetched as JSON from the same Hono handler |
| **Code splitting** | Pass `() => import('./Page.vue')` as `component` — FNetro resolves it before SSR and wraps it in `defineAsyncComponent` on the client |
| **Type-safe loaders** | Loader return types flow through to `usePageData<T>()` with full inference |
| **Full SEO** | Per-page title, description, Open Graph, Twitter Cards, JSON-LD — synced client-side on every navigation |
| **Middleware** | Server (Hono) middleware per-app, per-group, and per-route; client middleware for auth guards, analytics, etc. |
| **Multi-runtime** | Node.js, Bun, Deno, Cloudflare Workers (edge) — same code |

---

## Quick start

```bash
npm create @netrojs/fnetro@latest my-app
cd my-app && npm install && npm run dev
```

---

## Installation (manual)

```bash
npm i @netrojs/fnetro vue vue-router @vue/server-renderer hono
npm i -D vite @vitejs/plugin-vue @hono/vite-dev-server vue-tsc typescript
```

---

## File structure

```
my-app/
├── app.ts               ← Hono app (default export for dev server)
├── server.ts            ← Production server entry
├── client.ts            ← Browser hydration entry
├── vite.config.ts
├── tsconfig.json
└── app/
    ├── routes.ts         ← Route definitions
    ├── layouts/
    │   └── RootLayout.vue
    ├── pages/
    │   ├── home.vue
    │   └── about.vue
    └── style.css
```

---

## Routes

```ts
// app/routes.ts
import { definePage, defineLayout } from '@netrojs/fnetro'
import RootLayout from './layouts/RootLayout.vue'

export const rootLayout = defineLayout(RootLayout)

export const routes = [
  definePage({
    path:   '/posts/[slug]',
    layout: rootLayout,
    seo:    (data, params) => ({ title: `${data.post.title} — My Blog` }),

    loader: async (c) => {
      const slug = c.req.param('slug')
      const post = await db.getPost(slug)
      return { post }
    },

    // () => import() = separate JS chunk (loaded only when needed)
    component: () => import('./pages/post.vue'),
  }),
]
```

### Route groups

```ts
import { defineGroup } from '@netrojs/fnetro'

defineGroup({
  prefix: '/admin',
  middleware: [authMiddleware],
  layout: adminLayout,
  routes: [dashboardRoute, usersRoute],
})
```

### API routes

```ts
import { defineApiRoute } from '@netrojs/fnetro'

export const apiRoutes = defineApiRoute('/api', (app) => {
  app.get('/health', (c) => c.json({ ok: true }))
  app.post('/items', createItem)
})
```

---

## Page components

```vue
<!-- app/pages/post.vue -->
<script setup lang="ts">
import { usePageData } from '@netrojs/fnetro/client'

interface PostData {
  post: { title: string; body: string }
}

const data = usePageData<PostData>()  // reactive, updates on navigation
</script>

<template>
  <article>
    <h1>{{ data.post.title }}</h1>
    <p>{{ data.post.body }}</p>
  </article>
</template>
```

`usePageData<T>()` injects the current page's loader data.  The object is reactive — it
updates automatically when navigating to another page of the same component type.

---

## Layout components

A layout component must render `<slot />` for the page content:

```vue
<!-- app/layouts/RootLayout.vue -->
<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
const route = useRoute()
</script>

<template>
  <div>
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/about">About</RouterLink>
    </nav>
    <main><slot /></main>
  </div>
</template>
```

---

## App + entry files

```ts
// app.ts — Hono instance (used by dev server and production)
import { createFNetro } from '@netrojs/fnetro/server'
import { routes } from './app/routes'

export const fnetro = createFNetro({ routes })
export default fnetro.app  // @hono/vite-dev-server needs the Hono instance
```

```ts
// client.ts — browser entry (hydration + SPA routing)
import { boot } from '@netrojs/fnetro/client'
import { routes } from './app/routes'
import './app/style.css'

boot({ routes })
```

```ts
// server.ts — production server
import { serve } from '@netrojs/fnetro/server'
import { fnetro } from './app'

await serve({ app: fnetro, port: 3000, runtime: 'node' })
```

---

## Vite config

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fnetroVitePlugin } from '@netrojs/fnetro/vite'
import devServer from '@hono/vite-dev-server'

export default defineConfig({
  plugins: [
    vue(),                          // handles .vue transforms
    fnetroVitePlugin(),             // dual-bundle build orchestration
    devServer({ entry: 'app.ts' }), // dev server wires requests to Hono
  ],
})
```

Running `vite build` produces two bundles:
- `dist/server/server.js` — SSR server bundle (ESM)
- `dist/assets/` — client SPA bundle with hashed filenames + `.vite/manifest.json`

---

## Client middleware

```ts
// client.ts
import { boot, useClientMiddleware } from '@netrojs/fnetro/client'
import { routes } from './app/routes'

// Runs before every SPA navigation (must be registered before boot())
useClientMiddleware(async (url, next) => {
  if (!isLoggedIn() && url.startsWith('/dashboard')) {
    location.href = '/login'
    return  // cancel navigation
  }
  await next()
})

boot({ routes })
```

---

## SEO

```ts
definePage({
  path: '/blog/[slug]',
  seo: (data, params) => ({
    title:          `${data.post.title} — My Blog`,
    description:    data.post.excerpt,
    ogTitle:        data.post.title,
    ogImage:        data.post.coverImage,
    twitterCard:    'summary_large_image',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   data.post.title,
    },
  }),
  component: () => import('./pages/blog-post.vue'),
})
```

---

## Exports

| Import path | Contents |
|---|---|
| `@netrojs/fnetro` | Core builders + types (`definePage`, `defineGroup`, …) |
| `@netrojs/fnetro/server` | `createFNetro`, `serve`, `fnetroVitePlugin` |
| `@netrojs/fnetro/client` | `boot`, `usePageData`, `useClientMiddleware`, `syncSEO`, Vue Router re-exports |
| `@netrojs/fnetro/vite` | Alias for server — Vite plugin only |

---

## How streaming SSR works

```
Request arrives at Hono
  ↓
Route matched → middleware chain → loader() runs
  ↓
SEO meta computed → <head> HTML built
  ↓
Response stream opened:
  chunk 1: <!DOCTYPE html><html><head>…</head><body><div id="fnetro-app">
           (browser starts loading CSS + scripts immediately)
  chunk 2..N: Vue body HTML chunks from renderToWebStream()
  chunk last: </div><script>window.__STATE__…</script><script src="client.js">
```

The browser receives and processes `<head>` (CSS, fonts) while Vue is still rendering
the body tree — lower TTFB and better LCP vs buffered `renderToString`.

---

## Supported runtimes

| Runtime | `serve()` option | Notes |
|---|---|---|
| Node.js | `runtime: 'node'` | Uses `@hono/node-server` |
| Bun | `runtime: 'bun'` | Uses `Bun.serve()` |
| Deno | `runtime: 'deno'` | Uses `Deno.serve()` |
| Edge (CF Workers, etc.) | — | Export `fnetro.handler` as the fetch handler |

---

## License

MIT © [Netro Solutions](https://github.com/netrosolutions)
