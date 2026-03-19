# @netrojs/fnetro

> Full-stack [Hono](https://hono.dev) framework powered by **SolidJS v1.9+** — SSR, SPA, SEO, server & client middleware, TypeScript-first.

[![npm version](https://img.shields.io/npm/v/@netrojs/fnetro)](https://www.npmjs.com/package/@netrojs/fnetro)
[![license](https://img.shields.io/npm/l/@netrojs/fnetro)](./LICENSE)

---

## Table of contents

1. [Quick start](#quick-start)
2. [Installation](#installation)
3. [Project structure](#project-structure)
4. [Core concepts](#core-concepts)
5. [Routing](#routing)
   - [definePage](#definepage)
   - [defineGroup](#definegroup)
   - [defineLayout](#definelayout)
   - [defineApiRoute](#defineapiroute)
6. [Loaders](#loaders)
7. [SEO](#seo)
8. [Middleware](#middleware)
   - [Server middleware](#server-middleware)
   - [Client middleware](#client-middleware)
9. [SolidJS reactivity](#solidjs-reactivity)
10. [Navigation](#navigation)
11. [Asset handling](#asset-handling)
12. [Multi-runtime `serve()`](#multi-runtime-serve)
13. [Vite plugin](#vite-plugin)
14. [TypeScript](#typescript)
15. [API reference](#api-reference)

---

## Quick start

```bash
npm create @netrojs/fnetro@latest my-app
cd my-app
npm install
npm run dev
```

---

## Installation

```bash
# npm
npm install @netrojs/fnetro solid-js hono

# Dev deps (build toolchain)
npm install -D vite vite-plugin-solid @hono/vite-dev-server typescript
```

For Node.js runtime add:
```bash
npm install -D @hono/node-server
```

### Peer dependencies

| Package | Version | Required? |
|---|---|---|
| `solid-js` | `>=1.9.11` | ✅ Always |
| `hono` | `>=4.0.0` | ✅ Always |
| `vite` | `>=5.0.0` | Build only |
| `vite-plugin-solid` | `>=2.11.11` | Build only |

---

## Project structure

```
my-app/
├── app.ts              # Shared FNetro app — used by dev server and server.ts
├── server.ts           # Production server entry — calls serve()
├── client.ts           # Browser entry — calls boot()
├── app/
│   ├── layouts.tsx     # defineLayout() — shared nav/footer shell
│   └── routes/
│       ├── home.tsx    # definePage({ path: '/' })
│       ├── about.tsx   # definePage({ path: '/about' })
│       └── api.ts      # defineApiRoute('/api', ...)
├── public/
│   └── style.css       # Static assets served at /
├── vite.config.ts
└── tsconfig.json
```

---

## Core concepts

FNetro is built on three files:

| File | Purpose |
|---|---|
| `@netrojs/fnetro` (core) | Route builders, SEO types, path matching utilities |
| `@netrojs/fnetro/server` | Hono app factory, SSR renderer, Vite plugin, `serve()` |
| `@netrojs/fnetro/client` | SolidJS hydration, SPA routing, client middleware |

**Data flow:**

```
Request
  → Hono middleware
  → Route match
  → Loader runs (server-side)
  → SolidJS SSR renders HTML
  → HTML + state injected into shell
  → Client hydrates
  → SPA navigation takes over (no full page reloads)
```

---

## Routing

### `definePage`

Define a page with a path, optional loader, optional SEO, and a SolidJS component.

```tsx
// app/routes/home.tsx
import { definePage } from '@netrojs/fnetro'

export default definePage({
  path: '/',

  // Optional server-side data loader
  loader: async (c) => {
    const data = await fetchSomeData()
    return { items: data }
  },

  // Optional SEO (see § SEO)
  seo: {
    title:       'Home — My App',
    description: 'Welcome to my app.',
  },

  // SolidJS component — receives loader data + url + params
  Page({ items, url, params }) {
    return (
      <ul>
        {items.map(item => <li>{item.name}</li>)}
      </ul>
    )
  },
})
```

**Dynamic segments** use `[param]` syntax:

```ts
// matches /posts/hello-world → params.slug = 'hello-world'
definePage({ path: '/posts/[slug]', ... })

// catch-all: matches /files/a/b/c → params.rest = 'a/b/c'
definePage({ path: '/files/[...rest]', ... })
```

---

### `defineGroup`

Group routes under a shared prefix, layout, and middleware.

```ts
import { defineGroup } from '@netrojs/fnetro'
import { requireAuth } from './middleware/auth'
import { AdminLayout } from './layouts'
import dashboard from './routes/admin/dashboard'
import users from './routes/admin/users'

export const adminGroup = defineGroup({
  prefix:     '/admin',
  layout:     AdminLayout,
  middleware: [requireAuth],
  routes:     [dashboard, users],
})
```

Groups can be nested:

```ts
defineGroup({
  prefix: '/api',
  routes: [
    defineGroup({ prefix: '/v1', routes: [v1Routes] }),
    defineGroup({ prefix: '/v2', routes: [v2Routes] }),
  ],
})
```

---

### `defineLayout`

Create a shared layout component that wraps page content.

```tsx
import { defineLayout } from '@netrojs/fnetro'
import { createSignal } from 'solid-js'

const [mobileOpen, setMobileOpen] = createSignal(false)

export const RootLayout = defineLayout(({ children, url, params }) => (
  <div class="app">
    <nav class="navbar">
      <a href="/" class="logo">My App</a>
      <a href="/" class={url === '/' ? 'active' : ''}>Home</a>
      <a href="/about" class={url === '/about' ? 'active' : ''}>About</a>
    </nav>
    <main>{children}</main>
    <footer>© 2025</footer>
  </div>
))
```

**Per-page layout override:**

```ts
// Use a different layout for this page
definePage({ path: '/landing', layout: LandingLayout, Page: ... })

// No layout for this page
definePage({ path: '/embed', layout: false, Page: ... })
```

---

### `defineApiRoute`

Mount raw Hono routes at a path. Full Hono API available.

```ts
import { defineApiRoute } from '@netrojs/fnetro'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const api = defineApiRoute('/api', (app) => {
  app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

  app.get('/users/:id', async (c) => {
    const user = await db.users.find(c.req.param('id'))
    if (!user) return c.json({ error: 'Not found' }, 404)
    return c.json(user)
  })

  app.post(
    '/items',
    zValidator('json', z.object({ name: z.string().min(1) })),
    async (c) => {
      const body = c.req.valid('json')
      const item = await db.items.create(body)
      return c.json(item, 201)
    },
  )

  // WebSocket example
  app.get('/ws', upgradeWebSocket(() => ({
    onMessage(e, ws) { ws.send(`Echo: ${e.data}`) },
  })))
})
```

---

## Loaders

Loaders run **server-side on every request** (both SSR and SPA navigation).
The return value is serialized to JSON and passed to the Page component as props.

```ts
definePage({
  path: '/posts/[slug]',

  loader: async (c) => {
    // c is a Hono Context — access headers, cookies, query params, etc.
    const slug  = c.req.param('slug')
    const token = getCookie(c, 'session')
    const post  = await db.posts.findBySlug(slug)

    if (!post) {
      // Return a 404 response from the loader
      return c.notFound()
    }

    return { post }
  },

  Page({ post }) { ... },
})
```

**Type-safe loaders:**

```ts
interface PostData {
  post:   Post
  author: User
}

definePage<PostData>({
  loader: async (c): Promise<PostData> => ({
    post:   await db.posts.find(c.req.param('id')),
    author: await db.users.find(post.authorId),
  }),
  Page({ post, author }) { /* fully typed */ },
})
```

---

## SEO

Every page can declare `seo` as a **static object** or a **function of loader data**.
App-level `seo` provides defaults; page-level values override them.

```ts
// app.ts — global defaults
createFNetro({
  seo: {
    ogType:      'website',
    ogSiteName:  'My App',
    twitterCard: 'summary_large_image',
    twitterSite: '@myapp',
    robots:      'index, follow',
  },
  routes: [...],
})

// app/routes/post.tsx — page-level (merges with app defaults)
definePage({
  path: '/posts/[slug]',
  loader: async (c) => ({ post: await getPost(c.req.param('slug')) }),

  // Function form — receives loader data and params
  seo: (data, params) => ({
    title:            `${data.post.title} — My Blog`,
    description:      data.post.excerpt,
    canonical:        `https://myapp.com/posts/${params.slug}`,
    ogTitle:          data.post.title,
    ogDescription:    data.post.excerpt,
    ogImage:          data.post.coverImageUrl,
    ogImageWidth:     '1200',
    ogImageHeight:    '630',
    twitterTitle:     data.post.title,
    twitterImage:     data.post.coverImageUrl,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type':    'Article',
      headline:   data.post.title,
      author:     { '@type': 'Person', name: data.post.authorName },
      datePublished: data.post.publishedAt,
    },
  }),
  Page({ post }) { ... },
})
```

### All SEO fields

| Field | HTML output |
|---|---|
| `title` | `<title>` |
| `description` | `<meta name="description">` |
| `keywords` | `<meta name="keywords">` |
| `author` | `<meta name="author">` |
| `robots` | `<meta name="robots">` |
| `canonical` | `<link rel="canonical">` |
| `themeColor` | `<meta name="theme-color">` |
| `ogTitle` | `<meta property="og:title">` |
| `ogDescription` | `<meta property="og:description">` |
| `ogImage` | `<meta property="og:image">` |
| `ogImageAlt` | `<meta property="og:image:alt">` |
| `ogImageWidth` | `<meta property="og:image:width">` |
| `ogImageHeight` | `<meta property="og:image:height">` |
| `ogUrl` | `<meta property="og:url">` |
| `ogType` | `<meta property="og:type">` |
| `ogSiteName` | `<meta property="og:site_name">` |
| `ogLocale` | `<meta property="og:locale">` |
| `twitterCard` | `<meta name="twitter:card">` |
| `twitterSite` | `<meta name="twitter:site">` |
| `twitterCreator` | `<meta name="twitter:creator">` |
| `twitterTitle` | `<meta name="twitter:title">` |
| `twitterDescription` | `<meta name="twitter:description">` |
| `twitterImage` | `<meta name="twitter:image">` |
| `jsonLd` | `<script type="application/ld+json">` |
| `extra` | Custom `<meta>` tags |

**Client-side SEO sync:** On SPA navigation, all `<meta>` tags and `document.title` are updated automatically — no full reload needed.

---

## Middleware

### Server middleware

Hono middleware applied at three levels:

```ts
import { createFNetro } from '@netrojs/fnetro/server'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { bearerAuth } from 'hono/bearer-auth'

// 1. Global — runs before every route
const fnetro = createFNetro({
  middleware: [logger(), cors({ origin: 'https://myapp.com' })],

  routes: [
    // 2. Group-level — runs for all routes in the group
    defineGroup({
      prefix:     '/dashboard',
      middleware: [bearerAuth({ token: process.env.API_KEY! })],
      routes: [
        // 3. Page-level — runs for this route only
        definePage({
          path:       '/settings',
          middleware: [rateLimiter({ max: 10, window: '1m' })],
          Page:       Settings,
        }),
      ],
    }),
  ],
})
```

Middleware can short-circuit by returning a `Response`:

```ts
const requireAuth: HonoMiddleware = async (c, next) => {
  const session = getCookie(c, 'session')
  if (!session) return c.redirect('/login')
  c.set('user', await verifySession(session))
  await next()
}
```

---

### Client middleware

Client middleware runs before every **SPA navigation**. Register with `useClientMiddleware()` **before** calling `boot()`.

```ts
// client.ts
import { boot, useClientMiddleware, navigate } from '@netrojs/fnetro/client'

// Analytics
useClientMiddleware(async (url, next) => {
  await next()
  analytics.track('pageview', { url })
})

// Auth guard
useClientMiddleware(async (url, next) => {
  const protectedPaths = ['/dashboard', '/settings', '/profile']
  const isProtected = protectedPaths.some(p => url.startsWith(p))

  if (isProtected && !isAuthenticated()) {
    await navigate(`/login?redirect=${encodeURIComponent(url)}`)
    return  // cancel original navigation
  }

  await next()
})

// Loading indicator
useClientMiddleware(async (url, next) => {
  showLoadingBar()
  try {
    await next()
  } finally {
    hideLoadingBar()
  }
})

boot({ routes, layout })
```

Middleware runs in registration order. The chain is `mw1 → mw2 → ... → actual navigation`.

---

## SolidJS reactivity

Use SolidJS primitives directly — no FNetro wrappers needed.

```tsx
import { createSignal, createMemo, createEffect, For, Show } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { definePage } from '@netrojs/fnetro'

// Module-level signals persist across SPA navigations
const [count, setCount] = createSignal(0)
const doubled = createMemo(() => count() * 2)

export default definePage({
  path: '/counter',
  Page() {
    // Effects run automatically when signals they read change
    createEffect(() => {
      document.title = `Count: ${count()}`
    })

    return (
      <div>
        <p>Count: {count()}</p>
        <p>Doubled: {doubled()}</p>
        <button onClick={() => setCount(n => n + 1)}>+</button>
      </div>
    )
  },
})
```

**Store example:**

```tsx
import { createStore, produce } from 'solid-js/store'

interface Todo { id: number; text: string; done: boolean }

const [todos, setTodos] = createStore<{ items: Todo[] }>({ items: [] })

function addTodo(text: string) {
  setTodos('items', l => [...l, { id: Date.now(), text, done: false }])
}

function toggleTodo(id: number) {
  setTodos('items', t => t.id === id, produce(t => { t.done = !t.done }))
}

export default definePage({
  path: '/todos',
  Page() {
    return (
      <ul>
        <For each={todos.items}>
          {todo => (
            <li
              style={{ 'text-decoration': todo.done ? 'line-through' : 'none' }}
              onClick={() => toggleTodo(todo.id)}
            >
              {todo.text}
            </li>
          )}
        </For>
      </ul>
    )
  },
})
```

---

## Navigation

### Link-based (automatic)

Any `<a href="...">` pointing to a registered route is intercepted automatically — no special component needed.

```tsx
// These all work — SPA navigation, no full reload
<a href="/about">About</a>
<a href="/posts/hello">Read post</a>

// Opt out with data-no-spa or rel="external"
<a href="/legacy" data-no-spa>Legacy page</a>
<a href="https://external.com" rel="external">External</a>
```

### Programmatic navigation

```ts
import { navigate } from '@netrojs/fnetro/client'

// Push to history (default)
await navigate('/about')

// Replace current history entry
await navigate('/login', { replace: true })

// Prevent scroll-to-top
await navigate('/modal', { scroll: false })
```

### Prefetch

```ts
import { prefetch } from '@netrojs/fnetro/client'

// On hover/focus — warms the loader cache
prefetch('/about')
```

Hover-based prefetching is enabled by default in `boot()`:

```ts
boot({
  prefetchOnHover: true,  // default: true
  routes,
})
```

---

## Asset handling

### Development

`@hono/vite-dev-server` injects Vite's dev client automatically. No asset configuration needed.

### Production

The Vite plugin produces a `manifest.json` alongside the client bundle. The server reads it at startup to inject correct hashed URLs into every HTML response.

```ts
// app.ts — production configuration
createFNetro({
  routes,
  assets: {
    // Path to the directory containing manifest.json
    manifestDir:   'dist/assets',
    // Key in the manifest (usually the entry filename)
    manifestEntry: 'client.ts',
  },
})
```

**Manual asset paths** (edge runtimes / when manifest is unavailable):

```ts
createFNetro({
  assets: {
    scripts: ['/assets/client-abc123.js'],
    styles:  ['/assets/style-def456.css'],
  },
})
```

**Public directory:** Static files in `public/` (images, fonts, robots.txt) are served at the root path by the Node.js `serve()` helper automatically.

---

## Multi-runtime `serve()`

```ts
import { serve } from '@netrojs/fnetro/server'

// Auto-detects the runtime
await serve({ app: fnetro })

// Explicit configuration
await serve({
  app:       fnetro,
  port:      3000,
  hostname:  '0.0.0.0',
  runtime:   'node',       // 'node' | 'bun' | 'deno'
  staticDir: './dist',     // where dist/assets/ lives
})
```

**Edge runtimes** (Cloudflare Workers, Deno Deploy, etc.) — just export the handler:

```ts
// server.ts
import { fnetro } from './app'
export default { fetch: fnetro.handler }
```

---

## Vite plugin

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { fnetroVitePlugin } from '@netrojs/fnetro/vite'
import devServer from '@hono/vite-dev-server'

export default defineConfig({
  plugins: [
    // Handles JSX transform (vite-plugin-solid) + production dual build
    fnetroVitePlugin({
      serverEntry:  'app/server.ts',   // default: 'app/server.ts'
      clientEntry:  'client.ts',       // default: 'client.ts'
      serverOutDir: 'dist/server',     // default: 'dist/server'
      clientOutDir: 'dist/assets',     // default: 'dist/assets'
      // Extra packages to externalize in the server bundle
      serverExternal: ['@myorg/db'],
      // Options forwarded to vite-plugin-solid
      solidOptions: { extensions: ['.mdx'] },
    }),

    // Dev server — serves the app with hot-reload
    devServer({ entry: 'app.ts' }),
  ],
})
```

### Build output

```
dist/
├── server/
│   └── server.js          # SSR server bundle
└── assets/
    ├── manifest.json       # Asset manifest (for hashed URL resolution)
    ├── client-abc123.js    # Hydration bundle
    └── style-def456.css    # CSS (if imported in JS)
```

---

## TypeScript

`tsconfig.json` for a FNetro project:

```json
{
  "compilerOptions": {
    "target":                     "ESNext",
    "module":                     "ESNext",
    "moduleResolution":           "bundler",
    "lib":                        ["ESNext", "DOM"],
    "jsx":                        "preserve",
    "jsxImportSource":            "solid-js",
    "strict":                     true,
    "skipLibCheck":               true,
    "noEmit":                     true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule":          true,
    "isolatedModules":            true,
    "verbatimModuleSyntax":       true
  }
}
```

---

## API reference

### `@netrojs/fnetro` (core)

| Export | Description |
|---|---|
| `definePage(def)` | Define a page route |
| `defineGroup(def)` | Define a route group |
| `defineLayout(Component)` | Define a layout component |
| `defineApiRoute(path, register)` | Define raw Hono sub-routes |
| `resolveRoutes(routes, opts)` | Internal: flatten route tree |
| `compilePath(path)` | Internal: compile a path pattern |
| `matchPath(compiled, pathname)` | Internal: match a compiled path |
| `SPA_HEADER` | `'x-fnetro-spa'` |
| `STATE_KEY` | `'__FNETRO_STATE__'` |
| `PARAMS_KEY` | `'__FNETRO_PARAMS__'` |
| `SEO_KEY` | `'__FNETRO_SEO__'` |

**Types:** `AppConfig`, `PageDef<T>`, `GroupDef`, `LayoutDef`, `ApiRouteDef`, `Route`, `PageProps<T>`, `LayoutProps`, `SEOMeta`, `HonoMiddleware`, `LoaderCtx`, `ClientMiddleware`, `ResolvedRoute`, `CompiledPath`

---

### `@netrojs/fnetro/server`

| Export | Description |
|---|---|
| `createFNetro(config)` | Create the FNetro/Hono app |
| `serve(opts)` | Start server for Node/Bun/Deno |
| `detectRuntime()` | Auto-detect the current JS runtime |
| `fnetroVitePlugin(opts?)` | Vite plugin for SSR + client builds |

**Types:** `FNetroOptions`, `FNetroApp`, `ServeOptions`, `Runtime`, `AssetConfig`, `FNetroPluginOptions`

---

### `@netrojs/fnetro/client`

| Export | Description |
|---|---|
| `boot(options)` | Hydrate SSR HTML and start SPA |
| `navigate(to, opts?)` | Programmatic SPA navigation |
| `prefetch(url)` | Pre-warm the loader cache |
| `useClientMiddleware(fn)` | Register client navigation middleware |

**Types:** `BootOptions`, `NavigateOptions`

---

## License

MIT © [Netro Solutions](https://netrosolutions.com)
