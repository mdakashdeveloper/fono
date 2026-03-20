import { createFNetro } from '@netrojs/fnetro/server'
import { routes } from './app/routes'

export const fnetro = createFNetro({
  routes,
  seo: {
    ogType:      'website',
    twitterCard: 'summary_large_image',
  },
})

// @hono/vite-dev-server needs a Hono instance as the default export
export default fnetro.app
