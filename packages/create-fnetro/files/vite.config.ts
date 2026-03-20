import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fnetroVitePlugin } from '@netrojs/fnetro/vite'
import devServer from '@hono/vite-dev-server'

export default defineConfig({
  plugins: [
    // @vitejs/plugin-vue: handles .vue file transforms in dev + SSR builds
    vue(),
    // fnetroVitePlugin: orchestrates dual builds (server SSR + client SPA)
    fnetroVitePlugin({
      serverEntry:  'server.ts',
      clientEntry:  'client.ts',
      serverOutDir: 'dist/server',
      clientOutDir: 'dist/assets',
    }),
    // @hono/vite-dev-server: routes dev requests through the FNetro Hono app
    devServer({ entry: 'app.ts' }),
  ],
  server: {
    watch: { ignored: ['**/dist/**'] },
  },
})
