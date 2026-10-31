<template>
  <div class="state-panel" role="status">
    <span class="state-icon" aria-hidden="true">{{ icon }}</span>
    <h2>{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: '◌' },
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>
