# README 사례 근거

현재 네 사례의 원문·코드는 README에 둔다. 변경 이력/교체 판단과 상세 검증은 Git/PR에서 확인하며 매 실행마다 후보 비교를 추가하지 않는다.

| 사례 | 현재 코드 | 원 재현·검증 근거 | 남은 경계 |
|---|---|---|---|
| 계정 카트의 미확정 작업 복구 | [인증/HTTP·복구 상태](../src/state/accountCart.ts), [현재 카트 UI](../src/components/AccountCart.tsx), [기기 제출 소유](../src/state/cart.ts) | [인증·receipt 소비자 회귀](https://github.com/Pubburi/Frontend/blob/f432eb09581dbd675eb3cdc94169efb5c706e6b6/tests/browser/account-cart.spec.js), [제공자 계약·실제 TX](https://github.com/Pubburi/Backend/pull/72)와 실제 PG/JPA·production 웹 인수를 구분한다. 기존 [제출량·행·폼·경로 소유](https://github.com/Pubburi/Frontend/blob/3cfefbae0a3002515c0ae63d29a8797c582e24d0/docs/plans/2026-11-01-checkout-submission-ownership.md)는 유효한 기반·후보로 보존한다. 기존 1번의 브라우저 내 완료/다음 입력보다 로그인 세대와 끝나지 않은 서버 작업의 경합을 함께 재현했고, 원인·대안과 사용자 영향·실제 계정/다른 기기 복구를 더 직접적으로 설명해 1번을 교체했다. | 중복 수량2→4·commit 뒤401은 개발 통제 재현이며 운영 사고·자연 오류율/성능 성과가 아니다. 서버 잠금/영속 종료는 제공자 검증, 화면/요청 소유는 소비자 검증이다. 현재 탭 메모리 수명이며 새로고침·크래시 후에는 카트/주문 내역 확인이 필요 |
| 경로별 최신 응답 격리 | [catalog](../src/pages/CatalogPages.tsx) | [원 결함 재현](https://github.com/Pubburi/Frontend/blob/3cfefbae0a3002515c0ae63d29a8797c582e24d0/docs/plans/2026-10-31-latest-product-requests.md), [React 이전](https://github.com/Pubburi/Frontend/pull/9) | 현재 URL/query 소유의 정확성이며 전송 취소·시간 성능 개선이 아님 |
| 삭제 중 확인창 포커스 | [공통 UI](../src/components/ui.tsx) | [보류/활성 버튼0/실패 복구](https://github.com/Pubburi/Frontend/blob/3cfefbae0a3002515c0ae63d29a8797c582e24d0/docs/plans/2026-11-01-pending-dialog-focus.md) | 중첩 dialog·전체 보조기술 조합은 별도 |
| 인증 소유와 조회 상태 구분 | [개인 기록](../src/components/Notebook.tsx), [후기](../src/pages/CatalogPages.tsx) | [개인 DOM의 401 원문](https://github.com/Pubburi/Frontend/pull/73#discussion_r4503745794)·[후기 초안 원문](https://github.com/Pubburi/Frontend/pull/73#discussion_r4503745799)과 같은 조건의 실제 PG/브라우저 재인수. 기존 [캐시/HTTP 쓰기 사례](https://github.com/Pubburi/Frontend/blob/3cfefbae0a3002515c0ae63d29a8797c582e24d0/docs/plans/2026-11-01-explicit-preferences-ui.md)는 유효한 후보로 보존한다. 개인 노출과 기존 기능 입력 소실을 함께 재현해 사용자 영향·소유/준비 분리의 원인과 대안을 더 직접적으로 설명할 수 있어 4번을 교체했다. | 개발 인수의 재현이며 운영 사고·오류율/성능 성과가 아니다. 같은 웹 실행의 DOM/초안 경계이며 서버 권한·revision 검증도 필요 |

실제 결과·개인 기여·성능을 만들지 않는다. 더 강한 독립 사례가 있을 때만 기존 내용을 교체하며, 테스트 수/CI 집계를 README에 넣지 않는다. 이전 선정 설명은 Git에 보존한다.
