<template>
  <div class="skeleton-grid" :aria-label="label" role="status">
    <div v-for="index in count" :key="index" class="skeleton-card" aria-hidden="true">
      <span class="skeleton-block skeleton-image"></span>
      <span class="skeleton-block skeleton-line short"></span>
      <span class="skeleton-block skeleton-line"></span>
      <span class="skeleton-block skeleton-line medium"></span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  count: { type: Number, default: 4 },
  label: { type: String, default: '콘텐츠를 불러오는 중입니다.' },
})
</script>
