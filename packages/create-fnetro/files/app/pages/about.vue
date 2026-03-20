<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { usePageData } from '@netrojs/fnetro/client'

const data = usePageData<{ version: string }>()
</script>

<template>
  <div class="page">
    <h1>About FNetro</h1>
    <p>
      FNetro v{{ data.version }} is a full-stack framework built on
      <a href="https://hono.dev" rel="external noopener">Hono</a> and
      <a href="https://vuejs.org" rel="external noopener">Vue 3</a>.
    </p>
    <p>
      It gives you streaming SSR, SPA navigation, automatic code splitting,
      type-safe loaders, full SEO metadata, and Hono middleware — all in a
      tiny TypeScript-first package.
    </p>
    <RouterLink to="/" class="btn">← Home</RouterLink>
  </div>
</template>
