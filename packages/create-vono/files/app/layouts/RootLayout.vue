<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { ref, onMounted } from 'vue'

const route       = useRoute()
const menuOpen    = ref(false)
const scrolled    = ref(false)

// Demonstrates onMounted + ref working correctly after SSR hydration
onMounted(() => {
  const handler = () => { scrolled.value = window.scrollY > 40 }
  window.addEventListener('scroll', handler, { passive: true })
  handler()
})

const nav = [
  { to: '/',     label: 'Home'  },
  { to: '/blog', label: 'Blog'  },
  { to: '/dashboard', label: 'Dashboard' },
]
</script>

<template>
  <div class="app">
    <!-- ── Sticky nav ─────────────────────────────────────────────────── -->
    <header class="nav" :class="{ scrolled }">
      <RouterLink to="/" class="logo" @click="menuOpen = false">◈ Vono</RouterLink>

      <nav class="nav-links" :class="{ open: menuOpen }">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: route.path === item.to || (item.to !== '/' && route.path.startsWith(item.to)) }"
          @click="menuOpen = false"
        >
          {{ item.label }}
        </RouterLink>
      </nav>

      <button class="menu-btn" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
        <span class="sr-only">Toggle menu</span>
        <span class="hamburger" :class="{ open: menuOpen }" />
      </button>
    </header>

    <!-- ── Page content (slot) ───────────────────────────────────────── -->
    <main class="main">
      <slot />
    </main>

    <!-- ── Footer ───────────────────────────────────────────────────── -->
    <footer class="footer">
      <span>Built with <a href="https://github.com/netrosolutions/vono" rel="external noopener">◈ Vono</a></span>
      <span class="footer-sep">·</span>
      <a href="https://hono.dev" rel="external noopener">Hono</a>
      <span class="footer-sep">·</span>
      <a href="https://vuejs.org" rel="external noopener">Vue 3</a>
    </footer>
  </div>
</template>
