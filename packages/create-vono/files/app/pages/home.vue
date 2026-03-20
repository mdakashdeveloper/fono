<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink } from 'vue-router'
import { usePageData } from '@netrojs/vono/client'
import type { HomeData } from '../routes'

// Full type inference — HomeData is derived from the loader via InferPageData<T>
const data = usePageData<HomeData>()

// Client-only state — demonstrates ref + onMounted working after SSR hydration
const activeFeature = ref(0)
const mounted       = ref(false)

onMounted(() => {
  mounted.value = true
  // Rotate the highlighted feature card every 3s
  setInterval(() => {
    activeFeature.value = (activeFeature.value + 1) % data.features.length
  }, 3000)
})
</script>

<template>
  <!-- ── Hero ──────────────────────────────────────────────────────────── -->
  <section class="hero">
    <div class="hero-badge">Full-stack · Vue 3 + Hono</div>
    <h1 class="hero-headline">{{ data.headline }}</h1>
    <p class="hero-sub">{{ data.subline }}</p>
    <div class="hero-actions">
      <RouterLink to="/blog" class="btn btn-primary">Read the Blog →</RouterLink>
      <RouterLink to="/dashboard" class="btn btn-ghost">Dashboard Demo</RouterLink>
    </div>

    <!-- Stat chips — data from the loader, typed -->
    <div class="stat-row">
      <div class="stat-chip">⚡ {{ data.stats.ssr }}</div>
      <div class="stat-chip">📦 {{ data.stats.bundle }}</div>
      <div class="stat-chip">🔒 {{ data.stats.dx }}</div>
    </div>
  </section>

  <!-- ── Feature grid ───────────────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">Everything you need</h2>
    <div class="feature-grid">
      <div
        v-for="(f, i) in data.features"
        :key="f.title"
        class="feature-card"
        :class="{ highlight: mounted && i === activeFeature }"
      >
        <span class="feature-icon">{{ f.icon }}</span>
        <h3 class="feature-title">{{ f.title }}</h3>
        <p class="feature-desc">{{ f.desc }}</p>
      </div>
    </div>
  </section>

  <!-- ── Recent posts ───────────────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">Recent posts</h2>
    <div class="post-list">
      <RouterLink
        v-for="post in data.recentPosts"
        :key="post.slug"
        :to="`/blog/${post.slug}`"
        class="post-card"
      >
        <div class="post-meta">
          <span>{{ post.date }}</span>
          <span class="tag" v-for="tag in post.tags.slice(0, 2)" :key="tag">#{{ tag }}</span>
        </div>
        <h3 class="post-card-title">{{ post.title }}</h3>
        <p class="post-card-excerpt">{{ post.excerpt }}</p>
        <span class="post-views">{{ post.views.toLocaleString() }} views</span>
      </RouterLink>
    </div>
    <RouterLink to="/blog" class="btn btn-ghost" style="margin-top:1.5rem">All posts →</RouterLink>
  </section>

  <!-- ── Code example ───────────────────────────────────────────────────── -->
  <section class="section">
    <h2 class="section-title">Type-safe in 3 lines</h2>
    <pre class="code-block"><code>// routes.ts
export const postPage = definePage({
  loader: async (c) =&gt; fetchPost(c.req.param('slug')),
  component: () =&gt; import('./pages/post.vue'),
})
export type PostData = InferPageData&lt;typeof postPage&gt;

// pages/post.vue
const data = usePageData&lt;PostData&gt;()  // ✅ fully typed, zero duplication</code></pre>
  </section>
</template>
