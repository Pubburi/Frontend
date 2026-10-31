<template>
  <div class="quantity-stepper" :aria-label="label">
    <button type="button" :disabled="modelValue <= min" aria-label="수량 줄이기" @click="update(modelValue - 1)">−</button>
    <input
      :value="modelValue"
      type="number"
      :min="min"
      :max="max"
      inputmode="numeric"
      :aria-label="label"
      @change="update($event.target.value)"
    />
    <button type="button" :disabled="modelValue >= max" aria-label="수량 늘리기" @click="update(modelValue + 1)">+</button>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 1 },
  max: { type: Number, default: 99 },
  label: { type: String, default: '상품 수량' },
})
const emit = defineEmits(['update:modelValue'])

function update(value) {
  const parsed = Math.trunc(Number(value))
  const safe = Number.isFinite(parsed) ? Math.min(props.max, Math.max(props.min, parsed)) : props.min
  emit('update:modelValue', safe)
}
</script>
