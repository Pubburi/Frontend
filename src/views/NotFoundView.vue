<template>
  <section class="state-panel state-panel-large" aria-labelledby="not-found-title">
    <span class="state-code">404</span>
    <h1 id="not-found-title">페이지를 찾을 수 없습니다</h1>
    <p>주소가 바뀌었거나 존재하지 않는 페이지입니다.</p>
    <div class="button-row centered">
      <RouterLink class="btn btn-dark" to="/">홈으로</RouterLink>
      <RouterLink class="btn btn-outline-dark" to="/products">전체 주류 보기</RouterLink>
    </div>
  </section>
</template>
