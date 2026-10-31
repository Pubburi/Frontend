<template>
  <nav v-if="page && page.totalPages > 1" class="pagination-bar" aria-label="pagination">
    <button type="button" class="btn btn-sm btn-outline-dark" :disabled="page.page <= 1" @click="$emit('change', page.page - 1)">
      이전
    </button>
    <span>{{ page.page }} / {{ page.totalPages }}</span>
    <button type="button" class="btn btn-sm btn-outline-dark" :disabled="!page.hasNext" @click="$emit('change', page.page + 1)">
      다음
    </button>
  </nav>
</template>

<script setup>
defineProps({
  page: {
    type: Object,
    required: true,
  },
})

defineEmits(['change'])
</script>
