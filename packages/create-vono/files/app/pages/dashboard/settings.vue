<script setup lang="ts">
import { reactive, ref } from 'vue'
import { usePageData } from '@netrojs/vono/client'

interface SettingsData {
  settings: {
    siteName:        string
    siteUrl:         string
    analyticsId:     string
    emailNotifs:     boolean
    maintenanceMode: boolean
  }
}

const data = usePageData<SettingsData>()

// Editable local copy — reactive so template updates instantly
const form    = reactive({ ...data.settings })
const saved   = ref(false)
const saving  = ref(false)

async function save() {
  saving.value = true
  // Simulate an API call
  await new Promise(r => setTimeout(r, 600))
  saving.value = false
  saved.value  = true
  setTimeout(() => { saved.value = false }, 2500)
}
</script>

<template>
  <div class="dash-section settings-form">
    <div class="form-group">
      <label class="form-label" for="siteName">Site name</label>
      <input id="siteName" v-model="form.siteName" class="form-input" type="text">
    </div>

    <div class="form-group">
      <label class="form-label" for="siteUrl">Site URL</label>
      <input id="siteUrl" v-model="form.siteUrl" class="form-input" type="url">
    </div>

    <div class="form-group">
      <label class="form-label" for="analyticsId">Analytics ID</label>
      <input id="analyticsId" v-model="form.analyticsId" class="form-input" type="text" placeholder="G-XXXXXXXXXX">
    </div>

    <div class="form-group form-toggle">
      <label class="form-label">
        <input v-model="form.emailNotifs" type="checkbox">
        Email notifications
      </label>
    </div>

    <div class="form-group form-toggle">
      <label class="form-label">
        <input v-model="form.maintenanceMode" type="checkbox">
        Maintenance mode
        <span v-if="form.maintenanceMode" class="tag tag-warn">⚠️ Site is offline to visitors</span>
      </label>
    </div>

    <div class="form-footer">
      <button class="btn btn-primary" :disabled="saving" @click="save">
        {{ saving ? 'Saving…' : 'Save settings' }}
      </button>
      <Transition name="fade">
        <span v-if="saved" class="save-confirm">✅ Saved!</span>
      </Transition>
    </div>
  </div>
</template>
