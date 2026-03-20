<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePageData } from '@netrojs/vono/client'
import type { Post } from '../routes'

interface PostsData { posts: Post[] }

const data   = usePageData<PostsData>()
const search = ref('')
const sorted = ref<'date' | 'views'>('date')

const rows = computed(() => {
  let list = [...data.posts]
  if (search.value) {
    list = list.filter(p => p.title.toLowerCase().includes(search.value.toLowerCase()))
  }
  return sorted.value === 'views'
    ? list.sort((a, b) => b.views - a.views)
    : list.sort((a, b) => b.date.localeCompare(a.date))
})
</script>

<template>
  <div class="dash-section">
    <div class="table-toolbar">
      <input
        v-model="search"
        class="search-input"
        type="search"
        placeholder="Filter posts…"
      >
      <div class="sort-tabs">
        <button class="chart-tab" :class="{ active: sorted === 'date' }"  @click="sorted = 'date'">Latest</button>
        <button class="chart-tab" :class="{ active: sorted === 'views' }" @click="sorted = 'views'">Top views</button>
      </div>
    </div>

    <table class="data-table">
      <thead>
        <tr>
          <th>Title</th>
          <th>Author</th>
          <th>Date</th>
          <th>Tags</th>
          <th style="text-align:right">Views</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="post in rows" :key="post.id">
          <td><strong>{{ post.title }}</strong></td>
          <td>{{ post.author }}</td>
          <td>{{ post.date }}</td>
          <td>
            <span class="tag" v-for="tag in post.tags" :key="tag">#{{ tag }}</span>
          </td>
          <td style="text-align:right">{{ post.views.toLocaleString() }}</td>
        </tr>
        <tr v-if="rows.length === 0">
          <td colspan="5" class="muted" style="text-align:center;padding:1.5rem">No posts match.</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
