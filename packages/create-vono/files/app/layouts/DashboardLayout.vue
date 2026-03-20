<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed } from 'vue'

const route = useRoute()

const sideNav = [
  { to: '/dashboard',          icon: '📊', label: 'Overview'  },
  { to: '/dashboard/posts',    icon: '📝', label: 'Posts'     },
  { to: '/dashboard/settings', icon: '⚙️', label: 'Settings'  },
]

const pageTitle = computed(() => {
  const match = sideNav.find(n => n.to === route.path)
  return match?.label ?? 'Dashboard'
})
</script>

<template>
  <div class="dash-shell">
    <!-- ── Sidebar ───────────────────────────────────────────────────── -->
    <aside class="sidebar">
      <RouterLink to="/" class="sidebar-logo">◈ Vono</RouterLink>

      <nav class="sidebar-nav">
        <RouterLink
          v-for="item in sideNav"
          :key="item.to"
          :to="item.to"
          class="sidebar-link"
          :class="{ active: route.path === item.to }"
        >
          <span class="sidebar-icon">{{ item.icon }}</span>
          {{ item.label }}
        </RouterLink>
      </nav>

      <div class="sidebar-footer">
        <a href="/" class="sidebar-link">← Back to site</a>
      </div>
    </aside>

    <!-- ── Main area ─────────────────────────────────────────────────── -->
    <div class="dash-body">
      <header class="dash-header">
        <h1 class="dash-title">{{ pageTitle }}</h1>
        <span class="dash-badge">Demo mode — auth stub</span>
      </header>

      <main class="dash-content">
        <slot />
      </main>
    </div>
  </div>
</template>
