// ─────────────────────────────────────────────────────────────────────────────
//  global.d.ts · Ambient type declarations
// ─────────────────────────────────────────────────────────────────────────────

// Allow importing CSS files in TypeScript (e.g. `import './style.css'`)
declare module '*.css'

// Augment the Window interface so TypeScript understands the SSR-injected
// bootstrap data that Vono writes into <script> tags in the HTML shell.
interface Window {
  __VONO_STATE__:  Record<string, Record<string, unknown>>
  __VONO_PARAMS__: Record<string, string>
  __VONO_SEO__:    import('@netrojs/vono').SEOMeta
}
