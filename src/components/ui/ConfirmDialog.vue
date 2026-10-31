<template>
  <div v-if="open" class="dialog-backdrop" role="presentation" @click.self="$emit('cancel')">
    <section ref="dialog" class="confirm-dialog" role="alertdialog" aria-modal="true" :aria-labelledby="titleId" tabindex="-1" @keydown.esc="$emit('cancel')">
      <p class="section-kicker">Confirm</p>
      <h2 :id="titleId">{{ title }}</h2>
      <p>{{ description }}</p>
      <div class="button-row dialog-actions">
        <button type="button" class="btn btn-outline-secondary" @click="$emit('cancel')">취소</button>
        <button type="button" class="btn btn-danger" :disabled="pending" @click="$emit('confirm')">
          {{ pending ? '처리 중…' : confirmLabel }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '정말 진행할까요?' },
  description: { type: String, default: '이 작업은 되돌리기 어렵습니다.' },
  confirmLabel: { type: String, default: '삭제' },
  pending: { type: Boolean, default: false },
})

defineEmits(['confirm', 'cancel'])
const dialog = ref(null)
const titleId = `confirm-${Math.random().toString(36).slice(2)}`

watch(
  () => props.open,
  async (open) => {
    if (open) {
      await nextTick()
      dialog.value?.focus()
    }
  },
)
</script>
