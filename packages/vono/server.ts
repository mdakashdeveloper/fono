// ─────────────────────────────────────────────────────────────────────────────
//  Vono · server.ts
//  Hono app factory · Vue 3 streaming SSR · SEO head injection
//  Asset manifest resolution · Multi-runtime serve() · Vite dual-bundle plugin
// ─────────────────────────────────────────────────────────────────────────────

import { Hono } from 'hono'
import {
  createSSRApp,
  defineComponent,
  h,
  Suspense,
  type Component,
} from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import { renderToString, renderToWebStream } from '@vue/server-renderer'
import { build, type Plugin, type InlineConfig, type UserConfig } from 'vite'
import {
  resolveRoutes,
  compilePath,
  matchPath,
  toVueRouterPath,
  isAsyncLoader,
  SPA_HEADER,
  STATE_KEY,
  PARAMS_KEY,
  SEO_KEY,
  DATA_KEY,
  type AppConfig,
  type ResolvedRoute,
  type LayoutDef,
  type SEOMeta,
  type Runtime,
} from './core'

// ── MIME types (used by Bun and Deno static-file handlers) ───────────────────

const MIME: Readonly<Record<string, string>> = {
  js:    'application/javascript; charset=utf-8',
  mjs:   'application/javascript; charset=utf-8',
  cjs:   'application/javascript; charset=utf-8',
  css:   'text/css; charset=utf-8',
  html:  'text/html; charset=utf-8',
  json:  'application/json; charset=utf-8',
  map:   'application/json; charset=utf-8',
  svg:   'image/svg+xml',
  png:   'image/png',
  jpg:   'image/jpeg',
  jpeg:  'image/jpeg',
  gif:   'image/gif',
  webp:  'image/webp',
  ico:   'image/x-icon',
  woff:  'font/woff',
  woff2: 'font/woff2',
  ttf:   'font/ttf',
  otf:   'font/otf',
  txt:   'text/plain; charset=utf-8',
}

function mimeForPath(p: string): string {
  const ext = p.split('.').pop() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

// ── HTML escape ───────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;')
}

// ── SEO → <head> HTML ─────────────────────────────────────────────────────────

function buildHeadMeta(seo: SEOMeta, extraHead: string): string {
  const parts: string[] = []
  const m = (name: string, val?: string) =>
    val ? parts.push(`<meta name="${name}" content="${esc(val)}">`) : undefined
  const p = (prop: string, val?: string) =>
    val ? parts.push(`<meta property="${prop}" content="${esc(val)}">`) : undefined
  const l = (rel: string, href: string) =>
    parts.push(`<link rel="${rel}" href="${esc(href)}">`)

  // Standard meta
  m('description',  seo.description)
  m('keywords',     seo.keywords)
  m('author',       seo.author)
  m('robots',       seo.robots)
  m('theme-color',  seo.themeColor)

  // Open Graph
  p('og:title',       seo.ogTitle)
  p('og:description', seo.ogDescription)
  p('og:image',       seo.ogImage)
  p('og:image:alt',   seo.ogImageAlt)
  p('og:url',         seo.ogUrl)
  p('og:type',        seo.ogType)
  p('og:site_name',   seo.ogSiteName)

  // Twitter / X Cards
  m('twitter:card',        seo.twitterCard)
  m('twitter:site',        seo.twitterSite)
  m('twitter:creator',     seo.twitterCreator)
  m('twitter:title',       seo.twitterTitle)
  m('twitter:description', seo.twitterDescription)
  m('twitter:image',       seo.twitterImage)
  m('twitter:image:alt',   seo.twitterImageAlt)

  // Canonical link
  if (seo.canonical) l('canonical', seo.canonical)

  // JSON-LD structured data
  const schemas = seo.jsonLd
    ? Array.isArray(seo.jsonLd) ? seo.jsonLd : [seo.jsonLd]
    : []
  for (const schema of schemas) {
    // JSON.stringify output is safe inside <script type="application/ld+json">
    // as long as we escape the closing tag sequence.
    const json = JSON.stringify(schema).replace(/<\/script>/gi, '<\\/script>')
    parts.push(`<script type="application/ld+json">${json}</script>`)
  }

  if (extraHead) parts.push(extraHead)
  return parts.join('\n')
}

function mergeSEO(base: SEOMeta | undefined, override: SEOMeta | undefined): SEOMeta {
  return { ...(base ?? {}), ...(override ?? {}) }
}

// ── Asset manifest resolution ─────────────────────────────────────────────────

export interface AssetConfig {
  /** Explicit script URLs. Overridden by `manifestDir`. */
  scripts?:       string[]
  /** Explicit stylesheet URLs. Overridden by `manifestDir`. */
  styles?:        string[]
  /** Directory that contains `dist/assets/.vite/manifest.json`. */
  manifestDir?:   string
  /** Key in the manifest JSON to use as the entry point. */
  manifestEntry?: string
}

interface ResolvedAssets {
  scripts: string[]
  styles:  string[]
}

// Cached after first production request — the manifest does not change at
// runtime.  Reset only on process restart.
let _assetsCache: ResolvedAssets | null = null

async function resolveAssets(
  cfg:          AssetConfig,
  defaultEntry: string,
): Promise<ResolvedAssets> {
  if (_assetsCache) return _assetsCache

  if (cfg.manifestDir) {
    try {
      const { readFileSync } = await import('node:fs')
      const { join }         = await import('node:path')
      const raw      = readFileSync(join(cfg.manifestDir, '.vite', 'manifest.json'), 'utf-8')
      const manifest = JSON.parse(raw) as Record<string, { file: string; css?: string[] }>

      // Find the entry matching `defaultEntry` (e.g. 'client.ts')
      const key   = cfg.manifestEntry
        ?? Object.keys(manifest).find(k => k.endsWith(defaultEntry))
        ?? defaultEntry
      const entry = manifest[key]

      if (entry) {
        _assetsCache = {
          scripts: [`/assets/${entry.file}`],
          styles:  (entry.css ?? []).map(f => `/assets/${f}`),
        }
        return _assetsCache
      }
    } catch {
      // Manifest missing or malformed — fall through to explicit / default
    }
  }

  _assetsCache = {
    scripts: cfg.scripts ?? ['/assets/client.js'],
    styles:  cfg.styles  ?? [],
  }
  return _assetsCache
}

// ── HTML shell ────────────────────────────────────────────────────────────────

interface ShellParts {
  /** Full document from `<!DOCTYPE html>` through `<div id="vono-app">`. */
  head: string
  /** Everything after the closing `</div>`. */
  tail: string
}

function buildShell(
  title:     string,
  metaHtml:  string,
  stateJson: string,
  paramsJson: string,
  seoJson:   string,
  scripts:   string[],
  styles:    string[],
  htmlAttrs: Record<string, string>,
): ShellParts {
  const attrs = Object.entries({ lang: 'en', ...htmlAttrs })
    .map(([k, v]) => `${k}="${esc(v)}"`)
    .join(' ')

  const styleLinks  = styles .map(h => `<link rel="stylesheet" href="${esc(h)}">`).join('\n')
  const scriptTags  = scripts.map(s => `<script type="module" src="${esc(s)}"></script>`).join('\n')

  // Note on script injection order: stylesheets first so paint is not blocked;
  // ES modules are deferred by default so no `defer` attribute needed.
  const head = [
    '<!DOCTYPE html>',
    `<html ${attrs}>`,
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    `<title>${esc(title)}</title>`,
    styleLinks,
    metaHtml,
    '</head>',
    '<body>',
    '<div id="vono-app">',
  ].filter(Boolean).join('\n')

  const tail = [
    '</div>',
    // Inline bootstrap data — JSON is safe here because we serialise with
    // JSON.stringify which never emits </script>.  We add the extra
    // script-closing escape just in case a user has string values with it.
    '<script>',
    `window.${STATE_KEY}=${stateJson.replace(/<\/script>/gi, '<\\/script>')};`,
    `window.${PARAMS_KEY}=${paramsJson};`,
    `window.${SEO_KEY}=${seoJson.replace(/<\/script>/gi, '<\\/script>')};`,
    '</script>',
    scriptTags,
    '</body>',
    '</html>',
  ].join('\n')

  return { head, tail }
}

// ── Async component loader ────────────────────────────────────────────────────

/**
 * Await an async component loader so SSR always renders the real component
 * rather than a loading placeholder.
 */
async function resolveComponent(
  comp: Component | ((...args: unknown[]) => unknown),
): Promise<Component> {
  if (isAsyncLoader(comp)) {
    const mod = await (comp as () => Promise<unknown>)()
    return ((mod as { default?: Component }).default ?? mod) as Component
  }
  return comp as Component
}

// ── Per-request Vue SSR renderer ──────────────────────────────────────────────
//
// A fresh Vue app + router is created for every request so there is no shared
// mutable state between concurrent requests (SSR safety rule #1 from the
// Vue docs: https://vuejs.org/guide/scaling-up/ssr#cross-request-state-pollution).
//
// <Suspense> wrapper — why it matters:
//   Vue's renderToString / renderToWebStream only awaits async operations when
//   the component tree is wrapped in <Suspense>.  Without it:
//     • `onServerPrefetch()` hooks are silently skipped
//     • `async setup()` / top-level await in <script setup> is skipped
//   Both would cause hydration mismatches and missing server-rendered data.
//   See: https://vuejs.org/guide/built-ins/suspense
//        https://vuejs.org/api/composition-api-lifecycle#onserverprefetch
//
// Dev vs production rendering:
//   DEV  — renderToString() → buffered string.
//     @hono/vite-dev-server wraps Hono inside Vite's Connect pipeline.
//     Connect does not forward a streaming response body to the browser.
//     Using c.html() with the buffered string produces a normal HTTP response.
//     See: https://github.com/honojs/vite-plugins/tree/main/packages/dev-server
//
//   PROD — renderToWebStream() → ReadableStream.
//     Lower TTFB: the browser receives <head> (CSS, module preloads) while Vue
//     is still rendering the component tree.
//     See: https://vuejs.org/api/ssr#rendertorenderstream (web stream variant)

async function renderPage(
  route:     ResolvedRoute,
  data:      object,
  url:       string,
  appLayout: LayoutDef | undefined,
  dev:       boolean,
): Promise<ReadableStream<Uint8Array> | string> {
  const layout   = route.layout !== undefined ? route.layout : appLayout
  const PageComp = await resolveComponent(route.page.component)

  // If a layout is active, wrap the page component inside it using a thin
  // wrapper component rather than mutating the layout or page components.
  const routeComp: Component = layout
    ? defineComponent({
        name:  'VonoRouteWrapper',
        setup: () => () =>
          h(layout.component as Component, null, { default: () => h(PageComp) }),
      })
    : PageComp

  const app = createSSRApp({
    name:   'VonoSSR',
    // <Suspense> enables onServerPrefetch and async setup() in all descendants.
    // The fallback renders nothing — on the server we always await the default
    // slot fully before the stream is flushed.
    render: () =>
      h(Suspense, null, {
        default:  () => h(RouterView),
        fallback: () => null,
      }),
  })

  // Provide the loader data so any component can access it via inject(DATA_KEY).
  app.provide(DATA_KEY, data as Record<string, unknown>)

  // Initialise memory history at the request URL BEFORE creating the router.
  // Vue Router performs a startup navigation to the history's current location.
  // Calling replace() here ensures that navigation resolves to the matched
  // route rather than '/', eliminating the "No match found for '/'" warning.
  // See: https://router.vuejs.org/api/interfaces/RouterOptions.html#history
  const memHistory = createMemoryHistory()
  memHistory.replace(url)

  const router = createRouter({
    history: memHistory,
    routes:  [{ path: toVueRouterPath(route.fullPath), component: routeComp }],
  })
  app.use(router)
  await router.isReady()

  return dev ? renderToString(app) : renderToWebStream(app)
}

// ── Response stream builder ───────────────────────────────────────────────────

/**
 * Sandwich a Vue `ReadableStream` between HTML head and tail strings,
 * producing a single streaming response body.
 */
function buildResponseStream(
  headHtml:   string,
  bodyStream: ReadableStream<Uint8Array>,
  tailHtml:   string,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()

  // Run the pump in a floating promise.  Errors abort the writable side so
  // the readable side closes with an error rather than hanging indefinitely.
  void (async () => {
    const writer = writable.getWriter()
    try {
      await writer.write(enc.encode(headHtml))
      const reader = bodyStream.getReader()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        await writer.write(value)
      }

      await writer.write(enc.encode(tailHtml))
      await writer.close()
    } catch (err) {
      await writer.abort(err)
    }
  })()

  return readable
}

// ── createVono ────────────────────────────────────────────────────────────────

export interface VonoOptions extends AppConfig {
  assets?: AssetConfig
}

export interface VonoApp {
  /** The Hono instance — attach extra routes, error handlers, or middleware. */
  app:     Hono
  /**
   * WinterCG-compatible `fetch` handler.
   * Use this when deploying to edge runtimes (Cloudflare Workers, etc.) instead
   * of `serve()`.
   */
  handler: Hono['fetch']
}

/**
 * Create the Vono application.
 *
 * Returns `{ app, handler }`:
 *   - `app`     — the Hono instance (attach extra routes / middleware)
 *   - `handler` — a WinterCG fetch handler for edge runtimes
 *
 * @example
 * // server.ts
 * import { createVono, serve } from '@netrojs/vono/server'
 * import { routes } from './app/routes'
 *
 * const vono = createVono({ routes })
 * await serve({ app: vono })
 */
export function createVono(config: VonoOptions): VonoApp {
  const app = new Hono()

  // ── Global middleware ────────────────────────────────────────────────────
  for (const mw of config.middleware ?? []) {
    app.use('*', mw)
  }

  // ── Route resolution ─────────────────────────────────────────────────────
  const { pages, apis } = resolveRoutes(config.routes, {
    ...(config.layout !== undefined && { layout: config.layout }),
  })

  // Pre-compile path patterns once at startup to avoid per-request RegExp
  // construction (path matching is on the hot path for every request).
  const compiled = pages.map(r => ({ route: r, cp: compilePath(r.fullPath) }))

  // ── API sub-apps ─────────────────────────────────────────────────────────
  // API routes are registered before the catch-all page handler so Hono's
  // trie router resolves them first.
  for (const api of apis) {
    const sub = new Hono()
    api.register(sub, config.middleware ?? [])
    app.route(api.path, sub)
  }

  // ── Catch-all SSR / SPA handler ──────────────────────────────────────────
  //
  // The entire handler body is wrapped in try/catch.
  //
  // Why: any unhandled rejection inside an async Hono handler causes
  // @hono/vite-dev-server to never write bytes to the socket.  The browser
  // connection hangs until the idle timeout fires and reports the misleading
  // "localhost refused to connect" message — even though Vite is running fine.
  // See: https://github.com/honojs/vite-plugins/issues (various hanging issues)
  //
  // In production an uncaught rejection would crash the process.  The
  // try/catch ensures that any rendering / loader / middleware failure always
  // produces a valid HTTP response.

  app.all('*', async (c) => {
    try {
      const url      = new URL(c.req.url)
      const pathname = url.pathname
      const isSPA    = c.req.header(SPA_HEADER) === '1'
      const isDev    = process.env['NODE_ENV'] !== 'production'

      // ── Route matching ─────────────────────────────────────────────────
      let matched: { route: ResolvedRoute; params: Record<string, string> } | null = null
      for (const { route, cp } of compiled) {
        const params = matchPath(cp, pathname)
        if (params !== null) {
          matched = { route, params }
          break
        }
      }

      if (!matched) {
        if (config.notFound) {
          // SSR the notFound component into a minimal HTML shell.
          const html = await renderToString(createSSRApp(config.notFound))
          return c.html(
            `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
            `<title>404 Not Found</title></head><body>${html}</body></html>`,
            404,
          )
        }
        return c.text('Not Found', 404)
      }

      const { route, params } = matched

      // ── Dynamic params → c.req.param() ────────────────────────────────
      // Merge URL params captured by Vono's path matcher into Hono's param
      // accessor so loaders can call `c.req.param('slug')` as expected.
      const honoParam = c.req.param.bind(c.req)
      ;(c.req as any)['param'] =
        (key?: string): any =>
          key != null
            ? (params[key] ?? (honoParam as (k: string) => string)(key))
            : { ...(honoParam as any)(), ...params }

      // ── Route middleware chain ─────────────────────────────────────────
      let earlyResponse: Response | undefined
      let mwIndex = 0
      const runNextMw = async (): Promise<void> => {
        const mw = route.middleware[mwIndex++]
        if (!mw) return
        const res = await mw(c, runNextMw)
        if (res instanceof Response && !earlyResponse) earlyResponse = res
      }
      await runNextMw()
      if (earlyResponse) return earlyResponse

      // ── Loader ────────────────────────────────────────────────────────
      const rawData = route.page.loader ? await route.page.loader(c) : {}
      const data    = (rawData ?? {}) as object

      // ── Resolve SEO ───────────────────────────────────────────────────
      const pageSEO = typeof route.page.seo === 'function'
        ? route.page.seo(data as never, params)
        : (route.page.seo ?? {})
      const seo = mergeSEO(config.seo, pageSEO)

      // ── SPA navigation — JSON response ────────────────────────────────
      if (isSPA) {
        return c.json({ state: data, params, url: pathname, seo })
      }

      // ── Full SSR — HTML response ───────────────────────────────────────
      const clientEntry = config.assets?.manifestEntry ?? 'client.ts'
      const assets = isDev
        ? { scripts: [`/${clientEntry}`], styles: [] as string[] }
        : await resolveAssets(config.assets ?? {}, clientEntry)

      const { head, tail } = buildShell(
        seo.title ?? 'Vono',
        buildHeadMeta(seo, config.head ?? ''),
        JSON.stringify({ [pathname]: data }),
        JSON.stringify(params),
        JSON.stringify(seo),
        assets.scripts,
        assets.styles,
        config.htmlAttrs ?? {},
      )

      const body = await renderPage(route, data, pathname, config.layout, isDev)

      if (isDev) {
        // Buffered response — required for @hono/vite-dev-server / Connect.
        return c.html(head + (body as string) + tail)
      }

      // Streaming response — lowest possible TTFB in production.
      const stream = buildResponseStream(
        head,
        body as ReadableStream<Uint8Array>,
        tail,
      )
      return c.body(stream, 200, {
        'Content-Type':           'text/html; charset=UTF-8',
        'X-Content-Type-Options': 'nosniff',
      })

    } catch (err) {
      console.error('[vono] Request error:', err)

      if (process.env['NODE_ENV'] !== 'production') {
        const message = err instanceof Error ? err.message      : String(err)
        const stack   = err instanceof Error ? (err.stack ?? '') : ''
        return c.html(
          `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
          `<title>Vono — SSR Error</title>` +
          `<style>pre{color:#f87171;font-family:monospace;padding:2rem;` +
          `white-space:pre-wrap;line-height:1.5}</style>` +
          `</head><body>` +
          `<pre>[vono] SSR error\n\n${esc(message)}\n\n${esc(stack)}</pre>` +
          `</body></html>`,
          500,
        )
      }
      return c.text('Internal Server Error', 500)
    }
  })

  return { app, handler: app.fetch.bind(app) }
}

// ── Runtime detection ─────────────────────────────────────────────────────────

/**
 * Detect the current JavaScript runtime environment.
 *
 * Detection order: Bun → Deno → Node.js → edge (fallback).
 *
 * @example
 * const runtime = detectRuntime() // 'bun' | 'deno' | 'node' | 'edge'
 */
export function detectRuntime(): Runtime {
  if (typeof (globalThis as Record<string, unknown>)['Bun']  !== 'undefined') return 'bun'
  if (typeof (globalThis as Record<string, unknown>)['Deno'] !== 'undefined') return 'deno'
  if (typeof process !== 'undefined' && process.versions?.node)                return 'node'
  return 'edge'
}

// ── serve() ───────────────────────────────────────────────────────────────────

export interface ServeOptions {
  app:        VonoApp
  port?:      number
  hostname?:  string
  /**
   * Override the auto-detected runtime.
   *
   * Vono validates this against the actual environment.  If there is a
   * mismatch (e.g. you compiled `runtime: 'bun'` into the bundle but run it
   * with `node`), it logs a warning and falls back to the detected runtime
   * rather than crashing.
   */
  runtime?:   Runtime
  /**
   * Root directory used by Node.js `serveStatic` and Bun / Deno static-file
   * handlers.  Should point to your built output folder containing `assets/`.
   * @default './dist'
   */
  staticDir?: string
}

/**
 * Start the HTTP server on the given port.
 *
 * Automatically detects whether you are running under Node.js, Bun, or Deno
 * and starts the appropriate server adapter.  For edge runtimes (Cloudflare
 * Workers, Vercel Edge, etc.) use `vono.handler` directly instead.
 *
 * @example
 * // server.ts
 * await serve({ app: vono, port: 3000 })
 */
export async function serve(opts: ServeOptions): Promise<void> {
  const detected  = detectRuntime()
  const requested = opts.runtime ?? detected

  // Validate — a bundle compiled for 'bun' but run with 'node' would crash
  // inside `case 'bun':` when it tries `globalThis.Bun.serve()`.
  const runtime: Runtime =
    requested === detected
      ? requested
      : (console.warn(
          `[vono] serve(): requested runtime "${requested}" but detected ` +
          `"${detected}". Falling back to "${detected}".`,
        ),
        detected)

  const port        = opts.port ?? Number(process?.env?.['PORT'] ?? 3000)
  const hostname    = opts.hostname ?? '0.0.0.0'
  const staticDir   = opts.staticDir ?? './dist'
  const displayHost = hostname === '0.0.0.0' ? 'localhost' : hostname

  const logReady = (): void =>
    console.log(`\n🔥  Vono [${runtime}] → http://${displayHost}:${port}\n`)

  switch (runtime) {
    // ── Node.js ──────────────────────────────────────────────────────────────
    // Uses @hono/node-server which wraps Hono's fetch handler in Node's
    // http.createServer.  serve-static serves built assets from disk.
    // See: https://github.com/honojs/node-server
    case 'node': {
      const [{ serve: nodeServe }, { serveStatic }] = await Promise.all([
        import('@hono/node-server'),
        import('@hono/node-server/serve-static'),
      ])
      // /assets/* served from dist/assets (Vite build output)
      opts.app.app.use('/assets/*', serveStatic({ root: staticDir }))
      // /* served from public/ (static files copied verbatim by Vite)
      opts.app.app.use('/*', serveStatic({ root: './public' }))
      nodeServe({ fetch: opts.app.handler, port, hostname })
      logReady()
      break
    }

    // ── Bun ──────────────────────────────────────────────────────────────────
    // Bun.serve() accepts a WinterCG fetch handler directly.
    // Static files are served via Bun.file() — no extra dependencies needed.
    // See: https://bun.sh/docs/api/http
    case 'bun': {
      const { join } = await import('node:path')
      const BunGlobal = (globalThis as Record<string, unknown>)['Bun'] as {
        serve: (opts: { fetch: Hono['fetch']; port: number; hostname: string }) => void
        file:  (path: string) => { exists(): Promise<boolean>; readonly size: number }
      }

      opts.app.app.use('/assets/*', async (c, next) => {
        const rel  = c.req.path.replace(/^\/assets\//, '')
        const file = BunGlobal.file(join(staticDir, 'assets', rel))
        if (await file.exists()) {
          return new Response(file as unknown as ReadableStream, {
            headers: { 'Content-Type': mimeForPath(rel) },
          })
        }
        return next()
      })

      opts.app.app.use('/*', async (c, next) => {
        const rel  = c.req.path.replace(/^\//, '') || 'index.html'
        const file = BunGlobal.file(join('./public', rel))
        if (await file.exists()) {
          return new Response(file as unknown as ReadableStream, {
            headers: { 'Content-Type': mimeForPath(rel) },
          })
        }
        return next()
      })

      BunGlobal.serve({ fetch: opts.app.handler, port, hostname })
      logReady()
      break
    }

    // ── Deno ─────────────────────────────────────────────────────────────────
    // Deno.serve() is the standard Deno 1.35+ API for HTTP servers.
    // Static files are read with Deno.readFile() — available since Deno 1.0.
    // See: https://docs.deno.com/api/deno/~/Deno.serve
    case 'deno': {
      const { join } = await import('node:path')
      const DenoGlobal = (globalThis as Record<string, unknown>)['Deno'] as {
        serve:    (opts: { port: number; hostname: string }, handler: Hono['fetch']) => void
        readFile: (path: string) => Promise<Uint8Array>
      }

      const serveFile = async (path: string) => {
        try {
          const data = await DenoGlobal.readFile(path)
          return new Response(data as BodyInit, { headers: { 'Content-Type': mimeForPath(path) } })
        } catch {
          return null
        }
      }

      opts.app.app.use('/assets/*', async (c, next) => {
        const rel = c.req.path.replace(/^\/assets\//, '')
        const res = await serveFile(join(staticDir, 'assets', rel))
        return res ?? next()
      })

      opts.app.app.use('/*', async (c, next) => {
        const rel = c.req.path.replace(/^\//, '') || 'index.html'
        const res = await serveFile(join('./public', rel))
        return res ?? next()
      })

      DenoGlobal.serve({ port, hostname }, opts.app.handler)
      logReady()
      break
    }

    // ── Edge ─────────────────────────────────────────────────────────────────
    // Cloudflare Workers, Vercel Edge, etc. — export `vono.handler` directly.
    // serve() is a no-op on edge; the platform manages the HTTP lifecycle.
    default:
      console.warn(
        '[vono] serve() is a no-op on edge runtimes.\n' +
        '  Export vono.handler and configure your platform to call it.',
      )
  }
}

// ── Vite plugin ───────────────────────────────────────────────────────────────
//
// vonoVitePlugin() does exactly one thing: orchestrate the dual Vite build:
//
//   1. `vite build`  (server SSR bundle, target 'node18')
//      Input:  serverEntry  (default: 'server.ts')
//      Output: serverOutDir (default: 'dist/server/server.js')
//
//   2. `closeBundle` hook → `build()` (client SPA bundle)
//      Input:  clientEntry  (default: 'client.ts')
//      Output: clientOutDir (default: 'dist/assets/')
//              + .vite/manifest.json
//
// The user's vite.config.ts already includes vue() from @vitejs/plugin-vue.
// That plugin transforms .vue files in both dev mode and the SSR build.
// vonoVitePlugin() relies on it being present and does NOT re-apply it for
// the server build — adding vue() twice causes transform conflicts.
//
// The `target: 'node18'` in the server build config is critical: it tells
// esbuild to emit ES2022+ syntax which includes top-level await.  Without it
// esbuild defaults to a browser-compatible target that does NOT support TLA,
// causing "Top-level await is not available in the configured target" errors.
// See: https://vitejs.dev/config/build-options#build-target

const NODE_BUILTINS =
  /^node:|^(assert|buffer|child_process|cluster|crypto|dgram|dns|domain|events|fs|http|https|module|net|os|path|perf_hooks|process|punycode|querystring|readline|repl|stream|string_decoder|sys|timers|tls|trace_events|tty|url|util|v8|vm|worker_threads|zlib)$/

export interface VonoPluginOptions {
  /** Server entry file. @default 'server.ts' */
  serverEntry?:    string
  /** Client entry file. @default 'client.ts' */
  clientEntry?:    string
  /** Server bundle output directory. @default 'dist/server' */
  serverOutDir?:   string
  /** Client assets output directory. @default 'dist/assets' */
  clientOutDir?:   string
  /** Additional packages to mark external in the server bundle. */
  serverExternal?: string[]
  /**
   * Options forwarded to `@vitejs/plugin-vue` during the **client** build.
   * Has no effect on the server build (vue() from the user's config is used).
   */
  vueOptions?:     Record<string, unknown>
}

/**
 * Vite plugin that orchestrates Vono's dual-bundle production build.
 *
 * Add it **after** `vue()` and **before** `devServer()` in your plugins array.
 *
 * @example
 * // vite.config.ts
 * import vue        from '@vitejs/plugin-vue'
 * import { vonoVitePlugin } from '@netrojs/vono/vite'
 * import devServer  from '@hono/vite-dev-server'
 *
 * export default defineConfig({
 *   plugins: [vue(), vonoVitePlugin(), devServer({ entry: 'app.ts' })],
 * })
 */
export function vonoVitePlugin(opts: VonoPluginOptions = {}): Plugin {
  const {
    serverEntry    = 'server.ts',
    clientEntry    = 'client.ts',
    serverOutDir   = 'dist/server',
    clientOutDir   = 'dist/assets',
    serverExternal = [],
    vueOptions     = {},
  } = opts

  return {
    name:    'vono:build',
    apply:   'build',
    enforce: 'pre',

    config(): Omit<UserConfig, 'plugins'> {
      return {
        build: {
          ssr:    serverEntry,
          outDir: serverOutDir,
          // CRITICAL: 'node18' enables top-level await in the output bundle.
          target: 'node18',
          rollupOptions: {
            input:  serverEntry,
            output: {
              format:         'es',
              entryFileNames: 'server.js',
            },
            external: (id: string) =>
              NODE_BUILTINS.test(id)
              || id === 'vue'
              || id.startsWith('vue/')
              || id === 'vue-router'
              || id === '@vue/server-renderer'
              || id === '@vitejs/plugin-vue'
              || id === '@hono/node-server'
              || id === '@hono/node-server/serve-static'
              || serverExternal.includes(id),
          },
        },
      }
    },

    async closeBundle() {
      console.log('\n⚡  Vono: building client bundle…\n')

      // Dynamically import @vitejs/plugin-vue to avoid bundling it into the
      // server output — it is a devDependency and should not appear in dist/.
      let vuePlugin: Plugin | Plugin[]
      try {
        const mod     = await import('@vitejs/plugin-vue' as string)
        const factory = (mod.default ?? mod) as (o?: Record<string, unknown>) => Plugin | Plugin[]
        vuePlugin     = factory(vueOptions)
      } catch {
        throw new Error(
          '[vono] @vitejs/plugin-vue is required for the client build.\n' +
          '  Install it: npm i -D @vitejs/plugin-vue',
        )
      }

      const plugins = (
        Array.isArray(vuePlugin) ? vuePlugin : [vuePlugin]
      ) as InlineConfig['plugins']

      await build({
        configFile: false,
        plugins,
        build: {
          outDir:   clientOutDir,
          // Vite 5+ writes manifest to <outDir>/.vite/manifest.json
          manifest: true,
          rollupOptions: {
            input:  clientEntry,
            output: {
              format:         'es',
              entryFileNames: '[name]-[hash].js',
              chunkFileNames: '[name]-[hash].js',
              assetFileNames: '[name]-[hash][extname]',
            },
          },
        },
      })

      console.log('✅  Vono: both bundles ready\n')
    },
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
  ClientMiddleware, AsyncLoader, InferPageData, VonoPlugin, BootContext,
} from './core'
