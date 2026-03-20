// ─────────────────────────────────────────────────────────────────────────────
//  Vono · core.ts
//  Route builders · path matching · route resolution · async-loader detection
// ─────────────────────────────────────────────────────────────────────────────

import type { Component } from 'vue'
import type {
  PageDef, GroupDef, LayoutDef, ApiRouteDef, Route,
  ResolvedRoute, CompiledPath, HonoMiddleware, AsyncLoader, LoaderCtx,
} from './types'

// ── Async-loader detection ────────────────────────────────────────────────────
//
// A Vue component (SFC compiled by vite-plugin-vue) always carries one or more
// of these brand properties.  A plain () => import('./Page.vue') factory has
// none of them, so checking for their absence is sufficient for real-world use.

const VUE_BRANDS = ['__name', '__file', '__vccOpts', 'setup', 'render', 'data', 'components'] as const

/**
 * Returns true when `c` is an async factory function (i.e. `() => import(...)`)
 * rather than a resolved Vue component object.
 *
 * Used by both server.ts (to resolve the import before SSR) and client.ts
 * (to wrap with defineAsyncComponent for lazy hydration).
 */
export function isAsyncLoader(c: unknown): c is AsyncLoader {
  if (typeof c !== 'function') return false
  const f = c as unknown as Record<string, unknown>
  for (const brand of VUE_BRANDS) {
    if (brand in f) return false
  }
  return true
}

// ── Builder functions ─────────────────────────────────────────────────────────

/**
 * Define a page route with full type inference.
 *
 * TypeScript infers `TData` automatically from the `loader` return type, so
 * you rarely need to supply the generic manually.  Export the page constant and
 * use `InferPageData<typeof myPage>` in your component for a single source of
 * truth.
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

export function defineGroup(def: Omit<GroupDef, '__type'>): GroupDef {
  return { __type: 'group', ...def }
}

/** Wrap a Vue layout component (must render <slot />) as a Vono layout. */
export function defineLayout(component: Component): LayoutDef {
  return { __type: 'layout', component }
}

export function defineApiRoute(
  path:     string,
  register: ApiRouteDef['register'],
): ApiRouteDef {
  return { __type: 'api', path, register }
}

// ── Path matching (Vono [param] syntax → RegExp) ────────────────────────────

export function compilePath(path: string): CompiledPath {
  const keys: string[] = []
  const src = path
    .replace(/\[\.\.\.([^\]]+)\]/g, (_, k: string) => { keys.push(k); return '(.*)' })
    .replace(/\[([^\]]+)\]/g,       (_, k: string) => { keys.push(k); return '([^/]+)' })
    .replace(/\*/g, '(.*)')
  return { re: new RegExp(`^${src}$`), keys }
}

export function matchPath(
  cp: CompiledPath,
  pathname: string,
): Record<string, string> | null {
  const m = pathname.match(cp.re)
  if (!m) return null
  const params: Record<string, string> = {}
  cp.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1] ?? '') })
  return params
}

/**
 * Convert Vono `[param]` syntax to Vue Router `:param` syntax.
 *
 * `/posts/[slug]`    → `/posts/:slug`
 * `/files/[...path]` → `/files/:path(.*)*`
 */
export function toVueRouterPath(vonoPath: string): string {
  return vonoPath
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1(.*)*')
    .replace(/\[([^\]]+)\]/g,       ':$1')
}

// ── Route resolution ──────────────────────────────────────────────────────────

export function resolveRoutes(
  routes:  Route[],
  options: {
    prefix?:     string
    middleware?: HonoMiddleware[]
    layout?:     LayoutDef | false
  } = {},
): { pages: ResolvedRoute[]; apis: ApiRouteDef[] } {
  const pages: ResolvedRoute[] = []
  const apis:  ApiRouteDef[]   = []

  for (const route of routes) {
    if (route.__type === 'api') {
      apis.push({ ...route, path: (options.prefix ?? '') + route.path })
    } else if (route.__type === 'group') {
      const prefix = (options.prefix ?? '') + route.prefix
      const mw     = [...(options.middleware ?? []), ...(route.middleware ?? [])]
      const layout = route.layout !== undefined ? route.layout : options.layout
      const sub    = resolveRoutes(route.routes, {
        prefix,
        middleware: mw,
        ...(layout !== undefined && { layout }),
      })
      pages.push(...sub.pages)
      apis.push(...sub.apis)
    } else {
      pages.push({
        fullPath:   (options.prefix ?? '') + route.path,
        page:       route,
        layout:     route.layout !== undefined ? route.layout : options.layout,
        middleware: [...(options.middleware ?? []), ...(route.middleware ?? [])],
      })
    }
  }

  return { pages, apis }
}

// Re-export all types so `import from '@netrojs/vono'` (root export) works
export * from './types'
