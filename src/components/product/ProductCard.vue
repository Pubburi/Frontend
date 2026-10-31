<template>
  <article class="product-card">
    <RouterLink class="product-image" :to="`/products/${product.id}`">
      <ImageWithFallback :src="productImage(product)" :alt="product.name" />
    </RouterLink>
    <div class="product-body">
      <p class="product-type">{{ product.type }}</p>
      <h2><RouterLink :to="`/products/${product.id}`">{{ product.name }}</RouterLink></h2>
      <p class="product-meta">
        <strong>{{ money(product.price) }}원</strong>
        <span>도수 {{ product.abv }}%</span>
      </p>
      <p class="product-orders">{{ Number(product.orderCount || 0).toLocaleString('ko-KR') }}명이 선택했어요</p>
      <div class="button-row">
        <RouterLink class="btn btn-outline-dark btn-sm" :to="`/products/${product.id}`">상세 보기</RouterLink>
        <button type="button" class="btn btn-gold btn-sm" @click="$emit('add', product)">빠른 담기</button>
      </div>
    </div>
  </article>
</template>

<script setup>
import ImageWithFallback from '../ui/ImageWithFallback.vue'
import { money, productImage } from '../../utils/format'

defineProps({
  product: {
    type: Object,
    required: true,
  },
})

defineEmits(['add'])
</script>
