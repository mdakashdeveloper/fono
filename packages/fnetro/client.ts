// ─────────────────────────────────────────────────────────────────────────────
//  FNetro · client.ts
//  Vue 3 SSR hydration · Vue Router SPA · reactive page data · SEO sync
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  inject,
  reactive,
  readonly,
  type Component,
  type InjectionKey,
} from 'vue'
import {
  createRouter,
  createWebHistory,
  RouterView,
} from 'vue-router'
import {
  isAsyncLoader,
  resolveRoutes,
  toVueRouterPath,
  compilePath,
  matchPath,
  SPA_HEADER,
  STATE_KEY,
  PARAMS_KEY,
  SEO_KEY,
  DATA_KEY,
  type AppConfig,
  type LayoutDef,
  type SEOMeta,
  type ClientMiddleware,
} from './core'

// ── SEO ───────────────────────────────────────────────────────────────────────

function setMeta(selector: string, attr: string, val?: string): void {
  if (!val) { document.querySelector(selector)?.remove(); return }
  let el = document.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    const m = /\[([^=]+)="([^"]+)"\]/.exec(selector)
    if (m) el.setAttribute(m[1], m[2])
    document.head.appendChild(el)
  }
  el.setAttribute(attr, val)
}

export function syncSEO(seo: SEOMeta): void {
  if (seo.title) document.title = seo.title
  setMeta('[name="description"]',        'content', seo.description)
  setMeta('[name="keywords"]',           'content', seo.keywords)
  setMeta('[name="robots"]',             'content', seo.robots)
  setMeta('[name="theme-color"]',        'content', seo.themeColor)
  setMeta('[property="og:title"]',       'content', seo.ogTitle)
  setMeta('[property="og:description"]', 'content', seo.ogDescription)
  setMeta('[property="og:image"]',       'content', seo.ogImage)
  setMeta('[property="og:url"]',         'content', seo.ogUrl)
  setMeta('[property="og:type"]',        'content', seo.ogType)
  setMeta('[name="twitter:card"]',       'content', seo.twitterCard)
  setMeta('[name="twitter:title"]',      'content', seo.twitterTitle)
  setMeta('[name="twitter:description"]','content', seo.twitterDescription)
  setMeta('[name="twitter:image"]',      'content', seo.twitterImage)

  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (seo.canonical) {
    if (!link) {
      link = document.createElement('link')
      link.rel = 'canonical'
      document.head.appendChild(link)
    }
    link.href = seo.canonical
  } else {
    link?.remove()
  }
}

// ── SPA data fetch + prefetch cache ──────────────────────────────────────────

interface SpaPayload {
  state:  Record<string, unknown>
  params: Record<string, string>
  seo:    SEOMeta
}

// Module-level cache so repeated visits to the same URL don't re-fetch
const _fetchCache = new Map<string, Promise<SpaPayload>>()

function fetchSPA(href: string): Promise<SpaPayload> {
  if (!_fetchCache.has(href)) {
    _fetchCache.set(
      href,
      fetch(href, { headers: { [SPA_HEADER]: '1' } }).then(r => {
        if (!r.ok) throw new Error(`[fnetro] ${r.status} ${r.statusText} — ${href}`)
        return r.json() as Promise<SpaPayload>
      }),
    )
  }
  return _fetchCache.get(href)!
}

export function prefetch(url: string): void {
  try {
    const u = new URL(url, location.origin)
    if (u.origin === location.origin) fetchSPA(u.toString())
  } catch { /* ignore malformed URLs */ }
}

// ── Client middleware ─────────────────────────────────────────────────────────

const _mw: ClientMiddleware[] = []

/**
 * Register a client-side navigation middleware.
 * Must be called **before** `boot()`.
 *
 * @example
 * useClientMiddleware(async (url, next) => {
 *   if (!isLoggedIn() && url.startsWith('/dashboard')) {
 *     await navigate('/login')
 *     return
 *   }
 *   await next()
 * })
 */
export function useClientMiddleware(mw: ClientMiddleware): void {
  _mw.push(mw)
}

async function runMw(url: string, done: () => Promise<void>): Promise<void> {
  const chain: ClientMiddleware[] = [
    ..._mw,
    async (_: string, next: () => Promise<void>) => { await done(); await next() },
  ]
  let i = 0
  const run = async (): Promise<void> => {
    const fn = chain[i++]
    if (fn) await fn(url, run)
  }
  await run()
}

// ── Reactive page data ────────────────────────────────────────────────────────
//
// A single module-level reactive object that lives for the app's lifetime.
// On SPA navigation it is updated in-place so page components re-render
// reactively without being unmounted.
//
// The app provides it as readonly via DATA_KEY so page components cannot
// mutate it directly.

const _pageData = reactive<Record<string, unknown>>({})

function updatePageData(newData: Record<string, unknown>): void {
  // Delete keys that are no longer present in the new data
  for (const k of Object.keys(_pageData)) {
    if (!(k in newData)) delete _pageData[k]
  }
  Object.assign(_pageData, newData)
}

/**
 * Access the current page's loader data inside any Vue component.
 * The returned object is reactive — it updates automatically on navigation.
 *
 * @example
 * const data = usePageData<{ title: string; posts: Post[] }>()
 * // data.title is typed and reactive
 */
export function usePageData<T extends Record<string, unknown> = Record<string, unknown>>(): T {
  // DATA_KEY is typed as symbol; cast to InjectionKey for strong inference
  const data = inject(DATA_KEY as InjectionKey<T>)
  if (data === undefined) {
    throw new Error('[fnetro] usePageData() must be called inside a component setup().')
  }
  return data
}

// ── boot() ────────────────────────────────────────────────────────────────────

export interface BootOptions extends AppConfig {
  /** Warm fetch cache on link hover.  @default true */
  prefetchOnHover?: boolean
}

export async function boot(options: BootOptions): Promise<void> {
  const container = document.getElementById('fnetro-app')
  if (!container) {
    console.error('[fnetro] #fnetro-app not found — aborting hydration.')
    return
  }

  const { pages } = resolveRoutes(options.routes, {
    layout:     options.layout,
    middleware: [],
  })

  // Read server-injected bootstrap data
  const stateMap  = (window as any)[STATE_KEY]  as Record<string, Record<string, unknown>> ?? {}
  const seoData   = (window as any)[SEO_KEY]    as SEOMeta                                 ?? {}
  const pathname  = location.pathname

  // Seed reactive store and sync SEO from server data (no network request)
  updatePageData(stateMap[pathname] ?? {})
  syncSEO(seoData)

  // Build Vue Router route table
  // Async loaders are wrapped with defineAsyncComponent for code splitting.
  const vueRoutes = pages.map(r => {
    const layout = r.layout !== undefined ? r.layout : options.layout
    const comp   = r.page.component

    const PageComp: Component = isAsyncLoader(comp)
      ? defineAsyncComponent(comp)
      : comp as Component

    const routeComp: Component = layout
      ? defineComponent({
          name:  'FNetroRoute',
          setup: () => () => h((layout as LayoutDef).component as Component, null, {
            default: () => h(PageComp),
          }),
        })
      : PageComp

    return { path: toVueRouterPath(r.fullPath), component: routeComp }
  })

  // Pre-load the current route's async chunk BEFORE hydrating to guarantee the
  // client VDOM matches the SSR HTML (avoids hydration mismatch on first load).
  const currentRoute = pages.find(r => matchPath(compilePath(r.fullPath), pathname) !== null)
  if (currentRoute && isAsyncLoader(currentRoute.page.component)) {
    await currentRoute.page.component()
  }

  // createSSRApp: tells Vue to hydrate existing DOM instead of re-rendering
  const app = createSSRApp({ name: 'FNetroApp', render: () => h(RouterView) })
  app.provide(DATA_KEY as InjectionKey<typeof _pageData>, readonly(_pageData))

  const router = createRouter({ history: createWebHistory(), routes: vueRoutes })

  // Track whether this is the initial (server-hydrated) navigation.
  // We skip data fetching for the first navigation — the server already
  // injected the data into window.__FNETRO_STATE__.
  let isInitialNav = true

  router.beforeEach(async (to, _from, next) => {
    if (isInitialNav) {
      isInitialNav = false
      return next()
    }

    const href = new URL(to.fullPath, location.origin).toString()

    try {
      await runMw(to.fullPath, async () => {
        const payload = await fetchSPA(href)
        updatePageData(payload.state ?? {})
        syncSEO(payload.seo ?? {})
        window.scrollTo(0, 0)
      })
      next()
    } catch (err) {
      console.error('[fnetro] Navigation error:', err)
      // Hard navigate as fallback — the server will handle the request
      location.href = to.fullPath
    }
  })

  app.use(router)
  await router.isReady()
  app.mount(container)

  // Hover prefetch — warm the fetch cache before the user clicks
  if (options.prefetchOnHover !== false) {
    document.addEventListener('mouseover', (e) => {
      const a = (e as MouseEvent).composedPath()
        .find((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
      if (a?.href) prefetch(a.href)
    })
  }
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export {
  definePage, defineGroup, defineLayout, defineApiRoute, isAsyncLoader,
  resolveRoutes, compilePath, matchPath, toVueRouterPath,
  SPA_HEADER, STATE_KEY, PARAMS_KEY, SEO_KEY, DATA_KEY,
} from './core'

export type {
  AppConfig, PageDef, GroupDef, LayoutDef, ApiRouteDef, Route,
  SEOMeta, HonoMiddleware, LoaderCtx, ResolvedRoute, CompiledPath,
  ClientMiddleware, AsyncLoader,
} from './core'

// Vue Router composables re-exported for convenience
export {
  useRoute,
  useRouter,
  RouterLink,
  RouterView,
} from 'vue-router'
