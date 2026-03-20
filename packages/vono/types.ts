// ─────────────────────────────────────────────────────────────────────────────
//  Vono · types.ts
//  All shared TypeScript types, interfaces, and runtime constants.
//
//  Import policy:
//    Only type-level imports from external packages are allowed here so this
//    module stays side-effect-free and works in both server and browser builds.
// ─────────────────────────────────────────────────────────────────────────────

import type { Component, App, InjectionKey } from 'vue'
import type { Router } from 'vue-router'
import type { Context, MiddlewareHandler, Hono } from 'hono'

// ── Runtime ───────────────────────────────────────────────────────────────────

export type Runtime = 'node' | 'bun' | 'deno' | 'edge'

// ── Hono ─────────────────────────────────────────────────────────────────────

/** Hono `MiddlewareHandler` — use for server-side route + app middleware. */
export type HonoMiddleware = MiddlewareHandler

/** Hono `Context` — the argument passed to loaders and server middleware. */
export type LoaderCtx = Context

// ── SEO ───────────────────────────────────────────────────────────────────────

export interface SEOMeta {
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

  /**
   * One or more structured-data objects injected as
   * `<script type="application/ld+json">`.
   */
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
}

// ── Async component loader ────────────────────────────────────────────────────
//
// Pass `() => import('./Page.vue')` as the `component` option to opt into
// automatic code splitting.  Vono resolves the import before SSR rendering;
// the client wraps it in `defineAsyncComponent()` so the chunk is lazy-loaded.

export type AsyncLoader = () => Promise<{ default: Component } | Component>

// ── Route definitions ─────────────────────────────────────────────────────────

/**
 * Define a page route.
 *
 * TypeScript infers `TData` automatically from the `loader` return type, so
 * you rarely need to supply the generic manually.  Export the constant and
 * use `InferPageData<typeof myPage>` in your component for a single source of
 * truth.
 *
 * @example
 * export const postPage = definePage({
 *   path:      '/post/[slug]',
 *   loader:    async (c) => fetchPost(c.req.param('slug')),
 *   component: () => import('./pages/post.vue'),
 * })
 */
export interface PageDef<TData extends object = Record<string, never>> {
  readonly __type: 'page'
  path:            string
  middleware?:     HonoMiddleware[]
  loader?:         (c: LoaderCtx) => TData | Promise<TData>
  /**
   * Static SEO meta, or a function that receives the loader output and URL
   * params and returns `SEOMeta`.
   */
  seo?:            SEOMeta | ((data: TData, params: Record<string, string>) => SEOMeta)
  /**
   * Override or disable the inherited layout for this single route.
   * `false` renders the page with no layout wrapper.
   */
  layout?:         LayoutDef | false
  /**
   * The Vue component (SFC) or an async loader `() => import(...)` for code
   * splitting.
   */
  component:       Component | AsyncLoader
}

export interface GroupDef {
  readonly __type: 'group'
  /** URL prefix applied to every route in this group. */
  prefix:          string
  /** Layout inherited by all pages in the group (unless overridden per-page). */
  layout?:         LayoutDef | false
  /** Middleware applied to every route in the group, before per-route middleware. */
  middleware?:     HonoMiddleware[]
  routes:          Route[]
}

/** Wraps a Vue layout component (must contain `<slot />`) as a Vono layout. */
export interface LayoutDef {
  readonly __type: 'layout'
  component:       Component
}

/**
 * Co-locate a Hono JSON API endpoint alongside your page routes.
 *
 * @example
 * defineApiRoute('/api/posts', (app) => {
 *   app.get('/', (c) => c.json({ posts }))
 *   app.post('/', async (c) => { ... })
 * })
 */
export interface ApiRouteDef {
  readonly __type: 'api'
  path:            string
  register:        (app: Hono, globalMiddleware: HonoMiddleware[]) => void
}

export type Route = PageDef<object> | GroupDef | ApiRouteDef

// ── App config ────────────────────────────────────────────────────────────────

export interface AppConfig {
  /** Root-level layout component inherited by all pages (unless overridden). */
  layout?:     LayoutDef
  /** Global SEO defaults merged with per-page overrides. */
  seo?:        SEOMeta
  /** Hono middleware applied before every route handler. */
  middleware?: HonoMiddleware[]
  routes:      Route[]
  /** Vue component rendered for unmatched routes (served with HTTP 404). */
  notFound?:   Component
  /** Attributes applied to the root `<html>` element, e.g. `{ lang: 'en' }`. */
  htmlAttrs?:  Record<string, string>
  /** Raw HTML string injected into `<head>` on every page. */
  head?:       string
}

// ── Resolved internal types ───────────────────────────────────────────────────

export interface ResolvedRoute {
  /** The full path including any group prefix, e.g. `/dashboard/settings`. */
  fullPath:   string
  page:       PageDef<object>
  /** `undefined` means "inherit from app config"; `false` means "no layout". */
  layout:     LayoutDef | false | undefined
  middleware: HonoMiddleware[]
}

export interface CompiledPath {
  re:   RegExp
  keys: string[]
}

// ── Client middleware ─────────────────────────────────────────────────────────

/**
 * Client-side navigation middleware — runs on every SPA route change, before
 * the JSON fetch.
 *
 * Call `next()` to continue; omit it (or `return` early) to abort navigation.
 *
 * @example
 * useClientMiddleware(async (to, next) => {
 *   if (!isLoggedIn() && to.startsWith('/dashboard')) {
 *     await navigate('/login')
 *     return  // abort — do not call next()
 *   }
 *   await next()
 * })
 */
export type ClientMiddleware = (
  to:   string,
  next: () => Promise<void>,
) => void | Promise<void>

// ── Boot plugins ──────────────────────────────────────────────────────────────

/** Context passed to each `VonoPlugin` during `boot()`. */
export interface BootContext {
  /** The Vue application instance — call `app.use(plugin)` here. */
  app:    App
  /**
   * The Vue Router instance — add global guards, set scroll behaviour, etc.
   * Called after the router is configured but before `router.isReady()`.
   */
  router: Router
}

/**
 * A plugin that runs once during `boot()`, after the Vue app and router are
 * created but before the app is mounted.
 *
 * Ideal for: `app.use(pinia)`, global error handlers, router guards,
 * analytics initialisation, and other side-effectful setup.
 *
 * @example
 * const piniaPlugin: VonoPlugin = ({ app }) => {
 *   const pinia = createPinia()
 *   app.use(pinia)
 * }
 *
 * boot({ routes, plugins: [piniaPlugin] })
 */
export type VonoPlugin = (ctx: BootContext) => void | Promise<void>

// ── Shared runtime constants ──────────────────────────────────────────────────

/** Custom request header that signals an SPA navigation (expect JSON, not HTML). */
export const SPA_HEADER = 'x-vono-spa' as const

/** `window` key for SSR-injected per-page loader data. */
export const STATE_KEY  = '__VONO_STATE__'  as const

/** `window` key for SSR-injected URL params. */
export const PARAMS_KEY = '__VONO_PARAMS__' as const

/** `window` key for SSR-injected SEO meta. */
export const SEO_KEY    = '__VONO_SEO__'    as const

/**
 * Vue `provide` / `inject` key for the reactive page-data object.
 *
 * `Symbol.for()` guarantees the same symbol reference across module instances,
 * which is essential for SSR correctness (server bundle + client bundle may
 * load separate copies of this module).
 */
export const DATA_KEY: InjectionKey<Readonly<Record<string, unknown>>> =
  Symbol.for('vono:data')

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
 *   path:   '/',
 *   loader: async () => ({ title: 'Hello', count: 42 }),
 *   component: () => import('./pages/home.vue'),
 * })
 * export type HomeData = InferPageData<typeof homePage>
 * // HomeData ≡ { title: string; count: number }
 *
 * // app/pages/home.vue
 * import type { HomeData } from '../routes'
 * const data = usePageData<HomeData>()  // ✅ fully typed
 */
export type InferPageData<T> = T extends PageDef<infer D> ? D : never
