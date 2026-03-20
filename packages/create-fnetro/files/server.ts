import { serve } from '@netrojs/fnetro/server'
import { fnetro } from './app'

await serve({
  app:     fnetro,
  port:    Number(process.env['PORT'] ?? 3000),
  runtime: 'node',
})
