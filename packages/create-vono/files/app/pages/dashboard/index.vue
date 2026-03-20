<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { usePageData } from '@netrojs/vono/client'
import type { DashboardStats } from '../routes'

const data = usePageData<DashboardStats>()

// Client-only interactive state — verified working with onMounted after hydration
const selectedMetric = ref<'users' | 'views'>('views')
const chartMounted   = ref(false)

onMounted(() => { chartMounted.value = true })

const maxVal = computed(() =>
  Math.max(...data.trend.map(d => d[selectedMetric.value]))
)

const barHeight = (val: number) =>
  chartMounted.value ? `${Math.round((val / maxVal.value) * 100)}%` : '0%'

const kpis = computed(() => [
  { label: 'Total Users',    value: data.totalUsers.toLocaleString(),    icon: '👥' },
  { label: 'Total Posts',    value: data.totalPosts.toLocaleString(),    icon: '📝' },
  { label: 'Total Views',    value: data.totalViews.toLocaleString(),    icon: '👀' },
  { label: 'Recent Signups', value: `+${data.recentSignups}`,            icon: '🆕' },
])
</script>

<template>
  <!-- KPI cards -->
  <div class="kpi-grid">
    <div v-for="kpi in kpis" :key="kpi.label" class="kpi-card">
      <span class="kpi-icon">{{ kpi.icon }}</span>
      <div>
        <div class="kpi-value">{{ kpi.value }}</div>
        <div class="kpi-label">{{ kpi.label }}</div>
      </div>
    </div>
  </div>

  <!-- Interactive sparkline chart — client-only behaviour -->
  <div class="chart-card">
    <div class="chart-header">
      <h2 class="chart-title">7-day trend</h2>
      <div class="chart-tabs">
        <button
          class="chart-tab"
          :class="{ active: selectedMetric === 'views' }"
          @click="selectedMetric = 'views'"
        >Views</button>
        <button
          class="chart-tab"
          :class="{ active: selectedMetric === 'users' }"
          @click="selectedMetric = 'users'"
        >Users</button>
      </div>
    </div>

    <div class="chart-bars">
      <div
        v-for="d in data.trend"
        :key="d.day"
        class="bar-col"
      >
        <div class="bar-value">{{ d[selectedMetric] }}</div>
        <div class="bar-wrap">
          <div
            class="bar"
            :style="{ height: barHeight(d[selectedMetric]) }"
            :title="`${d.day}: ${d[selectedMetric]}`"
          />
        </div>
        <div class="bar-label">{{ d.day }}</div>
      </div>
    </div>
  </div>

  <!-- Hydration proof -->
  <div class="info-banner">
    ✅ This dashboard data was SSR-rendered on the server, hydrated on the client, and the
    chart is fully interactive — no extra fetch needed on first load.
    The <code>onMounted</code> hook animates the bars after hydration.
  </div>
</template>
