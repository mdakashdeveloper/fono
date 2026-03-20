<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { usePageData } from '@netrojs/fnetro/client'

interface HomeData {
  message:  string
  features: string[]
}

const data = usePageData<HomeData>()
</script>

<template>
  <div class="page">
    <h1>◈ FNetro</h1>
    <p class="lead">{{ data.message }}</p>
    <ul class="feature-list">
      <li v-for="f in data.features" :key="f">{{ f }}</li>
    </ul>
    <p class="hint">
      Edit <code>app/pages/home.vue</code> and save to see changes.
    </p>
    <RouterLink to="/about" class="btn">About →</RouterLink>
  </div>
</template>
