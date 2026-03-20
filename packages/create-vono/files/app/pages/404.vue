<script setup lang="ts">
// This component is used as createVono({ notFound: NotFoundPage })
// It is rendered server-side for unmatched URLs (returns 404 status).
// No usePageData() here — it's not a route page, it's a fallback component.
</script>

<template>
  <div class="not-found">
    <div class="not-found-code">404</div>
    <h1>Page not found</h1>
    <p>The page you're looking for doesn't exist or has been moved.</p>
    <a href="/" class="btn btn-primary">Go home</a>
  </div>
</template>
