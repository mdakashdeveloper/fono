<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router   = useRouter()
const email    = ref('')
const password = ref('')
const error    = ref<string | null>(null)
const loading  = ref(false)

async function login() {
  if (!email.value || !password.value) {
    error.value = 'Please enter your email and password.'
    return
  }
  loading.value = true
  error.value   = null

  // Stub: set a cookie and redirect.  Replace with a real auth call.
  await new Promise(r => setTimeout(r, 500))
  document.cookie = 'session=demo; path=/'
  await router.push('/dashboard')
}
</script>

<template>
  <div class="login-shell">
    <div class="login-card">
      <div class="login-logo">◈ Vono</div>
      <h1 class="login-title">Sign in</h1>
      <p class="login-sub">Dashboard is protected by server middleware.</p>

      <div v-if="error" class="alert-error">{{ error }}</div>

      <div class="form-group">
        <label class="form-label" for="email">Email</label>
        <input
          id="email"
          v-model="email"
          class="form-input"
          type="email"
          placeholder="you@example.com"
          autocomplete="email"
          @keyup.enter="login"
        >
      </div>

      <div class="form-group">
        <label class="form-label" for="password">Password</label>
        <input
          id="password"
          v-model="password"
          class="form-input"
          type="password"
          placeholder="••••••••"
          autocomplete="current-password"
          @keyup.enter="login"
        >
      </div>

      <button class="btn btn-primary" style="width:100%;margin-top:.5rem" :disabled="loading" @click="login">
        {{ loading ? 'Signing in…' : 'Sign in' }}
      </button>

      <p class="login-hint">
        Demo: any email + password sets a <code>session=demo</code> cookie
        and grants dashboard access (the auth guard stub accepts it).
      </p>
    </div>
  </div>
</template>
