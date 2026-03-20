<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { usePageData } from '@netrojs/vono/client'
import type { BlogPostData } from '../routes'

// useRoute() works identically after SSR hydration — no special handling needed
const route = useRoute()
const data  = usePageData<BlogPostData>()

// Computed from loader data — reactive on SPA navigation
const post     = computed(() => data.post)
const notFound = computed(() => !post.value)
</script>

<template>
  <!-- 404 state — post not in loader data -->
  <div v-if="notFound" class="page">
    <h1>Post not found</h1>
    <p class="lead">No post matched <code>{{ route.params.slug }}</code>.</p>
    <RouterLink to="/blog" class="btn btn-ghost">← Back to Blog</RouterLink>
  </div>

  <!-- Post content -->
  <article v-else class="page">
    <!-- Tags -->
    <div class="post-meta" style="margin-bottom:1rem">
      <RouterLink to="/blog" class="muted">Blog</RouterLink>
      <span class="muted"> / </span>
      <span class="tag" v-for="tag in post!.tags" :key="tag">#{{ tag }}</span>
    </div>

    <h1>{{ post!.title }}</h1>

    <div class="post-byline">
      <span>By {{ post!.author }}</span>
      <span class="muted">·</span>
      <time :datetime="post!.date">{{ post!.date }}</time>
      <span class="muted">·</span>
      <span>{{ post!.views.toLocaleString() }} views</span>
    </div>

    <p class="lead">{{ post!.excerpt }}</p>

    <div class="prose">
      <!-- In a real app: use a markdown renderer e.g. @shikijs/vitepress-twoslash -->
      <p>{{ post!.body }}</p>

      <blockquote>
        This is a demo post. In production, render markdown here using
        <code>marked</code>, <code>unified</code>, or your preferred pipeline.
      </blockquote>
    </div>

    <div class="post-footer">
      <RouterLink to="/blog" class="btn btn-ghost">← All posts</RouterLink>
    </div>
  </article>
</template>
