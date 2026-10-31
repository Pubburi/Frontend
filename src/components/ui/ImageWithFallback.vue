<template>
  <picture>
    <source v-if="webp" :srcset="webp" type="image/webp" />
    <img :src="src || fallback" :alt="alt" :loading="loading" decoding="async" @error="onError" />
  </picture>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { webpSource } from '../../utils/format'

const props = defineProps({
  src: {
    type: String,
    default: '',
  },
  alt: {
    type: String,
    default: '',
  },
  fallback: {
    type: String,
    default: '/images/icon/mainIcon.webp',
  },
  loading: {
    type: String,
    default: 'lazy',
  },
})

const failed = ref(false)
const webp = computed(() => (failed.value ? '' : webpSource(props.src)))

watch(
  () => props.src,
  () => {
    failed.value = false
  },
)

function onError(event) {
  if (!failed.value && props.src) {
    failed.value = true
    event.target.src = props.src
    return
  }
  if (event.target.src !== props.fallback) {
    event.target.src = props.fallback
  }
}
</script>
