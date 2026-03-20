// ─────────────────────────────────────────────────────────────────────────────
//  Vono · client.ts
//  Browser hydration · Vue Router SPA · reactive page data · SEO sync
//  Composables · Lifecycle hooks · Reactivity API re-exports
// ─────────────────────────────────────────────────────────────────────────────

import {
  createSSRApp,
  defineAsyncComponent,
  defineComponent,
  h,
  inject,
  reactive,
  readonly,
  ref,
  watch,
  watchEffect,
  computed,
  nextTick,
  Suspense,
  type App,
  type Ref,
  type Component,
  type InjectionKey,
  type WatchOptions,
  type WatchStopHandle,
  type ComputedRef,
} from 'vue'
import {
  createRouter,
  createWebHistory,
  RouterView,
  useRoute,
  useRouter,
} from 'vue-router'
import {
  isAsyncLoader,
  resolveRoutes,
  toVueRouterPath,
  compilePath,
  matchPath,
  SPA_HEADER,
  STATE_KEY,
  SEO_KEY,
  DATA_KEY,
  type AppConfig,
  type LayoutDef,
  type SEOMeta,
  type ClientMiddleware,
  type VonoPlugin,
} from './core'

// ── SEO sync ──────────────────────────────────────────────────────────────────

function setMeta(selector: string, attrName: string, value?: string): void {
  if (!value) {
    document.querySelector(selector)?.remove()
    return
  }
  let el = document.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    // Parse selector like [name="description"] to set the identifying attribute
    const match = /\[([^=]+)="([^"]+)"\]/.exec(selector)
    if (match) el.setAttribute(match[1]!, match[2]!)
    document.head.appendChild(el)
  }
  el.setAttribute(attrName, value)
}

/**
 * Sync a `SEOMeta` object to the live DOM.
 * Called on every SPA navigation and on `useMeta()` changes.
 */
export function syncSEO(seo: SEOMeta): void {
  if (seo.title) document.title = seo.title

  setMeta('[name="description"]',         'content', seo.description)
  setMeta('[name="keywords"]',            'content', seo.keywords)
  setMeta('[name="author"]',              'content', seo.author)
  setMeta('[name="robots"]',              'content', seo.robots)
  setMeta('[name="theme-color"]',         'content', seo.themeColor)

  setMeta('[property="og:title"]',        'content', seo.ogTitle)
  setMeta('[property="og:description"]',  'content', seo.ogDescription)
  setMeta('[property="og:image"]',        'content', seo.ogImage)
  setMeta('[property="og:image:alt"]',    'content', seo.ogImageAlt)
  setMeta('[property="og:url"]',          'content', seo.ogUrl)
  setMeta('[property="og:type"]',         'content', seo.ogType)
  setMeta('[property="og:site_name"]',    'content', seo.ogSiteName)

  setMeta('[name="twitter:card"]',        'content', seo.twitterCard)
  setMeta('[name="twitter:site"]',        'content', seo.twitterSite)
  setMeta('[name="twitter:creator"]',     'content', seo.twitterCreator)
  setMeta('[name="twitter:title"]',       'content', seo.twitterTitle)
  setMeta('[name="twitter:description"]', 'content', seo.twitterDescription)
  setMeta('[name="twitter:image"]',       'content', seo.twitterImage)
  setMeta('[name="twitter:image:alt"]',   'content', seo.twitterImageAlt)

  // Canonical link element
  let canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (seo.canonical) {
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.appendChild(canonical)
    }
    canonical.href = seo.canonical
  } else {
    canonical?.remove()
  }
}

// ── SPA data fetch + bounded prefetch cache ───────────────────────────────────

interface SpaPayload {
  state:  Record<string, unknown>
  params: Record<string, string>
  seo:    SEOMeta
}

// Bounded LRU-style cache: when it exceeds MAX_CACHE_SIZE entries the oldest
// entry is evicted.  This prevents unbounded memory growth in long-lived SPAs.
const MAX_CACHE_SIZE = 50
const _fetchCache    = new Map<string, Promise<SpaPayload>>()

function fetchSPA(href: string): Promise<SpaPayload> {
  if (!_fetchCache.has(href)) {
    if (_fetchCache.size >= MAX_CACHE_SIZE) {
      // Evict the oldest entry (Map iteration order is insertion order)
      const oldest = _fetchCache.keys().next().value
      if (oldest !== undefined) _fetchCache.delete(oldest)
    }
    _fetchCache.set(
      href,
      fetch(href, { headers: { [SPA_HEADER]: '1' } }).then(r => {
        if (!r.ok) throw new Error(`[vono] ${r.status} ${r.statusText} — ${href}`)
        return r.json() as Promise<SpaPayload>
      }),
    )
  }
  return _fetchCache.get(href)!
}

/**
 * Warm the SPA data cache for a URL so the navigation data is ready before
 * the user clicks.
 *
 * Called automatically on link hover when `prefetchOnHover` is `true` (the
 * default).  You can call it manually to prefetch programmatically.
 *
 * @example
 * prefetch('/blog/my-post')
 */
export function prefetch(url: string): void {
  try {
    const u = new URL(url, location.origin)
    if (u.origin === location.origin) void fetchSPA(u.toString())
  } catch {
    // Ignore malformed URLs
  }
}

// ── Client middleware ─────────────────────────────────────────────────────────

const _clientMiddleware: ClientMiddleware[] = []

/**
 * Register a client-side navigation middleware.
 *
 * Must be called **before** `boot()`.  Middleware runs in registration order
 * on every SPA navigation, before the JSON data fetch.
 *
 * Call `next()` to continue; return without calling `next()` to abort.
 *
 * @example
 * useClientMiddleware(async (to, next) => {
 *   if (!isLoggedIn() && to.startsWith('/dashboard')) {
 *     await navigate('/login')
 *     return  // abort navigation
 *   }
 *   await next()
 * })
 */
export function useClientMiddleware(mw: ClientMiddleware): void {
  _clientMiddleware.push(mw)
}

async function runClientMiddleware(
  url:  string,
  done: () => Promise<void>,
): Promise<void> {
  const chain: ClientMiddleware[] = [
    ..._clientMiddleware,
    async (_, next) => { await done(); await next() },
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
// A single module-level reactive object that lives for the entire app lifetime.
// On each SPA navigation it is updated in-place (Object.assign + key deletion)
// so reactive derivations (computed, watch, template bindings) re-render
// without their component being unmounted and remounted.
//
// Provided to the Vue component tree via app.provide(DATA_KEY, readonly(obj)).
// The readonly() wrapper at the injection site prevents accidental mutation
// from user code while allowing Vono itself to update it via _pageData.

const _pageData = reactive<Record<string, unknown>>({})

function updatePageData(newData: Record<string, unknown>): void {
  // Remove keys no longer in the new data
  for (const key of Object.keys(_pageData)) {
    if (!(key in newData)) delete _pageData[key]
  }
  Object.assign(_pageData, newData)
}

// ── Module-level router ref ───────────────────────────────────────────────────
// Exported as a stable reference so navigate() and useNavigating() work
// outside Vue component trees.

let _router: ReturnType<typeof createRouter> | undefined
const _navigating = ref(false)

// ── Boot options ──────────────────────────────────────────────────────────────

export interface BootOptions extends AppConfig {
  /**
   * Plugins run after the Vue app and router are created but before the app
   * is mounted.  Use them to install stores (Pinia, Vuex), register global
   * components, or add router guards.
   *
   * @example
   * boot({
   *   routes,
   *   plugins: [
   *     ({ app })    => app.use(pinia),
   *     ({ router }) => router.beforeEach(myGuard),
   *   ],
   * })
   */
  plugins?:         VonoPlugin[]
  /**
   * Prefetch SPA data when the user hovers over a `<a>` link.
   * Reduces perceived navigation latency at the cost of a small amount of
   * extra network traffic.
   * @default true
   */
  prefetchOnHover?: boolean
}

// ── boot() ────────────────────────────────────────────────────────────────────

/**
 * Hydrate the server-rendered HTML and boot the Vue SPA.
 *
 * Call this once from your client entry point (`client.ts`).
 *
 * @example
 * import { boot } from '@netrojs/vono/client'
 * import { routes } from './app/routes'
 *
 * boot({ routes })
 */
export async function boot(options: BootOptions): Promise<void> {
  const container = document.getElementById('vono-app')
  if (!container) {
    console.error('[vono] boot(): #vono-app element not found — aborting hydration.')
    return
  }

  const { pages } = resolveRoutes(options.routes, {
    ...(options.layout !== undefined && { layout: options.layout }),
  })

  // ── Seed reactive store from server-injected state ────────────────────────
  const stateMap = (window as Record<string, unknown>)[STATE_KEY] as
    Record<string, Record<string, unknown>> | undefined ?? {}
  const seoData  = (window as Record<string, unknown>)[SEO_KEY] as SEOMeta | undefined ?? {}
  const pathname = location.pathname

  updatePageData(stateMap[pathname] ?? {})
  syncSEO(seoData)

  // ── Build Vue Router route table ──────────────────────────────────────────
  // Async loaders get wrapped in defineAsyncComponent() so the page chunk is
  // only fetched when the route is first visited (code splitting).
  // See: https://vuejs.org/guide/components/async#basic-usage
  const vueRoutes = pages.map(r => {
    const layout = r.layout !== undefined ? r.layout : options.layout
    const comp   = r.page.component

    const PageComp: Component = isAsyncLoader(comp)
      ? defineAsyncComponent(comp)
      : comp as Component

    const routeComp: Component = layout
      ? defineComponent({
          name:  'VonoRouteWrapper',
          setup: () => () =>
            h((layout as LayoutDef).component as Component, null, {
              default: () => h(PageComp),
            }),
        })
      : PageComp

    return { path: toVueRouterPath(r.fullPath), component: routeComp }
  })

  // ── Pre-load current route chunk ──────────────────────────────────────────
  // Pre-loading the current page's async chunk before hydration guarantees
  // the client VDOM tree matches the SSR HTML, preventing hydration mismatches.
  // See: https://vuejs.org/guide/scaling-up/ssr#code-splitting
  const current = pages.find(r => matchPath(compilePath(r.fullPath), pathname) !== null)
  if (current && isAsyncLoader(current.page.component)) {
    await current.page.component()
  }

  // ── Create Vue app ────────────────────────────────────────────────────────
  // createSSRApp() tells Vue to hydrate existing DOM instead of re-rendering.
  // The <Suspense> wrapper mirrors the server's renderPage() so the VDOM
  // structure matches exactly — required to avoid hydration mismatches on
  // pages that use async setup() or onServerPrefetch.
  // See: https://vuejs.org/guide/scaling-up/ssr#hydration-mismatch
  const app: App = createSSRApp({
    name:   'VonoApp',
    render: () =>
      h(Suspense, null, {
        default:  () => h(RouterView),
        fallback: () => null,
      }),
  })

  app.provide(DATA_KEY as InjectionKey<typeof _pageData>, readonly(_pageData))

  // ── Create Vue Router ─────────────────────────────────────────────────────
  const router = createRouter({
    history: createWebHistory(),
    routes:  vueRoutes,
  })
  _router = router

  // ── Navigation state ──────────────────────────────────────────────────────
  router.beforeEach(() => { _navigating.value = true })
  router.afterEach(()  => { _navigating.value = false })

  // ── SPA data guard ────────────────────────────────────────────────────────
  let isFirstNavigation = true

  router.beforeEach(async (to, _from, next) => {
    // First navigation is the initial page load — data is already injected by
    // the server, so we skip the fetch and go straight to hydration.
    if (isFirstNavigation) {
      isFirstNavigation = false
      return next()
    }

    const href = new URL(to.fullPath, location.origin).toString()

    try {
      await runClientMiddleware(to.fullPath, async () => {
        const payload = await fetchSPA(href)
        updatePageData(payload.state ?? {})
        syncSEO(payload.seo ?? {})
        window.scrollTo(0, 0)
      })
      next()
    } catch (err) {
      console.error('[vono] Navigation error:', err)
      // Hard navigate as a fallback — the server will handle the request
      location.href = to.fullPath
    }
  })

  // ── Run user plugins ──────────────────────────────────────────────────────
  for (const plugin of options.plugins ?? []) {
    await plugin({ app, router })
  }

  // ── Mount ─────────────────────────────────────────────────────────────────
  app.use(router)
  await router.isReady()
  app.mount(container)

  // ── Hover prefetch ────────────────────────────────────────────────────────
  if (options.prefetchOnHover !== false) {
    document.addEventListener('mouseover', (e) => {
      const anchor = (e as MouseEvent).composedPath()
        .find((el): el is HTMLAnchorElement => el instanceof HTMLAnchorElement)
      if (anchor?.href) prefetch(anchor.href)
    })
  }
}

// ── Composables ───────────────────────────────────────────────────────────────

/**
 * Access the current page's typed, reactive loader data inside any component.
 *
 * The returned object updates in-place on SPA navigation — reactive
 * derivations (`computed`, `watch`, template bindings) re-render automatically
 * without the component being remounted.
 *
 * Must be called inside `setup()` (or `<script setup>`).
 *
 * @example
 * const data = usePageData<{ title: string; posts: Post[] }>()
 * const title = computed(() => data.title)  // reactive
 */
export function usePageData<
  T extends Record<string, unknown> = Record<string, unknown>,
>(): Readonly<T> {
  const data = inject(DATA_KEY as InjectionKey<T>)
  if (data === undefined) {
    throw new Error(
      '[vono] usePageData() must be called inside a component setup() or <script setup>.',
    )
  }
  return data
}

/**
 * Access typed dynamic URL params for the current route.
 *
 * A typed wrapper around `useRoute().params`.  The params object updates
 * reactively when the route changes.
 *
 * Must be called inside `setup()`.
 *
 * @example
 * // route: /blog/[slug]
 * const { slug } = useParams<{ slug: string }>()
 */
export function useParams<
  T extends Record<string, string> = Record<string, string>,
>(): Readonly<T> {
  return useRoute().params as unknown as Readonly<T>
}

/**
 * Returns a readonly ref that is `true` while an SPA navigation is in flight
 * (the JSON fetch has been dispatched but not yet resolved).
 *
 * Use this to show a global loading indicator.
 *
 * @example
 * const navigating = useNavigating()
 * // <div v-if="navigating">Loading…</div>
 */
export function useNavigating(): Readonly<Ref<boolean>> {
  return readonly(_navigating)
}

/**
 * Reactively override SEO meta from within any component.
 *
 * Accepts a plain `SEOMeta` object (applied once) or a factory function (
 * re-evaluated whenever its reactive dependencies change, using `watchEffect`).
 *
 * No-op during SSR — server-side SEO is set by the loader's `seo` option.
 *
 * @example
 * // Static
 * useMeta({ title: 'My Page', description: 'Hello world' })
 *
 * // Reactive — re-runs when `post` changes
 * const post = computed(() => data.post)
 * useMeta(() => ({ title: post.value?.title ?? 'Loading…' }))
 */
export function useMeta(seo: SEOMeta | (() => SEOMeta)): void {
  if (typeof window === 'undefined') return  // SSR: server handles head
  if (typeof seo === 'function') {
    watchEffect(() => syncSEO(seo()))
  } else {
    syncSEO(seo)
  }
}

/**
 * Programmatic navigation — usable outside Vue component trees.
 *
 * Returns a `Promise` that resolves when navigation is complete.
 * Throws if called before `boot()`.
 *
 * @example
 * await navigate('/dashboard')
 * await navigate({ path: '/search', query: { q: 'vono' } })
 */
export function navigate(to: string | { path: string; query?: Record<string, string> }): Promise<void> {
  if (!_router) {
    throw new Error('[vono] navigate() was called before boot(). Call navigate() after awaiting boot().')
  }
  return _router.push(to as string).then(() => undefined)
}

// ── Re-exports from core ──────────────────────────────────────────────────────

export {
  definePage, defineGroup, defineLayout, defineApiRoute, isAsyncLoader,
  resolveRoutes, compilePath, matchPath, toVueRouterPath,
  SPA_HEADER, STATE_KEY, PARAMS_KEY, SEO_KEY, DATA_KEY,
} from './core'

export type {
  AppConfig, PageDef, GroupDef, LayoutDef, ApiRouteDef, Route,
  SEOMeta, HonoMiddleware, LoaderCtx, ResolvedRoute, CompiledPath,
  ClientMiddleware, AsyncLoader, InferPageData, VonoPlugin, BootContext,
} from './core'

// ── Vue Router re-exports ─────────────────────────────────────────────────────

export {
  useRoute,
  useRouter,
  RouterLink,
  RouterView,
  type Router,
  type RouteLocationNormalized,
  type NavigationGuard,
} from 'vue-router'

// ── Vue reactivity re-exports ─────────────────────────────────────────────────
//
// Exporting from '@netrojs/vono/client' means components do not need a
// separate `import from 'vue'` for the most common reactivity APIs.

export {
  ref,
  reactive,
  readonly,
  computed,
  watch,
  watchEffect,
  nextTick,
  type Ref,
  type ComputedRef,
  type WatchOptions,
  type WatchStopHandle,
} from 'vue'

// ── Vue lifecycle hooks re-exports ────────────────────────────────────────────
//
//  onMounted / onBeforeMount
//    Client-only. No-op during SSR. Fire after the component is inserted into
//    the DOM (onMounted) or just before (onBeforeMount).
//    https://vuejs.org/api/composition-api-lifecycle#onmounted
//
//  onUnmounted / onBeforeUnmount
//    Fire when the component is torn down (route change, v-if, etc.).
//    https://vuejs.org/api/composition-api-lifecycle#onunmounted
//
//  onUpdated / onBeforeUpdate
//    Fire on every reactive re-render after mount.
//    https://vuejs.org/api/composition-api-lifecycle#onupdated
//
//  onActivated / onDeactivated
//    Fire when a component inside <KeepAlive> enters / leaves the cache.
//    https://vuejs.org/api/composition-api-lifecycle#onactivated
//
//  onErrorCaptured
//    Intercepts errors from descendant components.  Return `false` to prevent
//    propagation to the global error handler.
//    https://vuejs.org/api/composition-api-lifecycle#onerrorcaptured
//
//  onServerPrefetch
//    SSR-only.  The returned Promise is awaited before renderToString /
//    renderToWebStream completes.  Requires the component tree to be wrapped
//    in <Suspense> — Vono adds this automatically in renderPage() and boot().
//    https://vuejs.org/api/composition-api-lifecycle#onserverprefetch
//
//  onRenderTracked / onRenderTriggered
//    Dev-mode debugging hooks.  Fire when a reactive dependency is tracked or
//    triggers a re-render.  No-op in production builds.
//    https://vuejs.org/api/composition-api-lifecycle#onrendertriggered

export {
  onMounted,
  onBeforeMount,
  onUnmounted,
  onBeforeUnmount,
  onUpdated,
  onBeforeUpdate,
  onActivated,
  onDeactivated,
  onErrorCaptured,
  onServerPrefetch,
  onRenderTracked,
  onRenderTriggered,
} from 'vue'
