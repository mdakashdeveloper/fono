# ⬡ FNetro

> Full-stack [Hono](https://hono.dev) framework — SSR, SPA, Vue-like reactivity, route groups, middleware and raw API routes in **3 files**.

[![npm](https://img.shields.io/npm/v/@netrojs/fnetro?color=6b8cff&label=fnetro)](https://www.npmjs.com/package/@netrojs/fnetro)
[![npm](https://img.shields.io/npm/v/@netrojs/create-fnetro?color=3ecf8e&label=create-fnetro)](https://www.npmjs.com/package/@netrojs/create-fnetro)
[![CI](https://github.com/netrosolutions/fnetro/actions/workflows/ci.yml/badge.svg)](https://github.com/netrosolutions/fnetro/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Table of contents

- [Quick start](#quick-start)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Core concepts](#core-concepts)
  - [definePage](#definepage)
  - [defineGroup](#definegroup)
  - [defineLayout](#definelayout)
  - [defineApiRoute](#defineapiroute)
  - [defineMiddleware](#definemiddleware)
- [Reactivity](#reactivity)
  - [ref](#ref)
  - [reactive](#reactive)
  - [computed](#computed)
  - [watch](#watch)
  - [watchEffect](#watcheffect)
  - [effectScope](#effectscope)
  - [Helpers](#helpers)
  - [Component hooks](#component-hooks)
- [Routing](#routing)
  - [Dynamic segments](#dynamic-segments)
  - [Route groups](#route-groups)
  - [Layout overrides](#layout-overrides)
- [Server](#server)
  - [createFNetro](#createfnetro)
  - [serve](#serve)
  - [Runtime detection](#runtime-detection)
- [Client](#client)
  - [boot](#boot)
  - [navigate](#navigate)
  - [prefetch](#prefetch)
  - [Lifecycle hooks](#lifecycle-hooks)
- [Vite plugin](#vite-plugin)
- [Dev server](#dev-server)
- [Global store pattern](#global-store-pattern)
- [TypeScript](#typescript)
- [Runtime support](#runtime-support)
- [API reference](#api-reference)

---

## Quick start

```bash
# npm
npm create @netrojs/fnetro@latest

# bun
bun x @netrojs/create-fnetro

# pnpm
pnpm create @netrojs/fnetro@latest
```

The CLI will prompt for your project name, runtime (Node / Bun / Deno / Cloudflare / generic), template, and package manager, then scaffold a ready-to-run app.

```bash
cd my-app
bun install
bun run dev        # dev server — no build step required
```

**Manual install:**

```bash
npm install @netrojs/fnetro hono
npm install -D vite typescript @hono/vite-dev-server
# Node.js only:
npm install -D @hono/node-server
```

---

## How it works

FNetro is **three files** and no magic:

| File | Size | Purpose |
|---|---|---|
| `fnetro/core` | ~734 lines | Vue-like reactivity + all route/layout/middleware type definitions |
| `fnetro/server` | ~415 lines | `createFNetro()`, SSR renderer, `serve()` (auto-detects runtime), Vite plugin |
| `fnetro/client` | ~307 lines | SPA boot, click interception, hover prefetch, navigation lifecycle |

**First load (SSR):**
```
Browser  →  GET /posts/hello
Server   →  runs loader({ slug: 'hello' }) → { post: {...} }
Server   →  renderToString(<Layout><PostPage post={...} /></Layout>)
Server   →  injects window.__FNETRO_STATE__ = { "/posts/hello": { post: {...} } }
Browser  →  receives full HTML — visible immediately, works without JS
Browser  →  loads client.js → reads __FNETRO_STATE__ synchronously
Client   →  render(<Layout><PostPage post={...} /></Layout>) → live DOM
             ↑ zero extra fetch — same data, no loading spinner
```

**SPA navigation:**
```
User clicks  <a href="/posts/world">
Client       intercepts click
Client   →   fetch('/posts/world', { 'x-fnetro-spa': '1' })
Server   →   runs loader() → returns JSON { html, state, params, url }
Client   →   render(new page tree) → swaps DOM in place
Client   →   history.pushState() → URL updates, scroll resets
```

---

## Project structure

The scaffold generates this layout:

```
my-app/
├── app.ts              # Shared FNetro app — used by dev server AND server.ts
├── server.ts           # Production entry — calls serve()
├── client.ts           # Browser entry — calls boot()
├── vite.config.ts      # fnetroVitePlugin + @hono/vite-dev-server
├── tsconfig.json
├── package.json
│
├── app/
│   ├── layouts.tsx     # Root layout (nav, footer, theme)
│   ├── store.ts        # Global reactive state (optional)
│   └── routes/
│       ├── home.tsx    # GET /
│       ├── about.tsx   # GET /about
│       ├── api.ts      # Raw Hono routes at /api
│       └── posts/
│           ├── index.tsx       # GET /posts
│           └── [slug].tsx      # GET /posts/:slug
│
└── public/
    └── style.css
```

**`app.ts`** exports `fnetro` and `default` (the fetch handler). `@hono/vite-dev-server` imports the default export during development. `server.ts` imports `fnetro` for production.

```ts
// app.ts
import { createFNetro } from '@netrojs/fnetro/server'
import { RootLayout } from './app/layouts'
import home from './app/routes/home'

export const fnetro = createFNetro({ layout: RootLayout, routes: [home] })
export default fnetro.handler  // consumed by @hono/vite-dev-server in dev
```

```ts
// server.ts — production only
import { serve } from '@netrojs/fnetro/server'
import { fnetro } from './app'
await serve({ app: fnetro, port: 3000 })
```

---

## Core concepts

### `definePage`

A page is a path + optional server loader + JSX component. Everything in one file — no "use client" directives, no separate API routes, no split files.

```tsx
// app/routes/post.tsx
import { definePage, ref, use } from '@netrojs/fnetro/core'

// Module-level signal — value persists across SPA navigations
const viewCount = ref(0)

export default definePage({
  path: '/posts/[slug]',

  // Runs on the server. Return value becomes Page props.
  // Serialized into window.__FNETRO_STATE__ — client reads it without refetching.
  async loader(c) {
    const slug = c.req.param('slug')
    const post = await db.findPost(slug)
    if (!post) throw new Error('Not found')
    return { post }
  },

  // Rendered server-side on first load, client-side on SPA navigation.
  // Same JSX source — two runtimes (hono/jsx on server, hono/jsx/dom on client).
  Page({ post, url, params }) {
    const views = use(viewCount)  // reactive subscription
    return (
      <article>
        <h1>{post.title}</h1>
        <p>{views} views this session</p>
        <button onClick={() => viewCount.value++}>👁</button>
      </article>
    )
  },
})
```

Props available in every `Page`:

| Prop | Type | Description |
|---|---|---|
| `url` | `string` | Current pathname, e.g. `/posts/hello` |
| `params` | `Record<string, string>` | Parsed path params, e.g. `{ slug: 'hello' }` |
| `...loaderData` | inferred | Every key returned by `loader()` |

---

### `defineGroup`

Groups nest routes under a prefix, sharing a layout and middleware chain.

```tsx
import { defineGroup, definePage } from '@netrojs/fnetro/core'
import { AdminLayout } from '../layouts'
import { requireAuth, auditLog } from '../middleware'

const dashboard = definePage({ path: '',        loader: ..., Page: ... })  // /admin
const users     = definePage({ path: '/users',  loader: ..., Page: ... })  // /admin/users
const settings  = definePage({ path: '/settings', loader: ..., Page: ... })

export const adminGroup = defineGroup({
  prefix: '/admin',
  layout: AdminLayout,                        // overrides app-level layout
  middleware: [requireAuth, auditLog],        // applied to every route in group
  routes: [dashboard, users, settings],
})
```

Groups nest arbitrarily:

```tsx
defineGroup({
  prefix: '/org/[orgId]',
  middleware: [loadOrg],
  routes: [
    definePage({ path: '', ... }),
    defineGroup({
      prefix: '/team',
      middleware: [requireTeamMember],
      routes: [
        definePage({ path: '/[teamId]', ... })  // /org/:orgId/team/:teamId
      ],
    }),
  ],
})
```

---

### `defineLayout`

A layout wraps pages with shared chrome — nav, footer, theme, auth state.

```tsx
// app/layouts.tsx
import { defineLayout, use, ref } from '@netrojs/fnetro/core'
import { theme, toggleTheme } from './store'

export const RootLayout = defineLayout(function Layout({ children, url, params }) {
  const t = use(theme)  // reactive — re-renders when theme changes

  return (
    <div class={`app theme-${t}`}>
      <nav>
        <a href="/">Home</a>
        <a href="/posts">Posts</a>
        <button onClick={toggleTheme}>
          {t === 'dark' ? '☀️' : '🌙'}
        </button>
      </nav>
      <main>{children}</main>
      <footer>Built with ⬡ FNetro</footer>
    </div>
  )
})
```

**Override or remove the layout per page:**

```tsx
// Use a custom layout just for this page
definePage({ path: '/landing', layout: FullscreenLayout, Page: ... })

// Render without any layout (bare HTML)
definePage({ path: '/embed',   layout: false,            Page: ... })
```

---

### `defineApiRoute`

Mount raw Hono routes at any path. Full Hono API: routing, middleware, validators, streaming, WebSockets. API routes are registered before the page handler so `/api/*` is never caught by SPA navigation.

```tsx
// app/routes/api.ts
import { defineApiRoute } from '@netrojs/fnetro/core'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'

export const apiRoutes = defineApiRoute('/api', (app) => {
  // GET /api/health
  app.get('/health', (c) => c.json({ status: 'ok', ts: Date.now() }))

  // GET /api/posts
  app.get('/posts', async (c) => {
    const posts = await db.posts.findAll()
    return c.json({ posts })
  })

  // POST /api/posts — with Zod validation
  app.post(
    '/posts',
    zValidator('json', z.object({ title: z.string().min(1), body: z.string() })),
    async (c) => {
      const data = c.req.valid('json')
      const post = await db.posts.create(data)
      return c.json(post, 201)
    }
  )

  // Mount a sub-app
  app.route('/admin', adminRpc)
})
```

---

### `defineMiddleware`

Works at app, group, or page level. Receives the Hono `Context` and a `next` function.

```ts
// app/middleware/auth.ts
import { defineMiddleware } from '@netrojs/fnetro/core'

export const requireAuth = defineMiddleware(async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
  const user  = token ? verifyJwt(token) : null
  if (!user) return c.json({ error: 'Unauthorized' }, 401)
  c.set('user', user)
  await next()
})

export const rateLimit = defineMiddleware(async (c, next) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'unknown'
  if (await limiter.isLimited(ip)) return c.json({ error: 'Rate limited' }, 429)
  await next()
})

export const logger = defineMiddleware(async (c, next) => {
  const start = Date.now()
  await next()
  console.log(`${c.req.method} ${c.req.url} ${c.res.status} ${Date.now() - start}ms`)
})
```

**Apply at every level:**

```ts
createFNetro({
  middleware: [logger],              // every request
  routes: [
    defineGroup({
      middleware: [requireAuth],     // every route in group
      routes: [
        definePage({
          middleware: [rateLimit],   // this page only
          Page: ...,
        }),
      ],
    }),
  ],
})
```

---

## Reactivity

FNetro implements the complete Vue Reactivity API from scratch (~500 lines, no external dependencies). All functions work identically on server (SSR, no DOM) and client (live re-renders).

### `ref`

A reactive container for any value. Read with `.value`, write with `.value =`.

```ts
import { ref } from '@netrojs/fnetro/core'

const count = ref(0)
count.value++         // triggers all watchers
console.log(count.value)  // 1
```

**`shallowRef`** — reactive only at the top level (mutations inside an object won't trigger):

```ts
const list = shallowRef<string[]>([])
list.value.push('a')   // won't trigger — shallow
list.value = [...list.value, 'a']  // triggers — new reference
```

**`triggerRef`** — manually force-trigger a shallow ref after an internal mutation:

```ts
list.value.push('a')
triggerRef(list)       // force subscribers to re-run
```

---

### `reactive`

Deep reactive proxy of an object. All nested reads and writes are tracked automatically.

```ts
import { reactive } from '@netrojs/fnetro/core'

const state = reactive({
  user: { name: 'Alice', role: 'admin' },
  cart: { items: [] as CartItem[] },
})

state.user.name = 'Bob'        // triggers any watcher that read state.user.name
state.cart.items.push(item)    // array mutations tracked
```

**`shallowReactive`** — tracks only top-level keys, not nested objects:

```ts
const form = shallowReactive({ name: '', email: '' })
```

---

### `computed`

A lazily-evaluated, cached derived value. Re-evaluates only when its dependencies change.

```ts
import { ref, computed } from '@netrojs/fnetro/core'

const firstName = ref('Alice')
const lastName  = ref('Smith')

// Read-only
const fullName = computed(() => `${firstName.value} ${lastName.value}`)
console.log(fullName.value)  // 'Alice Smith'

// Writable
const name = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (v) => {
    const [f, l] = v.split(' ')
    firstName.value = f
    lastName.value  = l
  },
})
name.value = 'Bob Jones'
console.log(firstName.value)  // 'Bob'
```

---

### `watch`

Runs a callback when a source changes. Not immediate by default.

```ts
import { ref, watch } from '@netrojs/fnetro/core'

const count = ref(0)

// Single source
watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`)
})

// Multiple sources
const a = ref(1), b = ref(2)
watch([a, b], ([newA, newB], [oldA, oldB]) => {
  console.log(newA, newB)
})

// Options
watch(count, (n, o, cleanup) => {
  const timer = setTimeout(() => sync(n), 500)
  cleanup(() => clearTimeout(timer))  // runs before the next invocation
}, {
  immediate: true,  // fire immediately with the current value
  deep: true,       // deep equality check (objects)
  once: true,       // auto-stop after first invocation
})

// Stop watching
const stop = watch(count, () => { ... })
stop()
```

---

### `watchEffect`

Like `watch` but auto-tracks every reactive value read inside the function body. Runs immediately.

```ts
import { ref, reactive, watchEffect } from '@netrojs/fnetro/core'

const user  = reactive({ name: 'Alice' })
const theme = ref('dark')

// Automatically tracks user.name and theme.value
const stop = watchEffect(() => {
  document.title = `${user.name} — ${theme.value} mode`
})

user.name  = 'Bob'    // re-runs
theme.value = 'light' // re-runs

stop()  // remove the effect
```

---

### `effectScope`

Groups effects together so they can all be stopped at once. Useful for feature-level cleanup (e.g. when a modal closes, stop all effects created inside it).

```ts
import { ref, watchEffect, effectScope, onScopeDispose } from '@netrojs/fnetro/core'

const scope = effectScope()

scope.run(() => {
  // These effects are tied to `scope`
  watchEffect(() => { ... })
  watchEffect(() => { ... })

  // Runs when scope.stop() is called
  onScopeDispose(() => cleanup())
})

// Stops all effects in the scope + runs cleanups
scope.stop()
```

---

### Helpers

```ts
import {
  isRef,           // (v) → v is Ref<unknown>
  isReactive,      // (v) → boolean
  isReadonly,      // (v) → boolean
  unref,           // (r) → unwraps a Ref or returns the value as-is
  toRef,           // (object, key) → a Ref linked to object[key]
  toRefs,          // (object) → { [key]: Ref } — reactive-safe destructure
  markRaw,         // (object) → never proxied (e.g. third-party class instances)
  toRaw,           // (proxy) → the original unwrapped object
  readonly,        // (object) → readonly proxy — mutations warn in dev
} from '@netrojs/fnetro/core'

// toRefs — destructure a reactive object without losing reactivity
const pos = reactive({ x: 0, y: 0 })
const { x, y } = toRefs(pos)
x.value = 10   // mutates pos.x
pos.x   = 20   // x.value reads 20

// markRaw — prevent third-party instances from being proxied
const chart = markRaw(new Chart(canvas, config))
state.chart = chart  // stored as-is, not wrapped in a Proxy
```

---

### Component hooks

These are the bridge between signals and JSX components. On the server they return plain values (no reactivity needed). On the client they're wired to `hono/jsx/dom` to schedule re-renders.

#### `use(source)` — subscribe to any Ref or getter

```tsx
import { ref, computed, use } from '@netrojs/fnetro/core'

// Module-level — shared across all components and page navigations
const cartCount = ref(0)
const doubled   = computed(() => cartCount.value * 2)

function CartIcon() {
  const count = use(cartCount)   // re-renders when cartCount changes
  const dbl   = use(doubled)     // re-renders when doubled changes
  const total = use(() => cartCount.value * 9.99)  // getter — auto-computed

  return <span>🛒 {count} (${total.toFixed(2)})</span>
}
```

#### `useLocalRef(init)` — component-scoped Ref

```tsx
import { useLocalRef, use } from '@netrojs/fnetro/core'

function Toggle() {
  const open = useLocalRef(false)   // created once, lost on unmount
  const isOpen = use(open)
  return (
    <div>
      <button onClick={() => open.value = !isOpen}>
        {isOpen ? 'Close' : 'Open'}
      </button>
      {isOpen && <div class="panel">...</div>}
    </div>
  )
}
```

#### `useLocalReactive(init)` — component-scoped reactive object

```tsx
import { useLocalReactive } from '@netrojs/fnetro/core'

function LoginForm() {
  const form = useLocalReactive({ email: '', password: '', loading: false })

  async function submit() {
    form.loading = true
    await api.login(form.email, form.password)
    form.loading = false
  }

  return (
    <form onSubmit={submit}>
      <input value={form.email} onInput={(e: any) => form.email = e.target.value} />
      <input type="password" value={form.password} onInput={(e: any) => form.password = e.target.value} />
      <button disabled={form.loading}>{form.loading ? 'Signing in…' : 'Sign in'}</button>
    </form>
  )
}
```

---

## Routing

### Dynamic segments

| Pattern | Example URL | `params` |
|---|---|---|
| `/posts/[slug]` | `/posts/hello-world` | `{ slug: 'hello-world' }` |
| `/files/[...path]` | `/files/a/b/c.pdf` | `{ path: 'a/b/c.pdf' }` |
| `/[org]/[repo]` | `/acme/backend` | `{ org: 'acme', repo: 'backend' }` |

Params are available in `loader` via `c.req.param('key')` and in `Page` via the `params` prop.

```tsx
definePage({
  path: '/posts/[slug]',
  loader: (c) => {
    const slug = c.req.param('slug')
    return { post: db.findBySlug(slug) }
  },
  Page({ post, params }) {
    // params.slug is also available here
    return <article><h1>{post.title}</h1></article>
  },
})
```

### Route groups

Prefix, layout, and middleware are inherited by all routes in the group:

```tsx
createFNetro({
  layout: RootLayout,
  routes: [
    apiRoutes,    // defineApiRoute — registered before the page handler
    adminGroup,   // defineGroup — layout + middleware override
    home,
    posts,
    postDetail,
  ],
})
```

### Layout overrides

Priority order (highest wins): **page-level** → **group-level** → **app-level**

```tsx
const adminGroup = defineGroup({
  prefix: '/admin',
  layout: AdminLayout,   // overrides RootLayout for all /admin/* routes
  routes: [
    definePage({
      path: '/secret',
      layout: false,     // no layout at all — bare HTML response
      Page: () => <div>secret</div>,
    }),
  ],
})
```

---

## Server

### `createFNetro`

Assembles a Hono app from your route tree. Returns a `FNetroApp` with `.app` (the raw Hono instance) and `.handler` (the fetch function).

```ts
import { createFNetro } from '@netrojs/fnetro/server'

const fnetro = createFNetro({
  layout: RootLayout,
  middleware: [logger, sessionMiddleware],
  routes: [apiRoutes, adminGroup, home, posts],
  notFound: () => <NotFoundPage />,
})

// Access the raw Hono instance for anything not covered by createFNetro
fnetro.app.onError((err, c) => c.json({ error: err.message }, 500))
fnetro.app.use('/healthz', (c) => c.text('ok'))
```

**`AppConfig` options:**

| Option | Type | Description |
|---|---|---|
| `layout` | `LayoutDef` | Default layout for all pages |
| `middleware` | `FNetroMiddleware[]` | Global middleware, applied to every request |
| `routes` | `(PageDef \| GroupDef \| ApiRouteDef)[]` | Route definitions |
| `notFound` | `() => AnyJSX` | Custom 404 page |

---

### `serve`

Starts the HTTP server. Auto-detects the runtime unless `runtime` is specified.

```ts
import { serve } from '@netrojs/fnetro/server'
import { fnetro } from './app'

// Auto-detect (works for Node, Bun, Deno)
await serve({ app: fnetro, port: 3000 })

// Explicit
await serve({ app: fnetro, port: 8080, runtime: 'bun', hostname: '127.0.0.1' })
```

**`ServeOptions`:**

| Option | Type | Default | Description |
|---|---|---|---|
| `app` | `FNetroApp` | required | Returned by `createFNetro()` |
| `port` | `number` | `3000` | Port to listen on (env `PORT` also checked) |
| `hostname` | `string` | `'0.0.0.0'` | Bind address |
| `runtime` | `Runtime` | auto-detected | Override auto-detection |
| `staticDir` | `string` | `'./dist'` | Root dir for static asset serving (Node only) |

**Edge runtimes** — don't call `serve()`, just export the handler:

```ts
// Cloudflare Workers / generic WinterCG
export default { fetch: fnetro.handler }
```

### Runtime detection

```ts
import { detectRuntime } from '@netrojs/fnetro/server'

const runtime = detectRuntime()
// → 'bun' | 'deno' | 'node' | 'edge' | 'unknown'
```

Detection order: `Bun` global → `Deno` global → `process.versions.node` → `'edge'`.

---

## Client

### `boot`

Call once in `client.ts`. Reads `window.__FNETRO_STATE__` injected by the server and hydrates the page — no extra network request.

```ts
// client.ts
import { boot } from '@netrojs/fnetro/client'
import { RootLayout } from './app/layouts'
import home from './app/routes/home'
import posts from './app/routes/posts'

boot({
  layout: RootLayout,
  routes: [home, posts],
  prefetchOnHover: true,   // default: true
})
```

Routes in `boot()` must match the routes in `createFNetro()` exactly (same array, same order). The client uses them for path matching during SPA navigation.

---

### `navigate`

Programmatic SPA navigation.

```ts
import { navigate } from '@netrojs/fnetro/client'

// Push a new history entry and navigate
await navigate('/posts/new-post')

// Replace current entry (no back button entry)
await navigate('/dashboard', { replace: true })

// Navigate without scrolling to the top
await navigate('/modal-route', { scroll: false })
```

Plain `<a>` tags are intercepted automatically — no `<Link>` component required:

```html
<a href="/posts/hello">Normal anchor — SPA handled</a>
<a href="/download.zip" data-no-spa>Force full navigation</a>
<a href="https://external.com" rel="external">External link</a>
```

---

### `prefetch`

Warms the SPA fetch cache for a URL. By default called automatically on `mouseover`. Call manually for more aggressive prefetching (e.g. on `mousedown` or when an item enters the viewport).

```ts
import { prefetch } from '@netrojs/fnetro/client'

// Prefetch on mousedown — faster than waiting for click
button.addEventListener('mousedown', () => prefetch('/posts/next'))

// Prefetch a list of likely-next pages on page load
const likelyNextRoutes = ['/posts/hello', '/about']
likelyNextRoutes.forEach(prefetch)
```

Disable automatic hover prefetch:
```ts
boot({ prefetchOnHover: false, ... })
```

---

### Lifecycle hooks

```ts
import { onBeforeNavigate, onAfterNavigate } from '@netrojs/fnetro/client'

// Runs before every SPA navigation — async, awaited
// Throw any error to cancel the navigation
const stopBefore = onBeforeNavigate(async (url) => {
  if (formHasUnsavedChanges) {
    const confirmed = await showConfirmDialog('Leave page?')
    if (!confirmed) throw new Error('navigation cancelled')
  }
})

// Runs after navigation completes — including the initial boot
const stopAfter = onAfterNavigate((url) => {
  analytics.page(url)
  window.posthog?.capture('$pageview', { url })
})

// Remove a listener
stopBefore()
stopAfter()
```

---

## Vite plugin

`fnetroVitePlugin()` produces both bundles from a single `vite build` command.

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { fnetroVitePlugin } from '@netrojs/fnetro/vite'
import devServer from '@hono/vite-dev-server'
import bunAdapter from '@hono/vite-dev-server/bun'

export default defineConfig({
  plugins: [
    fnetroVitePlugin({
      serverEntry: 'server.ts',    // default
      clientEntry:  'client.ts',   // default
      serverOutDir: 'dist/server', // default
      clientOutDir: 'dist/assets', // default
      serverExternal: ['pg', 'redis'],  // keep out of server bundle
    }),
    devServer({
      adapter: bunAdapter,
      entry: 'app.ts',  // must export fnetro.handler as default
    }),
  ],
  server: {
    watch: { ignored: ['**/dist/**'] },
  },
})
```

**`FNetroPluginOptions`:**

| Option | Default | Description |
|---|---|---|
| `serverEntry` | `'server.ts'` | Production server entry |
| `clientEntry` | `'client.ts'` | Browser SPA entry |
| `serverOutDir` | `'dist/server'` | Output dir for server bundle |
| `clientOutDir` | `'dist/assets'` | Output dir for client bundle |
| `serverExternal` | `[]` | Packages excluded from the server bundle (always excludes `node:*` and `@hono/node-server`) |

**Build output:**
```
dist/
├── server/
│   └── server.js      # Node-compatible ESM, imports fnetro.handler and calls serve()
└── assets/
    ├── client.js      # Browser ESM, boots the SPA
    └── style.css      # Your CSS
```

---

## Dev server

`@hono/vite-dev-server` routes HTTP requests directly through your FNetro app inside the Vite process. No `dist/` directory needed — changes to `.ts` and `.tsx` files are reflected instantly.

```bash
# Node
vite

# Bun (uses Bun's runtime instead of Node for Vite internals)
bun --bun vite --host

# Deno
deno run -A npm:vite
```

The `entry` option must point to a file that exports the Hono fetch handler as its default export:

```ts
// app.ts
export const fnetro = createFNetro({ ... })
export default fnetro.handler   // ← this is what @hono/vite-dev-server imports
```

---

## Global store pattern

Module-level reactive state persists across SPA navigations because ES modules are cached. Use this for shared auth state, cart, theme, notifications, etc.

```ts
// app/store.ts
import { ref, reactive, computed, watch } from '@netrojs/fnetro/core'

// ── Theme ────────────────────────────────────────────────────────────────────
export const theme = ref<'dark' | 'light'>('dark')
export const toggleTheme = () => {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}

// Persist to localStorage on the client
if (typeof window !== 'undefined') {
  const saved = localStorage.getItem('theme') as 'dark' | 'light' | null
  if (saved) theme.value = saved
  watch(theme, (t) => localStorage.setItem('theme', t))
}

// ── Auth ─────────────────────────────────────────────────────────────────────
export const user = reactive({
  id: null as string | null,
  name: '',
  role: 'guest' as 'guest' | 'user' | 'admin',
})
export const isLoggedIn = computed(() => user.id !== null)
export const isAdmin    = computed(() => user.role === 'admin')

// ── Cart ─────────────────────────────────────────────────────────────────────
export interface CartItem { id: string; name: string; qty: number; price: number }
export const cart      = reactive<{ items: CartItem[] }>({ items: [] })
export const cartCount = computed(() => cart.items.reduce((s, i) => s + i.qty, 0))
export const cartTotal = computed(() => cart.items.reduce((s, i) => s + i.qty * i.price, 0))

export function addToCart(item: Omit<CartItem, 'qty'>) {
  const existing = cart.items.find((i) => i.id === item.id)
  if (existing) { existing.qty++; return }
  cart.items.push({ ...item, qty: 1 })
}

export function removeFromCart(id: string) {
  cart.items = cart.items.filter((i) => i.id !== id)
}
```

Using the store in a layout or page:

```tsx
import { use } from '@netrojs/fnetro/core'
import { cartCount, isLoggedIn, user, theme } from '../store'

function NavBar({ url }: { url: string }) {
  const count    = use(cartCount)
  const loggedIn = use(isLoggedIn)
  const name     = use(() => user.name)
  const t        = use(theme)

  return (
    <nav class={`nav theme-${t}`}>
      <a href="/">Home</a>
      {loggedIn
        ? <span>👤 {name}</span>
        : <a href="/login">Sign in</a>
      }
      <a href="/cart">🛒 {count > 0 && <span class="badge">{count}</span>}</a>
    </nav>
  )
}
```

---

## TypeScript

Page props are inferred directly from the loader return type — no annotation needed:

```ts
definePage({
  path: '/user/[id]',
  async loader(c) {
    const user = await getUser(c.req.param('id'))
    return { user, role: 'admin' as const }
  },
  Page({ user, role, url, params }) {
    //   ^^^^  User  ^^^^  'admin'  — fully inferred
  },
})
```

Explicit typing when the loader is defined separately:

```ts
interface PageData {
  user: User
  role: 'admin' | 'member'
}

definePage<PageData>({
  path: '/user/[id]',
  loader: async (c): Promise<PageData> => { ... },
  Page: ({ user, role }) => { ... },
})
```

**`tsconfig.json` for a FNetro project:**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ESNext", "DOM"],
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  },
  "include": ["**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "dist"]
}
```

---

## Runtime support

| Runtime | `dev` | `build` | `start` | Notes |
|---|---|---|---|---|
| **Node.js 18+** | `vite` | `vite build` | `node dist/server/server.js` | `@hono/node-server` required |
| **Bun** | `bun --bun vite --host` | `bun --bun vite build` | `bun dist/server/server.js` | Native Bun adapter for dev server |
| **Deno** | `deno run -A npm:vite` | `deno run -A npm:vite build` | `deno run -A dist/server/server.js` | |
| **Cloudflare Workers** | `wrangler dev` | `vite build` | `wrangler deploy` | Export `fnetro.handler` as default |
| **Generic WinterCG** | `vite` | `vite build` | — | Export `fnetro.handler` as default |

`serve()` auto-detects the runtime at startup. Pass `runtime` explicitly if auto-detection fails (e.g. when a bundler strips runtime globals):

```ts
await serve({ app: fnetro, port: 3000, runtime: 'bun' })
```

---

## API reference

### `@netrojs/fnetro/core`

**Reactivity**

| Symbol | Signature | Description |
|---|---|---|
| `ref` | `<T>(value: T) → Ref<T>` | Reactive primitive |
| `shallowRef` | `<T>(value: T) → Ref<T>` | Reactive at top level only |
| `triggerRef` | `(r: Ref) → void` | Force-trigger a shallow ref |
| `isRef` | `(v) → v is Ref` | Type guard |
| `unref` | `<T>(r: T \| Ref<T>) → T` | Unwrap a ref |
| `reactive` | `<T extends object>(t: T) → T` | Deep reactive proxy |
| `shallowReactive` | `<T extends object>(t: T) → T` | Shallow reactive proxy |
| `readonly` | `<T extends object>(t: T) → Readonly<T>` | Readonly proxy |
| `computed` | `<T>(getter) → ComputedRef<T>` | Derived cached value |
| `computed` | `<T>({ get, set }) → WritableComputedRef<T>` | Writable computed |
| `watch` | `(source, cb, opts?) → StopHandle` | Reactive watcher |
| `watchEffect` | `(fn, opts?) → StopHandle` | Auto-tracked side effect |
| `effect` | `(fn) → StopHandle` | Raw reactive effect |
| `effectScope` | `() → EffectScope` | Grouped effect lifecycle |
| `getCurrentScope` | `() → EffectScope \| undefined` | Current active scope |
| `onScopeDispose` | `(fn) → void` | Register scope cleanup |
| `toRef` | `(obj, key) → Ref` | Ref linked to object key |
| `toRefs` | `(obj) → { [k]: Ref }` | Reactive-safe destructure |
| `markRaw` | `<T>(v: T) → T` | Opt out of reactivity |
| `toRaw` | `<T>(proxy: T) → T` | Unwrap proxy to original |
| `isReactive` | `(v) → boolean` | |
| `isReadonly` | `(v) → boolean` | |

**Component hooks**

| Symbol | Signature | Description |
|---|---|---|
| `use` | `<T>(source: Ref<T> \| (() => T)) → T` | Subscribe in JSX component |
| `useLocalRef` | `<T>(init: T) → Ref<T>` | Component-scoped ref |
| `useLocalReactive` | `<T>(init: T) → T` | Component-scoped reactive object |

**Route definitions**

| Symbol | Description |
|---|---|
| `definePage(def)` | Define a route |
| `defineGroup(def)` | Nest routes with shared prefix/layout/middleware |
| `defineLayout(Component)` | Create a layout |
| `defineMiddleware(handler)` | Create a middleware |
| `defineApiRoute(path, register)` | Mount raw Hono routes |

### `@netrojs/fnetro/server`

| Symbol | Description |
|---|---|
| `createFNetro(config)` | Assemble the Hono app → `FNetroApp` |
| `serve(opts)` | Start the HTTP server (auto-detects runtime) |
| `detectRuntime()` | Returns `'node' \| 'bun' \| 'deno' \| 'edge' \| 'unknown'` |
| `fnetroVitePlugin(opts?)` | Vite plugin — produces server + client bundles |

### `@netrojs/fnetro/client`

| Symbol | Description |
|---|---|
| `boot(options)` | Mount the SPA — reads `__FNETRO_STATE__`, no refetch |
| `navigate(to, opts?)` | Programmatic SPA navigation |
| `prefetch(url)` | Warm the fetch cache for a URL |
| `onBeforeNavigate(fn)` | Hook — runs before each navigation, can cancel |
| `onAfterNavigate(fn)` | Hook — runs after each navigation + initial boot |

---

## License

MIT © [Netro Solutions](https://github.com/netrosolutions)