<template>
  <div v-if="ui.notice" class="notice" :class="ui.notice.type" :role="ui.notice.type === 'error' ? 'alert' : 'status'" aria-live="polite">
    <span>{{ ui.notice.message }}</span>
    <button type="button" aria-label="알림 닫기" @click="ui.clear">×</button>
  </div>
</template>

<script setup>
import { useUiStore } from '../../stores/ui'

const ui = useUiStore()
</script>
