// ─────────────────────────────────────────────────────────────────────────────
//  global.d.ts  ·  Ambient type declarations for the Vono demo project
// ─────────────────────────────────────────────────────────────────────────────

// Allow importing CSS files in TypeScript
declare module '*.css'

// Augment the global Window object so TypeScript understands SSR-injected keys
interface Window {
  __VONO_STATE__:  Record<string, Record<string, unknown>>
  __VONO_PARAMS__: Record<string, string>
  __VONO_SEO__:    import('@netrojs/vono').SEOMeta
}
