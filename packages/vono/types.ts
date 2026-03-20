// ─────────────────────────────────────────────────────────────────────────────
//  Vono · types.ts
//  All shared TypeScript types and runtime constants
// ─────────────────────────────────────────────────────────────────────────────

import type { Component } from 'vue'
import type { Context, MiddlewareHandler, Hono } from 'hono'

export type HonoMiddleware = MiddlewareHandler
export type LoaderCtx      = Context

// ── SEO ───────────────────────────────────────────────────────────────────────

export interface SEOMeta {
  title?:              string
  description?:        string
  keywords?:           string
  author?:             string
  robots?:             string
  canonical?:          string
  themeColor?:         string
  ogTitle?:            string
  ogDescription?:      string
  ogImage?:            string
  ogImageAlt?:         string
  ogUrl?:              string
  ogType?:             string
  ogSiteName?:         string
  twitterCard?:        'summary' | 'summary_large_image' | 'app' | 'player'
  twitterSite?:        string
  twitterTitle?:       string
  twitterDescription?: string
  twitterImage?:       string
  /** Structured data injected as <script type="application/ld+json">. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[]
}

// ── Async component loader — enables automatic code splitting ─────────────────
//
// Pass () => import('./Page.vue') as `component` for lazy loading + splitting.
// The server resolves the import before rendering; the client wraps it in
// defineAsyncComponent() so the page chunk is lazy-loaded after hydration.

export type AsyncLoader = () => Promise<{ default: Component } | Component>

// ── Route definition types ────────────────────────────────────────────────────

export interface PageDef<TData extends object = Record<string, never>> {
  readonly __type: 'page'
  path:            string
  middleware?:     HonoMiddleware[]
  loader?:         (c: LoaderCtx) => TData | Promise<TData>
  seo?:            SEOMeta | ((data: TData, params: Record<string, string>) => SEOMeta)
  /** Override or disable the app-level layout for this route. */
  layout?:         LayoutDef | false
  /**
   * The Vue component to render for this route.
   * Use () => import('./Page.vue') for automatic code splitting.
   */
  component:       Component | AsyncLoader
}

export interface GroupDef {
  readonly __type: 'group'
  prefix:          string
  layout?:         LayoutDef | false
  middleware?:     HonoMiddleware[]
  routes:          Route[]
}

export interface LayoutDef {
  readonly __type: 'layout'
  /** Vue layout component — must contain <slot /> for page content. */
  component:       Component
}

export interface ApiRouteDef {
  readonly __type: 'api'
  path:            string
  register:        (app: Hono, globalMiddleware: HonoMiddleware[]) => void
}

export type Route = PageDef<any> | GroupDef | ApiRouteDef

export interface AppConfig {
  layout?:     LayoutDef
  seo?:        SEOMeta
  middleware?: HonoMiddleware[]
  routes:      Route[]
  notFound?:   Component
  htmlAttrs?:  Record<string, string>
  /** Extra HTML injected into <head> (e.g. font preloads). */
  head?:       string
}

export interface ResolvedRoute {
  fullPath:   string
  page:       PageDef<any>
  layout:     LayoutDef | false | undefined
  middleware: HonoMiddleware[]
}

export interface CompiledPath {
  re:   RegExp
  keys: string[]
}

export type ClientMiddleware = (url: string, next: () => Promise<void>) => Promise<void>

// ── Shared runtime constants ──────────────────────────────────────────────────

/** Custom request header that identifies an SPA navigation (JSON payload). */
export const SPA_HEADER = 'x-vono-spa'
/** window key for SSR-injected per-page loader data. */
export const STATE_KEY  = '__VONO_STATE__'
/** window key for SSR-injected URL params. */
export const PARAMS_KEY = '__VONO_PARAMS__'
/** window key for SSR-injected SEO meta. */
export const SEO_KEY    = '__VONO_SEO__'

/**
 * Vue provide/inject key for the reactive page-data object.
 * Symbol.for() ensures the same reference across module instances (SSR safe).
 */
export const DATA_KEY = Symbol.for('vono:data')

// ── Type utilities ────────────────────────────────────────────────────────────

/**
 * Extract the loader data type from a `PageDef` returned by `definePage()`.
 *
 * This enables you to define the data type exactly once — inferred from the
 * loader — and import it into page components for `usePageData<T>()`.
 *
 * @example
 * // app/routes.ts
 * export const homePage = definePage({
 *   path: '/',
 *   loader: async () => ({ title: 'Hello', count: 42 }),
 *   component: () => import('./pages/home.vue'),
 * })
 * export type HomeData = InferPageData<typeof homePage>
 * // HomeData = { title: string; count: number }
 *
 * // app/pages/home.vue
 * import type { HomeData } from '../routes'
 * const data = usePageData<HomeData>()
 */
export type InferPageData<T> = T extends PageDef<infer D> ? D : never
