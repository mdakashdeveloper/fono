# ◈ Vono

**Full-stack Hono + Vue 3 framework — Streaming SSR · SPA · Type-safe Loaders · SEO · Multi-runtime**

[![npm](https://img.shields.io/npm/v/@netrojs/vono)](https://www.npmjs.com/package/@netrojs/vono)
[![license](https://img.shields.io/npm/l/@netrojs/vono)](./LICENSE)

---

## Table of contents

- [What is Vono?](#what-is-vono)
- [Quick start](#quick-start)
- [Manual installation](#manual-installation)
- [Project structure](#project-structure)
- [Core concepts](#core-concepts)
- [Routes](#routes)
  - [definePage()](#definepage)
  - [defineGroup()](#definegroup)
  - [defineLayout()](#definelayout)
  - [defineApiRoute()](#defineapiroute)
- [Type-safe loaders & InferPageData](#type-safe-loaders--inferpagedata)
- [usePageData()](#usepagedata)
- [Composables](#composables)
  - [useParams()](#useparams)
  - [useNavigating()](#usenavigating)
  - [useMeta()](#usemeta)
  - [navigate()](#navigate)
- [Lifecycle hooks](#lifecycle-hooks)
- [SEO](#seo)
- [Middleware](#middleware)
  - [Server middleware](#server-middleware)
  - [Client middleware](#client-middleware)
- [Plugins (boot plugins)](#plugins-boot-plugins)
- [Layouts](#layouts)
- [Dynamic params](#dynamic-params)
- [Code splitting](#code-splitting)
- [SPA navigation & prefetch](#spa-navigation--prefetch)
- [API routes](#api-routes)
- [Error handling](#error-handling)
- [Production build](#production-build)
- [Multi-runtime deployment](#multi-runtime-deployment)
  - [Node.js](#nodejs)
  - [Bun](#bun)
  - [Deno](#deno)
  - [Edge (Cloudflare Workers, Vercel Edge)](#edge-cloudflare-workers-vercel-edge)
- [Vite plugin reference](#vite-plugin-reference)
- [API reference](#api-reference)
- [How it works internally](#how-it-works-internally)

---

## What is Vono?

Vono is a **config-driven full-stack framework** that combines [Hono](https://hono.dev) (server) with [Vue 3](https://vuejs.org) (UI). You define your routes once in a plain TypeScript array. Vono handles the rest:

1. **Renders on the server** using Vue's streaming `renderToWebStream` — the browser gets `<head>` (CSS, scripts) immediately while the component tree streams in.
2. **Hydrates in the browser** as a Vue 3 SPA — subsequent navigations fetch only a small JSON payload and swap the reactive data in-place, no full reload.
3. **Infers types** from your loader all the way through to the component — one definition, zero duplication.

### Feature matrix

| Feature | Detail |
|---|---|
| **Streaming SSR** | `renderToWebStream` — `<head>` is flushed before the body starts so the browser can parse CSS and scripts while Vue renders. |
| **SPA navigation** | Vue Router 4 on the client. Navigations fetch a small `{ state, seo, params }` JSON payload — no full HTML re-render. |
| **Code splitting** | Pass `() => import('./Page.vue')` as `component`. Vono resolves it for SSR and wraps it in `defineAsyncComponent()` on the client. |
| **Type-safe loaders** | `InferPageData<typeof page>` extracts the loader's return type. `usePageData<T>()` returns it fully typed and reactive. |
| **Full SEO** | Title, description, OG, Twitter/X Cards, JSON-LD structured data — injected on SSR and DOM-synced on every SPA navigation. |
| **Server middleware** | Hono `MiddlewareHandler` — per-app, per-group, or per-route. Auth guards, rate limiting, logging. |
| **Client middleware** | `useClientMiddleware()` — runs before every SPA navigation. Auth redirects, analytics, scroll restoration. |
| **Boot plugins** | `VonoPlugin` — runs once during `boot()` to install stores (Pinia, etc.), register global components, or add router guards. |
| **Route groups** | `defineGroup()` shares a URL prefix, layout, and middleware across multiple routes. |
| **API routes** | `defineApiRoute()` co-locates Hono JSON endpoints alongside page routes — same file, same middleware stack. |
| **Suspense support** | `onServerPrefetch` and `async setup()` are fully supported via automatic `<Suspense>` wrapping. |
| **Multi-runtime** | Node.js, Bun, Deno, Cloudflare Workers, Vercel Edge — auto-detected or explicitly configured. |
| **Zero config** | `vonoVitePlugin()` orchestrates both the SSR server bundle and the client SPA bundle from one command. |

---

## Quick start

```bash
npm create @netrojs/vono@latest my-app
cd my-app
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Manual installation

```bash
npm install @netrojs/vono hono vue vue-router @vue/server-renderer
npm install -D vite @vitejs/plugin-vue @hono/vite-dev-server @hono/node-server typescript vue-tsc
```

---

## Project structure

```
my-app/
├── app/
│   ├── layouts/
│   │   └── RootLayout.vue    # Layout components (must render <slot />)
│   ├── pages/
│   │   ├── home.vue
│   │   └── blog/
│   │       └── [slug].vue    # Dynamic segment
│   └── routes.ts             # All route definitions
├── app.ts                    # createVono() — Hono app factory
├── client.ts                 # boot() — browser hydration entry
├── server.ts                 # serve() — production server entry
├── vite.config.ts
└── tsconfig.json
```

---

## Core concepts

### Request lifecycle

```
Browser request
      │
      ▼
Hono catches all routes (app.ts)
      │
      ▼
Route matching (Vono path matcher)
      │
      ▼
Server middleware chain
      │
      ▼
loader(ctx) ──────────────────────► typed TData object
      │
      ▼
renderToWebStream(Vue SSR app + Suspense)
      │                            ▲
      ├──► streams <head>          │  onServerPrefetch hooks awaited here
      │    (CSS, scripts)          │  async setup() awaited here
      │                            │
      └──► streams <body> … ───────┘

Client boots:
  createSSRApp() hydrates DOM
  window.__VONO_STATE__ seeds reactive page data (zero fetch)
  Vue Router takes over navigation

SPA navigation:
  fetch /path  {x-vono-spa: 1}  ──► { state, seo, params } JSON
  updatePageData(state)          ──► reactive re-render
  syncSEO(seo)                   ──► DOM <head> update
```

---

## Routes

All routes are defined in a single TypeScript array. Pass it to both `createVono()` (server) and `boot()` (client).

```typescript
// app/routes.ts
import { definePage, defineGroup, defineLayout, defineApiRoute } from '@netrojs/vono'
import RootLayout from './layouts/RootLayout.vue'

export const rootLayout = defineLayout(RootLayout)

export const routes = [
  homePage,
  blogListPage,
  blogPostPage,
  defineGroup({ ... }),
  defineApiRoute('/api/posts', app => { ... }),
]
```

### definePage()

```typescript
definePage({
  path:       '/blog/[slug]',    // Vono [param] syntax
  layout:     rootLayout,        // override or omit to inherit
  middleware: [authGuard],       // optional server-side middleware
  seo: (data, params) => ({      // static object or function
    title: `${data.post.title} — Blog`,
  }),
  loader: async (c) => {         // runs on the server before every render
    const slug = c.req.param('slug')
    return { post: await fetchPost(slug) }
  },
  component: () => import('./pages/blog/[slug].vue'),  // code-split
})
```

**Loader context `c`** is a Hono [`Context`](https://hono.dev/docs/api/context) — you have access to `c.req`, `c.res`, cookies, headers, environment bindings, etc.

### defineGroup()

Group multiple routes under a shared prefix, layout, and middleware:

```typescript
defineGroup({
  prefix:     '/dashboard',
  layout:     dashboardLayout,
  middleware: [authGuard],      // runs before every route in the group
  routes: [
    definePage({ path: '',         component: () => import('./pages/dashboard/index.vue') }),
    definePage({ path: '/posts',   component: () => import('./pages/dashboard/posts.vue') }),
    definePage({ path: '/settings',component: () => import('./pages/dashboard/settings.vue') }),
  ],
})
```

### defineLayout()

Wraps a Vue component as a Vono layout. The component **must** render `<slot />` where page content will appear.

```typescript
import RootLayout from './layouts/RootLayout.vue'
export const rootLayout = defineLayout(RootLayout)
```

```vue
<!-- layouts/RootLayout.vue -->
<template>
  <header>…</header>
  <main><slot /></main>
  <footer>…</footer>
</template>
```

Set `layout: false` on a page or group to render with no layout:

```typescript
definePage({ path: '/login', layout: false, component: LoginPage })
```

### defineApiRoute()

Co-locate Hono API handlers with your page routes:

```typescript
defineApiRoute('/api/posts', (app) => {
  app.get('/',      (c) => c.json({ posts }))
  app.post('/',     async (c) => {
    const body = await c.req.json()
    // ...
    return c.json(newPost, 201)
  })
  app.delete('/:id', async (c) => {
    // ...
    return c.json({ deleted: true })
  })
})
```

---

## Type-safe loaders & InferPageData

Define the type once — in the loader. Derive it everywhere else.

```typescript
// app/routes.ts
export const postPage = definePage({
  path:      '/blog/[slug]',
  loader:    async (c) => ({
    post:        await fetchPost(c.req.param('slug')),
    relatedPosts: await fetchRelated(c.req.param('slug')),
  }),
  component: () => import('./pages/blog/[slug].vue'),
})

// Export the inferred type — zero duplication
export type PostData = InferPageData<typeof postPage>
// PostData = { post: Post; relatedPosts: Post[] }
```

```typescript
// pages/blog/[slug].vue
import type { PostData } from '../routes'
const data = usePageData<PostData>()
// data.post is typed as Post ✅
// data.relatedPosts is typed as Post[] ✅
```

---

## usePageData()

Access the current page's typed, reactive loader data from any component:

```typescript
import { usePageData } from '@netrojs/vono/client'
import type { HomeData } from '../routes'

const data = usePageData<HomeData>()
// data is readonly, reactive, and fully typed
```

The object updates in-place on every SPA navigation. Reactive derivations (`computed`, `watch`, template bindings) re-render automatically without the component unmounting.

```typescript
const postCount = computed(() => data.posts.length)  // reactive ✅
watch(() => data.user, u => console.log('user changed', u))  // reactive ✅
```

Must be called inside `setup()` or `<script setup>`.

---

## Composables

All composables are importable from `@netrojs/vono/client`.

### useParams()

Typed wrapper around `useRoute().params`:

```typescript
// route: /blog/[slug]
const { slug } = useParams<{ slug: string }>()
```

### useNavigating()

A readonly `Ref<boolean>` that is `true` while an SPA navigation is in flight:

```typescript
const navigating = useNavigating()
// <div v-if="navigating" class="progress-bar" />
```

### useMeta()

Reactively override `<head>` meta from inside any component. Accepts a plain object or a reactive factory:

```typescript
// Static
useMeta({ title: 'My Page', description: 'Hello world' })

// Reactive — re-runs whenever post changes
const post = computed(() => data.post)
useMeta(() => ({
  title:       post.value?.title ?? 'Loading…',
  description: post.value?.excerpt,
  ogImage:     post.value?.coverImage,
}))
```

No-op during SSR — server-side meta is controlled by the loader's `seo` option.

### navigate()

Programmatic navigation usable outside Vue component trees:

```typescript
import { navigate } from '@netrojs/vono/client'

// From an event handler, store action, etc.
await navigate('/dashboard')
await navigate({ path: '/search', query: { q: 'vono' } })
```

Throws if called before `boot()`.

---

## Lifecycle hooks

All Vue 3 lifecycle hooks are re-exported from `@netrojs/vono/client`:

```typescript
import {
  onMounted,
  onBeforeMount,
  onUnmounted,
  onBeforeUnmount,
  onUpdated,
  onBeforeUpdate,
  onActivated,       // inside <KeepAlive>
  onDeactivated,     // inside <KeepAlive>
  onErrorCaptured,   // intercept errors from children
  onServerPrefetch,  // SSR-only async data fetch
  onRenderTracked,   // dev-mode debugging
  onRenderTriggered, // dev-mode debugging
} from '@netrojs/vono/client'
```

**`onServerPrefetch`** — async hook awaited before `renderToString` / `renderToWebStream` completes. Use it to fetch data that cannot go in the loader (e.g. inside a Pinia store):

```vue
<script setup lang="ts">
import { onServerPrefetch } from '@netrojs/vono/client'
import { usePostStore } from '../stores/posts'

const store = usePostStore()

// Runs on the server before the page is streamed
onServerPrefetch(async () => {
  await store.fetchPosts()
})
</script>
```

> **Requirement**: `onServerPrefetch` requires the component tree to be wrapped in `<Suspense>`. Vono adds this wrapper automatically in both `renderPage()` (server) and `boot()` (client), so you do not need to add it yourself.

---

## SEO

### Loader-level SEO (recommended)

Use the `seo` option on `definePage()`:

```typescript
// Static
definePage({
  seo: {
    title:       'Home — My App',
    description: 'The best app ever.',
    ogImage:     'https://myapp.com/og/home.png',
    twitterCard: 'summary_large_image',
  },
  ...
})

// Dynamic (function receives loader output + URL params)
definePage({
  seo: (data, params) => ({
    title:       `${data.post.title} — Blog`,
    description: data.post.excerpt,
    ogImage:     data.post.coverImage,
    canonical:   `https://myapp.com/blog/${params.slug}`,
    jsonLd: {
      '@context':    'https://schema.org',
      '@type':       'BlogPosting',
      headline:      data.post.title,
      datePublished: data.post.date,
    },
  }),
  ...
})
```

### Global SEO defaults

Set defaults in `createVono()` and `boot()`. Per-page values override them:

```typescript
createVono({
  seo: {
    ogSiteName:  'My App',
    ogType:      'website',
    twitterCard: 'summary_large_image',
    robots:      'index, follow',
  },
  ...
})
```

### Component-level SEO

Use `useMeta()` for dynamic meta that depends on client-only state:

```typescript
useMeta(() => ({ title: `${unreadCount.value} notifications — Dashboard` }))
```

### Full SEOMeta reference

```typescript
interface SEOMeta {
  // Core
  title?:              string
  description?:        string
  keywords?:           string
  author?:             string
  robots?:             string
  canonical?:          string
  themeColor?:         string
  // Open Graph
  ogTitle?:            string
  ogDescription?:      string
  ogImage?:            string
  ogImageAlt?:         string
  ogUrl?:              string
  ogType?:             string
  ogSiteName?:         string
  // Twitter / X Cards
  twitterCard?:        'summary' | 'summary_large_image' | 'app' | 'player'
  twitterSite?:        string
  twitterCreator?:     string
  twitterTitle?:       string
  twitterDescription?: string
  twitterImage?:       string
  twitterImageAlt?:    string
  // Structured data
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
}
```

---

## Middleware

### Server middleware

Server middleware uses Hono's standard `MiddlewareHandler` signature. Applied per-app, per-group, or per-route.

```typescript
import type { HonoMiddleware } from '@netrojs/vono'

// Per-route auth guard
const authGuard: HonoMiddleware = async (c, next) => {
  const session = getCookie(c, 'session')
  if (!session) {
    const isSPA = c.req.header('x-vono-spa') === '1'
    return isSPA
      ? c.json({ error: 'Unauthorized' }, 401)
      : c.redirect('/login')
  }
  await next()
}

// Per-app logging
const logger: HonoMiddleware = async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`${c.req.method} ${c.req.path} ${c.res.status} ${Date.now() - start}ms`)
}

createVono({
  middleware: [logger],     // runs on every request
  routes: [
    defineGroup({
      prefix:     '/dashboard',
      middleware: [authGuard],  // runs on every route in the group
      routes: [...],
    }),
    definePage({
      path:       '/admin',
      middleware: [authGuard, adminOnly],  // runs on this route only
      ...
    }),
  ],
})
```

### Client middleware

Client middleware runs on every SPA navigation, before the JSON fetch. Register it before `boot()`:

```typescript
import { useClientMiddleware } from '@netrojs/vono/client'

// Auth redirect
useClientMiddleware(async (to, next) => {
  if (to.startsWith('/dashboard') && !isLoggedIn()) {
    await navigate('/login')
    return  // abort — do not call next()
  }
  await next()
})

// Analytics
useClientMiddleware(async (to, next) => {
  await next()  // wait for navigation to complete
  analytics.pageView(to)
})

boot({ routes })
```

---

## Plugins (boot plugins)

`VonoPlugin` functions run once during `boot()`, after the Vue app and Vue Router are created but before the app is mounted. Use them to install stores, register global components, or add router guards.

```typescript
import { boot }        from '@netrojs/vono/client'
import { createPinia } from 'pinia'
import type { VonoPlugin } from '@netrojs/vono/client'

const piniaPlugin: VonoPlugin = ({ app }) => {
  app.use(createPinia())
}

const routerGuardPlugin: VonoPlugin = ({ router }) => {
  router.beforeEach((to, from, next) => {
    // global guard
    next()
  })
  router.afterEach((to) => {
    analytics.pageView(to.fullPath)
  })
}

boot({
  routes,
  plugins: [piniaPlugin, routerGuardPlugin],
})
```

---

## Dynamic params

Use `[param]` for named segments and `[...param]` for catch-alls:

```typescript
// Single segment
definePage({ path: '/blog/[slug]',  ... })
definePage({ path: '/users/[id]',   ... })

// Catch-all
definePage({ path: '/docs/[...path]', ... })
// matches /docs/getting-started/installation
```

Access params in loaders:

```typescript
loader: async (c) => {
  const slug = c.req.param('slug')     // typed as string
  const path = c.req.param('path')     // typed as string
  return { post: await fetchPost(slug) }
}
```

Access params in components:

```typescript
const { slug } = useParams<{ slug: string }>()
// or
const route = useRoute()
const slug  = route.params.slug as string
```

---

## Code splitting

Pass an async factory instead of a direct component reference to get per-route code splitting automatically:

```typescript
// ✅ Code-split — only loaded when the route is first visited
component: () => import('./pages/blog/[slug].vue')

// ✗ Not split — bundled into the main chunk
import SlugPage from './pages/blog/[slug].vue'
component: SlugPage
```

On the server, Vono resolves the async import before rendering so SSR always outputs the full HTML. On the client, the chunk is lazy-loaded after hydration.

---

## SPA navigation & prefetch

After hydration, all internal navigation is handled by Vue Router without a full page reload. Vono intercepts route changes in `router.beforeEach()`, fetches the JSON payload, updates the reactive store, and syncs the `<head>` meta — all in one guard.

**Prefetch on hover** (default `true`) warms the fetch cache before the user clicks:

```typescript
boot({ routes, prefetchOnHover: true })
```

**Manual prefetch:**

```typescript
import { prefetch } from '@netrojs/vono/client'

prefetch('/blog/my-post')
// or call it in onMounted for a known next page
```

The fetch cache is bounded at 50 entries (LRU eviction) to prevent unbounded memory growth.

---

## API routes

`defineApiRoute()` mounts a Hono sub-app at the given path. It runs independently from the SSR page handler.

```typescript
defineApiRoute('/api/posts', (app) => {
  // GET /api/posts
  app.get('/', (c) => c.json({ posts: POSTS }))

  // GET /api/posts/:slug
  app.get('/:slug', (c) => {
    const post = POSTS.find(p => p.slug === c.req.param('slug'))
    return post ? c.json(post) : c.json({ error: 'Not found' }, 404)
  })

  // POST /api/posts
  app.post('/', async (c) => {
    const body = await c.req.json<{ title: string }>()
    // validate + persist ...
    return c.json(newPost, 201)
  })
})
```

Global app middleware (e.g. auth, rate limiting) is forwarded to every API sub-app automatically.

---

## Error handling

Vono wraps every SSR render in `try/catch`. In development, rendering errors are shown as a styled HTML page with the full stack trace. In production, a plain `500 Internal Server Error` is returned.

To add a custom error page for unmatched routes, pass `notFound` to `createVono()`:

```typescript
import NotFoundPage from './app/pages/404.vue'

createVono({ routes, notFound: NotFoundPage })
```

The `notFound` component is SSR-rendered and served with HTTP `404`.

---

## Production build

```bash
npm run build
# Outputs:
#   dist/server/server.js  — SSR bundle (ESM, Node 18+, top-level await)
#   dist/assets/           — client SPA chunks + .vite/manifest.json
```

```bash
npm start
# Runs: node dist/server/server.js
```

---

## Multi-runtime deployment

`serve()` auto-detects the runtime at startup. You can also set it explicitly.

### Node.js

```typescript
// server.ts
import { serve } from '@netrojs/vono/server'
import { vono }  from './app'

await serve({ app: vono, port: 3000 })
// runtime is auto-detected as 'node'
```

Install: `npm install @hono/node-server`

### Bun

```bash
bun dist/server/server.js
```

Bun's `Bun.serve()` is used automatically. Static files are served via `Bun.file()` — no additional dependencies needed.

```json
// package.json (generated by create-vono for Bun)
{
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

### Deno

```bash
deno run -A dist/server/server.js
```

Deno's `Deno.serve()` is used automatically. Static files are read with `Deno.readFile()`.

### Edge (Cloudflare Workers, Vercel Edge)

Export `vono.handler` directly and configure your platform's entry point to call it:

```typescript
// worker.ts (Cloudflare Workers)
import { createVono } from '@netrojs/vono/server'
import { routes }     from './app/routes'

const vono = createVono({ routes })

export default { fetch: vono.handler }
```

> **Note**: Edge runtimes do not support `serve()`. Use `vono.handler` instead.

---

## Vite plugin reference

```typescript
import { vonoVitePlugin } from '@netrojs/vono/vite'

vonoVitePlugin({
  serverEntry?:    string   // default: 'server.ts'
  clientEntry?:    string   // default: 'client.ts'
  serverOutDir?:   string   // default: 'dist/server'
  clientOutDir?:   string   // default: 'dist/assets'
  serverExternal?: string[] // extra packages external to the server bundle
  vueOptions?:     object   // forwarded to @vitejs/plugin-vue (client build only)
})
```

Plugin order in `vite.config.ts` **must** be:

```typescript
plugins: [
  vue(),            // 1. transforms .vue SFCs
  vonoVitePlugin(), // 2. orchestrates the dual build
  devServer({ entry: 'app.ts', injectClientScript: false }), // 3. dev proxy
]
```

---

## API reference

### `@netrojs/vono` (core)

| Export | Description |
|---|---|
| `definePage(def)` | Define a page route |
| `defineGroup(def)` | Define a route group |
| `defineLayout(component)` | Wrap a Vue component as a layout |
| `defineApiRoute(path, register)` | Define a Hono API route |
| `compilePath(path)` | Compile a Vono path to `{ re, keys }` |
| `matchPath(cp, pathname)` | Match a compiled path against a URL |
| `toVueRouterPath(path)` | Convert Vono `[param]` syntax to Vue Router `:param` syntax |
| `resolveRoutes(routes, opts)` | Flatten the routes tree into pages and APIs |
| `isAsyncLoader(value)` | Return `true` if `value` is an async component factory |
| `SPA_HEADER` | `'x-vono-spa'` |
| `STATE_KEY` | `'__VONO_STATE__'` |
| `SEO_KEY` | `'__VONO_SEO__'` |
| `DATA_KEY` | `Symbol.for('vono:data')` |

### `@netrojs/vono/server`

| Export | Description |
|---|---|
| `createVono(config)` | Create the Vono Hono app — returns `{ app, handler }` |
| `serve(opts)` | Start the HTTP server (auto-detects runtime) |
| `detectRuntime()` | Return `'bun' \| 'deno' \| 'node' \| 'edge'` |
| `vonoVitePlugin(opts)` | Vite plugin for dual-bundle production build |

### `@netrojs/vono/client`

| Export | Description |
|---|---|
| `boot(options)` | Hydrate and boot the Vue SPA |
| `usePageData<T>()` | Reactive, typed page loader data |
| `useParams<T>()` | Typed URL params |
| `useNavigating()` | `Readonly<Ref<boolean>>` — true during SPA navigation |
| `useMeta(seo)` | Reactively override `<head>` meta |
| `navigate(to)` | Programmatic navigation |
| `prefetch(url)` | Warm the SPA data cache |
| `syncSEO(seo)` | Manually sync SEO meta to the DOM |
| `useClientMiddleware(mw)` | Register a client navigation middleware |
| All Vue lifecycle hooks | `onMounted`, `onServerPrefetch`, etc. |
| Vue reactivity | `ref`, `reactive`, `computed`, `watch`, `watchEffect`, `nextTick` |
| Vue Router | `useRoute`, `useRouter`, `RouterLink`, `RouterView` |

---

## How it works internally

### Dev mode (`bun run dev` / `npm run dev`)

1. Vite starts in dev mode with `@hono/vite-dev-server` proxying all requests to the Hono app (`app.ts`).
2. For each page request, Vono calls `renderToString()` (buffered, not streaming) because Vite's Connect pipeline cannot flush a `ReadableStream`. The buffered string is returned via `c.html()`.
3. The client entry (`client.ts`) is served as a Vite dev module — HMR is fully functional.

### Production (`npm run build`)

1. `vite build` runs with `vonoVitePlugin` active.
2. The plugin sets `build.ssr = 'server.ts'` and `target = 'node18'`, producing `dist/server/server.js` — an ESM bundle with top-level await enabled.
3. In the `closeBundle` hook, the plugin calls `build()` again for the client entry, producing `dist/assets/` with a `.vite/manifest.json`.
4. `serve()` reads the manifest and injects the hashed asset URLs into every SSR HTML shell.

### SSR hydration safety

- A **fresh Vue app + router** is created for every request to prevent cross-request state pollution (Vue SSR best practice).
- The component tree is wrapped in `<Suspense>` to enable `onServerPrefetch` and `async setup()`.
- Memory history is initialised at the request URL **before** the router is created, eliminating Vue Router's "No match found for '/'" startup warning on non-root routes.
- The entire handler is wrapped in `try/catch`. Errors always produce a valid HTTP response — in dev with a full stack trace, in production with a plain 500.

### Client hydration

- `createSSRApp()` is used instead of `createApp()` so Vue hydrates existing DOM rather than re-rendering.
- The current route's async chunk is pre-loaded before `app.mount()` to ensure the client VDOM matches the SSR HTML.
- The `<Suspense>` wrapper in `boot()` mirrors the server's `renderPage()`, preventing hydration mismatches on pages with `async setup()`.
- Reactive page data is stored in a single module-level `reactive({})` object that is updated in-place on each navigation, ensuring computed values and watchers stay live across routes.

---

## License

MIT © [Netro Solutions](https://netrosolutions.com)
