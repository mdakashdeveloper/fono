// ─────────────────────────────────────────────────────────────────────────────
//  Vono · core.ts
//  Route builders, path utilities, and route resolution.
//
//  This module is imported by both server.ts (Node/Bun/Deno process) and
//  client.ts (browser bundle).  It must remain side-effect-free and must not
//  import any Node.js built-ins or browser-only globals.
// ─────────────────────────────────────────────────────────────────────────────

import type { Component } from 'vue'
import type {
  PageDef, GroupDef, LayoutDef, ApiRouteDef, Route,
  ResolvedRoute, CompiledPath, HonoMiddleware, AsyncLoader, LoaderCtx,
} from './types'

// ── Async-loader detection ────────────────────────────────────────────────────
//
// A Vue SFC compiled by @vitejs/plugin-vue always carries at least one of
// these brand properties on the component object.  A plain async factory
// `() => import('./Page.vue')` is a bare function with none of them.
//
// Checking for the *absence* of brand properties is sufficient for production
// code; we also guard for non-function values.

const VUE_COMPONENT_BRANDS = [
  '__name',
  '__file',
  '__vccOpts',
  'setup',
  'render',
  'data',
  'components',
  '__asyncLoader',   // already-wrapped defineAsyncComponent result
] as const

/**
 * Returns `true` when `value` is an async factory function
 * (i.e. `() => import('./Page.vue')`) rather than a resolved Vue component.
 *
 * Used by `server.ts` to await the import before SSR, and by `client.ts` to
 * wrap it in `defineAsyncComponent()` for lazy hydration.
 */
export function isAsyncLoader(value: unknown): value is AsyncLoader {
  if (typeof value !== 'function') return false
  const fn = value as unknown as Record<string, unknown>
  for (const brand of VUE_COMPONENT_BRANDS) {
    if (brand in fn) return false
  }
  return true
}

// ── Builder functions ─────────────────────────────────────────────────────────

/**
 * Define a page route with full type inference.
 *
 * TypeScript infers `TData` from the `loader` return type automatically.
 * Export the result and use `InferPageData<typeof myPage>` in components for a
 * single source of truth.
 *
 * @example
 * export const postPage = definePage({
 *   path:      '/post/[slug]',
 *   loader:    async (c) => fetchPost(c.req.param('slug')),
 *   component: () => import('./pages/post.vue'),
 * })
 * export type PostData = InferPageData<typeof postPage>
 */
export function definePage<TData extends object = Record<string, never>>(
  def: Omit<PageDef<TData>, '__type'>,
): PageDef<TData> {
  return { __type: 'page', ...def }
}

/**
 * Define a route group with a shared URL prefix, layout, and middleware.
 *
 * @example
 * defineGroup({
 *   prefix:     '/dashboard',
 *   layout:     dashboardLayout,
 *   middleware: [authGuard],
 *   routes:     [overviewPage, postsPage],
 * })
 */
export function defineGroup(def: Omit<GroupDef, '__type'>): GroupDef {
  return { __type: 'group', ...def }
}

/**
 * Wrap a Vue layout component as a Vono layout.
 * The component must render a `<slot />` where page content will appear.
 *
 * @example
 * import RootLayout from './layouts/RootLayout.vue'
 * export const rootLayout = defineLayout(RootLayout)
 */
export function defineLayout(component: Component): LayoutDef {
  return { __type: 'layout', component }
}

/**
 * Define a Hono API route co-located with your page routes.
 *
 * The `register` callback receives a fresh Hono sub-app.  All routes
 * registered on it are mounted at `path`.
 *
 * @example
 * defineApiRoute('/api/posts', (app) => {
 *   app.get('/',      (c) => c.json({ posts }))
 *   app.post('/',     async (c) => { ... })
 *   app.delete('/:id', async (c) => { ... })
 * })
 */
export function defineApiRoute(
  path:     string,
  register: ApiRouteDef['register'],
): ApiRouteDef {
  return { __type: 'api', path, register }
}

// ── Path utilities ────────────────────────────────────────────────────────────
//
// Vono uses a "[param]" syntax for dynamic segments (inspired by Next.js).
// These helpers convert between that syntax and the RegExp / Vue Router formats.

/**
 * Compile a Vono path pattern to a `{ re, keys }` pair for fast matching.
 *
 * Supports:
 *   - `/posts/[slug]`       — named segment
 *   - `/files/[...path]`    — named catch-all (greedy)
 */
export function compilePath(path: string): CompiledPath {
  const keys: string[] = []
  // Catch-all `[...name]` → greedy capture `(.*)`
  const src = path
    .replace(/\[\.\.\.([^\]]+)\]/g, (_m, k: string) => { keys.push(k); return '(.*)' })
    // Regular `[name]` → non-greedy segment `([^/]+)`
    .replace(/\[([^\]]+)\]/g,       (_m, k: string) => { keys.push(k); return '([^/]+)' })
  return { re: new RegExp(`^${src}$`), keys }
}

/**
 * Match a compiled path against a URL pathname.
 *
 * Returns a `Record<string, string>` of extracted param values on success,
 * or `null` on no match.
 */
export function matchPath(
  cp:       CompiledPath,
  pathname: string,
): Record<string, string> | null {
  const m = pathname.match(cp.re)
  if (!m) return null
  return Object.fromEntries(
    cp.keys.map((k, i) => [k, decodeURIComponent(m[i + 1] ?? '')])
  )
}

/**
 * Convert Vono `[param]` syntax to Vue Router `:param` syntax.
 *
 * @example
 * toVueRouterPath('/posts/[slug]')      // → '/posts/:slug'
 * toVueRouterPath('/files/[...path]')   // → '/files/:path(.*)*'
 */
export function toVueRouterPath(vonoPath: string): string {
  return vonoPath
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1(.*)*')
    .replace(/\[([^\]]+)\]/g,       ':$1')
}

// ── Route resolution ──────────────────────────────────────────────────────────

interface ResolveOptions {
  prefix?:     string
  middleware?: HonoMiddleware[]
  layout?:     LayoutDef | false
}

/**
 * Walk the `routes` tree, flatten it, and produce two arrays:
 *   - `pages` — resolved page routes with full path, layout, and merged middleware
 *   - `apis`  — API routes with prefixed paths
 *
 * Used by both `createVono()` (server) and `boot()` (client).
 */
export function resolveRoutes(
  routes:  Route[],
  options: ResolveOptions = {},
): { pages: ResolvedRoute[]; apis: ApiRouteDef[] } {
  const pages: ResolvedRoute[] = []
  const apis:  ApiRouteDef[]   = []
  const prefix = options.prefix ?? ''
  const parentMw = options.middleware ?? []

  for (const route of routes) {
    switch (route.__type) {
      case 'api': {
        apis.push({ ...route, path: prefix + route.path })
        break
      }

      case 'group': {
        const groupPrefix = prefix + route.prefix
        const groupMw     = [...parentMw, ...(route.middleware ?? [])]
        // A group's `layout` overrides the inherited parent layout only when
        // explicitly set.  `undefined` means "inherit"; `false` means "none".
        const groupLayout: LayoutDef | false | undefined =
          route.layout !== undefined ? route.layout : options.layout

        const sub = resolveRoutes(route.routes, {
          prefix:     groupPrefix,
          middleware: groupMw,
          ...(groupLayout !== undefined && { layout: groupLayout }),
        })
        pages.push(...sub.pages)
        apis.push(...sub.apis)
        break
      }

      default: {
        pages.push({
          fullPath:   prefix + route.path,
          page:       route as PageDef<object>,
          layout:     route.layout !== undefined ? route.layout : options.layout,
          middleware: [...parentMw, ...(route.middleware ?? [])],
        })
      }
    }
  }

  return { pages, apis }
}

// ── Re-export all types so `import from '@netrojs/vono'` works ────────────────
export * from './types'
