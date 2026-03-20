<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
</script>

<template>
  <div class="app">
    <nav class="nav">
      <a href="/" class="logo">◈ FNetro</a>
      <div class="nav-links">
        <RouterLink to="/" class="nav-link" :class="{ active: route.path === '/' }">
          Home
        </RouterLink>
        <RouterLink to="/about" class="nav-link" :class="{ active: route.path === '/about' }">
          About
        </RouterLink>
      </div>
    </nav>

    <main class="main">
      <slot />
    </main>

    <footer class="footer">
      Built with
      <a href="https://github.com/netrosolutions/fnetro" rel="external noopener">◈ FNetro</a>
    </footer>
  </div>
</template>
