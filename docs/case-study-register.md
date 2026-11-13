# README 사례 근거

| 사례 | 현재 코드 | 원 재현·검증 근거 | 남은 경계 |
|---|---|---|---|
| 계정 카트의 미확정 작업 복구 | [인증/HTTP·복구 상태](../src/state/accountCart.ts), [현재 카트 UI](../src/components/AccountCart.tsx), [기기 제출 소유](../src/state/cart.ts) | [인증·receipt 소비자 회귀](https://github.com/Pubburi/Frontend/blob/f432eb09581dbd675eb3cdc94169efb5c706e6b6/tests/browser/account-cart.spec.js), [제공자 계약·실제 TX](https://github.com/Pubburi/Backend/pull/72)와 실제 PG/JPA·production 웹 인수를 구분한다. | 중복 수량2→4·commit 뒤401은 개발 통제 재현이며 운영 사고·자연 오류율/성능 성과가 아니다. 서버 잠금/영속 종료는 제공자 검증, 화면/요청 소유는 소비자 검증이다. 현재 탭 메모리 수명이며 새로고침·크래시 후에는 카트/주문 내역 확인이 필요 |
