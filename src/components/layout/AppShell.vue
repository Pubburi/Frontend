<template>
  <div class="app-shell">
    <header class="topbar">
      <RouterLink class="brand" to="/" @click="closeMenu">
        <ImageWithFallback src="/images/icon/mainIcon.webp" alt="" loading="eager" />
        <span>주점부리</span>
      </RouterLink>

      <button
        type="button"
        class="menu-toggle"
        :aria-expanded="menuOpen"
        aria-controls="main-navigation"
        aria-label="메뉴 열기"
        @click="menuOpen = !menuOpen"
      >
        <span></span><span></span><span></span>
      </button>

      <div id="main-navigation" class="navigation-panel" :class="{ open: menuOpen }">
        <nav class="nav-actions" aria-label="주요 메뉴">
          <RouterLink to="/" @click="closeMenu">홈</RouterLink>
          <RouterLink to="/products" @click="closeMenu">전체 주류</RouterLink>
          <RouterLink to="/cart" @click="closeMenu">
            장바구니 <span v-if="cart.count" class="cart-count">{{ cart.count }}</span>
          </RouterLink>
          <RouterLink :to="auth.user ? '/profile' : '/account'" @click="closeMenu">마이</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" @click="closeMenu">관리</RouterLink>
        </nav>

        <div class="user-pill">
          <span v-if="auth.user" class="user-name">{{ auth.user.name }}님</span>
          <button v-if="auth.user" type="button" class="btn btn-sm btn-outline-dark" :disabled="ui.isPending('logout')" @click="logout">
            로그아웃
          </button>
          <RouterLink v-else class="btn btn-sm btn-dark" to="/account" @click="closeMenu">로그인</RouterLink>
        </div>
      </div>
    </header>

    <main>
      <AlertMessage />
      <RouterView />
    </main>

    <footer class="site-footer">
      <div>
        <strong>주점부리</strong>
        <p>탁주부터 위스키까지, 취향에 맞는 한 잔을 발견하는 주류 큐레이션 숍</p>
      </div>
      <p>지나친 음주는 건강에 해롭습니다. 청소년에게 주류를 판매하지 않습니다.</p>
    </footer>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AlertMessage from '../ui/AlertMessage.vue'
import ImageWithFallback from '../ui/ImageWithFallback.vue'
import { useAuthStore } from '../../stores/auth'
import { useCartStore } from '../../stores/cart'
import { useUiStore } from '../../stores/ui'

const auth = useAuthStore()
const cart = useCartStore()
const ui = useUiStore()
const route = useRoute()
const router = useRouter()
const menuOpen = ref(false)

watch(() => route.fullPath, closeMenu)

function closeMenu() {
  menuOpen.value = false
}

async function logout() {
  const result = await ui.run('logout', () => auth.logout(), { success: '로그아웃되었습니다.' })
  if (result.ok) await router.push('/')
}
</script>
