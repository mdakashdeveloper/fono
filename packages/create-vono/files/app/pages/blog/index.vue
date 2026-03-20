<script setup lang="ts">
import { ref, computed } from 'vue'
import { RouterLink } from 'vue-router'
import { usePageData } from '@netrojs/vono/client'
import type { BlogListData } from '../routes'

const data   = usePageData<BlogListData>()
const search = ref('')

const filtered = computed(() =>
  search.value.trim() === ''
    ? data.posts
    : data.posts.filter(p =>
        p.title.toLowerCase().includes(search.value.toLowerCase()) ||
        p.tags.some(t => t.includes(search.value.toLowerCase()))
      )
)

// All unique tags from all posts
const allTags = computed(() => [...new Set(data.posts.flatMap(p => p.tags))])
</script>

<template>
  <div class="page">
    <h1>Blog</h1>
    <p class="lead">Deep dives into Vue 3, Hono, SSR, and the Vono framework.</p>

    <!-- Search -->
    <div class="search-row">
      <input
        v-model="search"
        class="search-input"
        type="search"
        placeholder="Search posts or tags…"
        aria-label="Search posts"
      >
      <div class="tag-row">
        <button
          v-for="tag in allTags"
          :key="tag"
          class="tag"
          :class="{ active: search === tag }"
          @click="search = search === tag ? '' : tag"
        >
          #{{ tag }}
        </button>
      </div>
    </div>

    <!-- Post list -->
    <div class="post-list" v-if="filtered.length">
      <RouterLink
        v-for="post in filtered"
        :key="post.slug"
        :to="`/blog/${post.slug}`"
        class="post-card"
      >
        <div class="post-meta">
          <span>{{ post.author }}</span>
          <span>{{ post.date }}</span>
          <span class="tag" v-for="tag in post.tags" :key="tag">#{{ tag }}</span>
        </div>
        <h2 class="post-card-title">{{ post.title }}</h2>
        <p class="post-card-excerpt">{{ post.excerpt }}</p>
        <span class="post-views">{{ post.views.toLocaleString() }} views</span>
      </RouterLink>
    </div>
    <p v-else class="muted">No posts match "{{ search }}".</p>
  </div>
</template>
