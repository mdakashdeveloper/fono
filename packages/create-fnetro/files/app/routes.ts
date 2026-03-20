import { definePage, defineLayout } from '@netrojs/fnetro'
import RootLayout from './layouts/RootLayout.vue'

export const rootLayout = defineLayout(RootLayout)

export const routes = [
  definePage({
    path:   '/',
    layout: rootLayout,
    seo: {
      title:       'Home — FNetro',
      description: 'Full-stack Vue 3 + Hono framework with SSR, SPA, and SEO.',
    },
    loader: () => ({
      message:  'Hello from FNetro!',
      features: [
        '⚡ Vue 3 SSR with streaming (renderToWebStream)',
        '🔀 Automatic code splitting via () => import()',
        '🔒 Type-safe loaders + usePageData()',
        '🔍 Full SEO — title, OG, Twitter, JSON-LD',
        '🛡️  Server & client middleware',
        '🚀 Node · Bun · Deno · Edge runtimes',
      ],
    }),
    // Dynamic import = separate JS chunk (code splitting)
    component: () => import('./pages/home.vue'),
  }),

  definePage({
    path:   '/about',
    layout: rootLayout,
    seo: {
      title:       'About — FNetro',
      description: 'Learn about the FNetro framework — Vue 3 + Hono.',
    },
    loader: () => ({ version: '{{FNETRO_VERSION}}' }),
    component: () => import('./pages/about.vue'),
  }),
]
