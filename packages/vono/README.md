# ◈ Vono

**Full-stack Hono + Vue 3 framework — Streaming SSR · SPA · Code Splitting · Type-safe Loaders · SEO · TypeScript**

[![npm](https://img.shields.io/npm/v/@netrojs/vono)](https://www.npmjs.com/package/@netrojs/vono)
[![license](https://img.shields.io/npm/l/@netrojs/vono)](./LICENSE)

---

## Table of contents

- [What is Vono?](#what-is-vono)
- [How it works](#how-it-works)
- [Quick start](#quick-start)
- [Manual installation](#manual-installation)
- [File structure](#file-structure)
- [Routes](#routes)
  - [definePage()](#definepage)
  - [defineGroup()](#definegroup)
  - [defineLayout()](#definelayout)
  - [defineApiRoute()](#defineapiroute)
- [Type-safe loaders](#type-safe-loaders)
  - [InferPageData\<T\>](#inferpagedata)
- [usePageData()](#usepagedata)
- [State hydration & lifecycle hooks](#state-hydration--lifecycle-hooks)
- [SEO](#seo)
- [Middleware](#middleware)
  - [Server middleware](#server-middleware)
  - [Client middleware](#client-middleware)
- [Layouts](#layouts)
- [Dynamic params](#dynamic-params)
- [Code splitting](#code-splitting)
- [SPA navigation & prefetch](#spa-navigation--prefetch)
- [API routes](#api-routes)
- [Production build](#production-build)
- [Multi-runtime deployment](#multi-runtime-deployment)
- [Vite plugin reference](#vite-plugin-reference)
- [API reference](#api-reference)
- [How SSR hydration works internally](#how-ssr-hydration-works-internally)

---

## What is Vono?

Vono is a **file-free, config-driven full-stack framework** that glues [Hono](https://hono.dev) (server) to [Vue 3](https://vuejs.org) (UI). You define your routes once in a plain TypeScript array. Vono:

1. **Renders them on the server** using Vue's streaming `renderToWebStream` — the browser gets `<head>` (CSS, scripts) immediately while the body streams in.
2. **Hydrates them in the browser** as a Vue 3 SPA — subsequent navigations fetch only a small JSON payload and swap the reactive data in-place, no full reload.
3. **Infers types** from your loader all the way through to the component — one definition, zero duplication.

### Feature matrix

| Feature | Detail |
|---|---|
| **Streaming SSR** | `renderToWebStream` — `<head>` is flushed before the body starts, so the browser can parse CSS and begin JS evaluation while Vue is still rendering. Lower TTFB than buffered SSR. |
| **SPA navigation** | Vue Router 4 on the client. Navigations send `x-vono-spa: 1` and receive a small JSON `{ state, seo, params }` payload — no HTML re-render. |
| **Code splitting** | Pass `() => import('./Page.vue')` as `component`. Vono resolves the import before SSR and wraps it in `defineAsyncComponent` on the client for lazy loading. |
| **Type-safe loaders** | `definePage<TData>()` infers `TData` from your loader. `InferPageData<typeof page>` extracts it for use in components. `usePageData<T>()` returns it fully typed and reactive. |
| **Full SEO** | Per-page title, description, Open Graph, Twitter Cards, JSON-LD structured data — injected into `<head>` on SSR and synced via the DOM on SPA navigation. |
| **Server middleware** | Hono `MiddlewareHandler` — applied per-app, per-group (`defineGroup`), or per-route. Ideal for auth, rate limiting, logging. |
| **Client middleware** | `useClientMiddleware()` — runs on SPA navigation before the data fetch. Ideal for auth guards, analytics, scroll restoration. |
| **Route groups** | `defineGroup()` shares a URL prefix, layout, and middleware stack across multiple pages. |
| **API routes** | `defineApiRoute()` co-locates Hono JSON endpoints alongside your page routes — same file, same middleware. |
| **Multi-runtime** | `serve()` auto-detects Node.js, Bun, Deno. Edge runtimes (Cloudflare Workers, Vercel Edge) use `vono.handler` directly. |
| **Zero config** | One Vite plugin (`vonoVitePlugin`) orchestrates both the SSR server bundle and the client SPA bundle. |

---

## How it works

```
Browser request
      │
      ▼
 Hono (server.ts)
      │  matches route
      ▼
 loader(ctx)  ──────────────────────────► typed TData object
      │
      ▼
 renderToWebStream(Vue SSR app)
      │
      ├──► streams <head> immediately  ──► browser parses CSS + scripts
      │
      └──► streams <body> …           ──► browser renders progressive HTML
                                            │
                                      client.ts boots
                                            │
                                      createSSRApp() hydrates DOM
                                            │
                                      window.__VONO_STATE__ seeds
                                      reactive page data (zero fetch)
                                            │
                                      Vue Router takes over navigation
                                            │
                                 SPA nav ──► fetch JSON ──► update reactive data
```

---

## Quick start

```bash
npm create @netrojs/vono@latest my-app
cd my-app
npm install
npm run dev
```

Or with Bun:

```bash
bun create @netrojs/vono@latest my-app
cd my-app
bun install
bun run dev
```

---

## Manual installation

```bash
npm i @netrojs/vono vue vue-router @vue/server-renderer hono
npm i -D vite @vitejs/plugin-vue @hono/vite-dev-server @hono/node-server vue-tsc typescript
```

---

## File structure

```
my-app/
├── app.ts               ← createVono() + default export for dev server
├── server.ts            ← Production server entry (await serve(...))
├── client.ts            ← Browser hydration entry (boot(...))
├── vite.config.ts
├── tsconfig.json
├── global.d.ts          ← Window augmentation for SSR-injected keys
└── app/
    ├── routes.ts         ← All route definitions (pages, groups, APIs)
    ├── layouts/
    │   └── RootLayout.vue
    ├── pages/
    │   ├── home.vue
    │   ├── blog/
    │   │   ├── index.vue
    │   │   └── [slug].vue
    │   └── dashboard/
    │       └── index.vue
    └── style.css
```

---

## Routes

All routes are defined in a plain TypeScript array and passed to `createVono()` and `boot()`.

### `definePage()`

The core building block. Every page is a `definePage()` call.

```ts
import { definePage } from '@netrojs/vono'

export const homePage = definePage({
  // URL path — supports [param] and [...catchAll] syntax
  path: '/',

  // Hono middleware applied only to this route (runs before the loader)
  middleware: [logRequest],

  // Server-side data fetcher — return value is typed and passed to usePageData()
  loader: async (c) => ({
    posts: await db.posts.findMany(),
    user:  c.get('user'),       // access Hono context variables
  }),

  // Static SEO object OR a function that receives (loaderData, params)
  seo: (data, params) => ({
    title:       `${data.posts.length} posts — My Blog`,
    description: 'The latest posts from our blog.',
    ogType:      'website',
  }),

  // Layout override for this specific page
  layout: myLayout,   // or `false` to disable the app-level layout

  // Vue component — use () => import() for automatic code splitting
  component: () => import('./pages/home.vue'),
})

// Export the inferred type for use in components
export type HomeData = InferPageData<typeof homePage>
```

**Loader context** (`LoaderCtx`) is the full Hono `Context` object — you have access to `c.req`, `c.env`, `c.get()` / `c.set()`, `c.redirect()`, response helpers, and anything set by upstream middleware.

### `defineGroup()`

Groups share a URL prefix, a layout, and a middleware stack.

```ts
import { defineGroup } from '@netrojs/vono'

export const dashboardGroup = defineGroup({
  prefix:     '/dashboard',
  layout:     dashboardLayout,
  middleware: [requireAuth],   // applied to every child route
  routes: [
    definePage({ path: '',        component: () => import('./pages/dashboard/index.vue') }),
    definePage({ path: '/posts',  component: () => import('./pages/dashboard/posts.vue') }),
    definePage({ path: '/users',  component: () => import('./pages/dashboard/users.vue') }),
  ],
})
```

- Child paths are concatenated: prefix `/dashboard` + path `/posts` → `/dashboard/posts`.
- Use `path: ''` (empty string) for the index route of a group (`/dashboard`).
- Groups can be nested.

### `defineLayout()`

Wraps a Vue component as a Vono layout. The component must render `<slot />` where the page content goes.

```ts
import { defineLayout } from '@netrojs/vono'
import RootLayout from './layouts/RootLayout.vue'

export const rootLayout = defineLayout(RootLayout)
```

Pass it to `createVono({ layout: rootLayout })` for an app-wide default, to `defineGroup({ layout })` for a section, or directly to `definePage({ layout })` for a single page. Set `layout: false` on a page to opt out of any inherited layout.

### `defineApiRoute()`

Co-locate a Hono JSON API alongside your page routes. The callback receives a Hono sub-app mounted at `path`.

```ts
import { defineApiRoute } from '@netrojs/vono'

export const postsApi = defineApiRoute('/api/posts', (app, globalMiddleware) => {
  app.get('/',       (c) => c.json({ posts: await db.posts.findMany() }))
  app.get('/:slug',  (c) => c.json(await db.posts.findBySlug(c.req.param('slug'))))
  app.post('/',      requireAuth, async (c) => {
    const body = await c.req.json()
    return c.json(await db.posts.create(body), 201)
  })
})
```

API routes are registered on the Hono app **before** the catch-all page handler, so they always take priority.

---

## Type-safe loaders

The `loader` function's return type is inferred automatically:

```ts
export const postPage = definePage({
  path:      '/blog/[slug]',
  loader:    async (c) => {
    const post = await db.findPost(c.req.param('slug'))
    return { post, related: await db.relatedPosts(post.id) }
  },
  component: () => import('./pages/blog/[slug].vue'),
})
```

TypeScript infers `TData = { post: Post; related: Post[] }` from the loader automatically. The full chain is type-safe: server loader → SSR render → `window.__VONO_STATE__` → `usePageData<T>()` in the component.

### `InferPageData<T>`

Extract the loader type from an exported page definition — your **single source of truth**:

```ts
// routes.ts
export const postPage = definePage({ loader: async () => ({ post: ... }), ... })
export type PostData = InferPageData<typeof postPage>
//          ^ { post: Post }  — derived from the loader, never written twice

// pages/blog/[slug].vue
import type { PostData } from '../routes'
const data = usePageData<PostData>()
//    ^ fully typed reactive object
```

This pattern means you never manually maintain a parallel type — change the loader and TypeScript propagates the error to every component immediately.

---

## `usePageData()`

Available inside any component rendered inside a Vono route:

```ts
import { usePageData } from '@netrojs/vono/client'
import type { PostData } from '../routes'

const data = usePageData<PostData>()
// data.post     → typed Post
// data.related  → typed Post[]
```

The returned object is **reactive** — when Vue Router performs a SPA navigation, Vono fetches the new JSON payload and updates the reactive store in-place. Components re-render automatically without being unmounted, preserving scroll position and any local state.

Calling `usePageData()` outside of a component `setup()` throws a clear error.

---

## State hydration & lifecycle hooks

Vono performs **full SSR hydration**. This means:

1. The server renders the complete HTML string and injects loader data as `window.__VONO_STATE__`.
2. `boot()` calls `createSSRApp()` (not `createApp()`), which tells Vue to hydrate the existing DOM rather than re-render from scratch.
3. Vue's reactivity system is activated on the existing DOM nodes — no flicker, no double render.
4. All Vue lifecycle hooks work exactly as expected after hydration:

```vue
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, onBeforeMount } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePageData } from '@netrojs/vono/client'

const data   = usePageData<MyData>()
const route  = useRoute()
const router = useRouter()

// ref / computed / watch — all work as normal
const count   = ref(0)
const doubled = computed(() => count.value * 2)
watch(() => data.title, (t) => document.title = t)

// onMounted fires after hydration on the client (not on the server)
// Safe to access DOM APIs, start timers, attach event listeners
onMounted(() => {
  console.log('Hydrated!', document.title)
})

onUnmounted(() => {
  // Clean up subscriptions, timers, etc.
})
</script>
```

**Key rules:**
- `onMounted` and DOM APIs are **client-only** — they are never called during SSR. This is standard Vue SSR behaviour.
- `ref`, `computed`, `watch`, `provide/inject` all work in both SSR and client contexts.
- `useRoute()` and `useRouter()` work after hydration because `boot()` installs the Vue Router instance into the app before mounting.
- Do not access `window`, `document`, or `localStorage` outside of `onMounted` (or `if (import.meta.env.SSR)` guards) — they are undefined on the server.

---

## SEO

Define SEO per page, either as a static object or as a function that receives the loader data and URL params:

```ts
// Static
definePage({
  seo: {
    title:       'Home — My Site',
    description: 'Welcome to my site.',
    ogTitle:     'Home',
    ogImage:     'https://my-site.com/og/home.png',
    twitterCard: 'summary_large_image',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type':    'WebSite',
      name:       'My Site',
      url:        'https://my-site.com',
    },
  },
  ...
})

// Dynamic — function receives (loaderData, params)
definePage({
  seo: (data, params) => ({
    title:       `${data.post.title} — My Blog`,
    description: data.post.excerpt,
    ogType:      'article',
    ogImage:     `https://my-site.com/og/${params.slug}.png`,
    canonical:   `https://my-site.com/blog/${params.slug}`,
  }),
  ...
})
```

Global defaults are set in `createVono({ seo: { ... } })` and merged with per-page values (page wins on any key they both define).

On SPA navigation, `syncSEO()` is called automatically to update `document.title` and all `<meta>` tags in-place.

**Supported fields:**

| Field | HTML output |
|---|---|
| `title` | `<title>` |
| `description` | `<meta name="description">` |
| `keywords` | `<meta name="keywords">` |
| `author` | `<meta name="author">` |
| `robots` | `<meta name="robots">` |
| `canonical` | `<link rel="canonical">` |
| `themeColor` | `<meta name="theme-color">` |
| `ogTitle`, `ogDescription`, `ogImage`, `ogUrl`, `ogType`, `ogSiteName`, `ogImageAlt` | `<meta property="og:…">` |
| `twitterCard`, `twitterSite`, `twitterTitle`, `twitterDescription`, `twitterImage` | `<meta name="twitter:…">` |
| `jsonLd` | `<script type="application/ld+json">` |

---

## Middleware

### Server middleware

Vono server middleware is a standard Hono `MiddlewareHandler`:

```ts
import type { HonoMiddleware } from '@netrojs/vono'

const requireAuth: HonoMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  if (!token || !verifyToken(token)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  // Pass user to downstream handlers via Hono context
  c.set('user', decodeToken(token))
  await next()
}

const logRequest: HonoMiddleware = async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`${c.req.method} ${c.req.path} → ${Date.now() - start}ms`)
}
```

**Three levels of application:**

```ts
// 1. App-wide (runs before every page and API route)
createVono({ middleware: [logRequest], routes })

// 2. Per group (runs for every route inside the group)
defineGroup({ middleware: [requireAuth], prefix: '/dashboard', routes: [...] })

// 3. Per page (runs only for that specific route)
definePage({ middleware: [rateLimit], path: '/api/expensive', ... })
```

Middleware is executed in order: app → group → route. Return early (without calling `next()`) to short-circuit the chain.

### Client middleware

Runs on every SPA navigation **before** the JSON data fetch:

```ts
import { useClientMiddleware } from '@netrojs/vono/client'

// Call before boot() — typically in client.ts
useClientMiddleware(async (url, next) => {
  // Auth guard — redirect to login if session expired
  if (url.startsWith('/dashboard') && !isLoggedIn()) {
    await navigate('/login')
    return  // don't call next() — cancels the navigation
  }

  // Analytics
  analytics.track('pageview', { url })

  await next()  // proceed with the navigation
})
```

---

## Layouts

A layout is a Vue component that wraps page content via `<slot />`:

```vue
<!-- layouts/RootLayout.vue -->
<script setup lang="ts">
import { RouterLink } from 'vue-router'
</script>

<template>
  <div class="app">
    <nav>
      <RouterLink to="/">Home</RouterLink>
      <RouterLink to="/blog">Blog</RouterLink>
    </nav>
    <main>
      <slot />   <!-- page content renders here -->
    </main>
    <footer>© 2025</footer>
  </div>
</template>
```

Register and apply it:

```ts
// routes.ts
export const rootLayout = defineLayout(RootLayout)

// App-wide default
createVono({ layout: rootLayout, routes })

// Per-section override
defineGroup({ layout: dashboardLayout, prefix: '/dashboard', routes: [...] })

// Per-page override
definePage({ layout: false, ... })  // disables layout for this page
```

---

## Dynamic params

Use bracket syntax in paths. Params are available in `loader`, `seo`, and components via `useRoute()`:

```ts
// Single param
definePage({ path: '/blog/[slug]', loader: (c) => ({ post: db.findPost(c.req.param('slug')) }) })

// Multiple params
definePage({ path: '/user/[id]/post/[postId]', loader: (c) => ({
  user: db.findUser(c.req.param('id')),
  post: db.findPost(c.req.param('postId')),
}) })

// Catch-all (matches /files/a/b/c → params.path = 'a/b/c')
definePage({ path: '/files/[...path]', loader: (c) => ({ path: c.req.param('path') }) })
```

Inside a component:

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'  // re-exported from @netrojs/vono/client
const route = useRoute()
// route.params.slug — string
</script>
```

---

## Code splitting

Every page with `component: () => import('./pages/X.vue')` generates a separate JS chunk. Vono handles the split correctly in both environments:

- **Server (SSR):** `isAsyncLoader()` detects the factory, awaits the import, and renders the resolved component synchronously.
- **Client (hydration):** The current route's chunk is pre-loaded before `app.mount()` to guarantee the client VDOM matches the SSR HTML. All other route chunks are lazy-loaded on demand via `defineAsyncComponent`.

No configuration needed — just use dynamic imports.

---

## SPA navigation & prefetch

After hydration, Vue Router handles all same-origin navigation. Vono's `router.beforeEach` hook intercepts every navigation and:

1. Sends `GET <url>` with `x-vono-spa: 1` header.
2. The server recognises the header and returns `{ state, seo, params }` JSON (skipping SSR entirely).
3. The reactive page data store is updated in-place — components re-render reactively.
4. `syncSEO()` updates all meta tags.

**Prefetch on hover** (enabled by default) warms the fetch cache before the user clicks:

```ts
boot({ routes, prefetchOnHover: true })
```

**Manual prefetch:**

```ts
import { prefetch } from '@netrojs/vono/client'
prefetch('/blog/my-post')
```

---

## API routes

API routes are standard Hono apps mounted at the given path:

```ts
export const usersApi = defineApiRoute('/api/users', (app) => {
  app.get('/',    async (c) => c.json(await db.users.findMany()))
  app.post('/',   requireAuth, async (c) => {
    const body = await c.req.json<{ name: string; email: string }>()
    return c.json(await db.users.create(body), 201)
  })
  app.delete('/:id', requireAuth, async (c) => {
    await db.users.delete(c.req.param('id'))
    return c.body(null, 204)
  })
})
```

The Hono sub-app is mounted **before** the page handler catch-all, so API routes always win. You can call your own API from `loader()` or from the client using `fetch()`.

---

## Production build

```bash
npm run build
```

This runs `vite build` which triggers `vonoVitePlugin`:

1. **SSR bundle** — `dist/server/server.js` (ES module, `target: node18`, top-level await enabled, all dependencies externalised).
2. **Client bundle** — `dist/assets/` (ES module chunks + `.vite/manifest.json` for asset fingerprinting).

```bash
npm run start
# node dist/server/server.js
```

The production server reads the manifest, injects the correct hashed script and CSS URLs, and serves static assets from `dist/assets/`.

### Why `target: 'node18'` matters

The SSR bundle uses `await serve(...)` at the top level. esbuild's default browser targets (`chrome87`, `es2020`, etc.) do not support top-level await, causing the build to fail with:

```
Top-level await is not available in the configured target environment
```

`vonoVitePlugin` explicitly sets `target: 'node18'` for the SSR build, which tells esbuild to emit ES2022+ syntax — including top-level await — in the output.

---

## Multi-runtime deployment

### Node.js

```ts
// server.ts
import { serve } from '@netrojs/vono/server'
import { vono } from './app'

await serve({ app: vono, port: 3000, runtime: 'node' })
```

### Bun

```ts
await serve({ app: vono, port: 3000, runtime: 'bun' })
```

### Deno

```ts
await serve({ app: vono, port: 3000, runtime: 'deno' })
```

### Cloudflare Workers / Edge

```ts
// worker.ts — export the handler; no serve() call
import { vono } from './app'
export default { fetch: vono.handler }
```

### Vercel Edge

```ts
// api/index.ts
import { vono } from '../../app'
export const config = { runtime: 'edge' }
export default vono.handler
```

---

## Vite plugin reference

```ts
// vite.config.ts
import { vonoVitePlugin } from '@netrojs/vono/vite'

vonoVitePlugin({
  serverEntry:    'server.ts',   // default
  clientEntry:    'client.ts',   // default
  serverOutDir:   'dist/server', // default
  clientOutDir:   'dist/assets', // default
  serverExternal: ['pg', 'ioredis'],  // extra packages kept external in SSR bundle
  vueOptions:     { /* @vitejs/plugin-vue options for the client build */ },
})
```

The plugin:
- On `vite build`: configures the SSR server bundle (target `node18`, externals, ESM output).
- In `closeBundle`: triggers a separate `build()` call for the client SPA bundle with manifest enabled.

---

## API reference

### `@netrojs/vono` (core, isomorphic)

| Export | Description |
|---|---|
| `definePage(def)` | Define a page route |
| `defineGroup(def)` | Define a route group |
| `defineLayout(component)` | Wrap a Vue component as a layout |
| `defineApiRoute(path, register)` | Define a Hono API sub-app |
| `compilePath(path)` | Compile a Vono path to a RegExp + keys |
| `matchPath(compiled, pathname)` | Match a pathname against a compiled path |
| `toVueRouterPath(path)` | Convert `[param]` syntax to `:param` syntax |
| `isAsyncLoader(fn)` | Detect an async component loader |
| `InferPageData<T>` | Extract loader data type from a `PageDef` |
| `SPA_HEADER`, `STATE_KEY`, `PARAMS_KEY`, `SEO_KEY`, `DATA_KEY` | Shared constants |

### `@netrojs/vono/server`

| Export | Description |
|---|---|
| `createVono(options)` | Create the Hono app + streaming SSR handler |
| `serve(options)` | Start the server on Node / Bun / Deno |
| `detectRuntime()` | Auto-detect the current JS runtime |
| `vonoVitePlugin(options)` | Vite plugin for dual-bundle production builds |

### `@netrojs/vono/client`

| Export | Description |
|---|---|
| `boot(options)` | Hydrate the SSR HTML and mount the Vue SPA |
| `usePageData<T>()` | Access the current page's loader data (reactive) |
| `useClientMiddleware(fn)` | Register a client-side navigation middleware |
| `prefetch(url)` | Warm the SPA data cache for a URL |
| `syncSEO(seo)` | Imperatively sync SEO meta tags |
| `useRoute()` | Vue Router's `useRoute` (re-exported) |
| `useRouter()` | Vue Router's `useRouter` (re-exported) |
| `RouterLink` | Vue Router's `RouterLink` (re-exported) |

### `@netrojs/vono/vite`

| Export | Description |
|---|---|
| `vonoVitePlugin(options)` | Same as the server export — convenience alias |

---

## How SSR hydration works internally

Understanding this prevents subtle bugs:

**On the server**, for each request Vono:
1. Matches the URL against compiled route patterns.
2. Runs server middleware, then the loader.
3. Creates a **fresh** `createSSRApp()` + `createRouter()` per request — no shared state between requests (critical for correctness in concurrent environments).
4. Initialises `createMemoryHistory()` at the **request URL** before constructing the router. This prevents Vue Router from emitting `[Vue Router warn]: No match found for location with path "/"` — the warning fires when the router performs its startup navigation to the history's initial location (`/`) before any routes match.
5. Awaits `router.isReady()`, then calls `renderToWebStream()` to stream HTML.
6. Injects `window.__VONO_STATE__`, `__VONO_PARAMS__`, and `__VONO_SEO__` as inline `<script>` tags in the `<body>`.

**On the client**, `boot()`:
1. Reads the injected `window.__VONO_STATE__[pathname]` and seeds a module-level reactive store — no network request on first load.
2. Calls `createSSRApp()` (not `createApp()`), which tells Vue to hydrate (adopt) the existing server-rendered DOM.
3. Installs `readonly(reactiveStore)` as `DATA_KEY` into the Vue app via `provide()` — `usePageData()` reads from here.
4. Pre-loads the current route's async component chunk synchronously (before `mount()`) to ensure the client VDOM matches the SSR HTML byte-for-byte, preventing hydration mismatches.
5. Mounts the app — Vue reconciles the virtual DOM against the real DOM without re-rendering anything.
6. On subsequent SPA navigations, `router.beforeEach` fetches JSON, updates the reactive store in-place, and calls `syncSEO()`.
