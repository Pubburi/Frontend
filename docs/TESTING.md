# 프론트 검사

Node 24에서 실행한다. API fixture로 검증하는 production Chromium 흐름은 실제 Backend/DB 통합 인수와 별도다.

```bash
npm ci
npx playwright install chromium
npm run check
```

`check`는 저장소 검사 → locked 설치/audit → 이미지 도구 → strict TypeScript → Vitest → `/api` production 빌드 → guard 계약 → Chromium을 순서대로 실행한다. CI의 required `frontend-ci`도 같은 검증을 수행하며 Linux에서는 Chromium을 `--with-deps`로 설치한다. 실패 보고서·trace는 CI artifact로 보관한다.

## 선택 실행과 자원 격리

```bash
npm run typecheck
npm run test
VITE_API_BASE_URL=/api npm run build
npm run test:browser:guard
npm run test:browser -- tests/browser/admin-edit-focus.spec.js
```

- `test:browser` runner가 자신의 preview/Playwright 자식을 시작하고 종료한다. 기본은127.0.0.1 동적 포트다. `PLAYWRIGHT_PORT`는 비어 있는 전용 포트만 허용하며5173/9987/8000·기존 서버 재사용을 거부한다. 사용자 프로세스를 종료하지 않는다.
- preview는 개발 config/proxy를 상속하지 않고 owner marker를 확인한다. fixture 밖 `/api`는503으로 거절하며 method/path만 기록한다. query·header/body·자격은 기록하지 않는다. 브라우저가 통과해도 누락이 있으면 runner는 실패한다.
- `test:browser:guard`는 실제 browser pass에도 누락 API가 runner exit1을 만드는지, IPC 해제 때 소유 preview가 종료되는지 확인한다. negative와 정상 실행의 수를 합산하지 않는다.
- 직접 `npx playwright test` 대신 npm 진입점을 사용한다. 같은 checkout의 설치·빌드·보고서 출력은 직렬로 실행한다. 실제 서버/DB는 조정자와 자원을 예약한다.

## 보존하는 회귀

| 영역 | 핵심 계약 | 브라우저 소스 |
|---|---|---|
| 탐색·검색 | 적용 조건 표시/개별 해제·수정 초안 보존·키보드 연결, URL·페이지·Back·동일 URL 재적용·현재 요청, 범위0·리터럴 태그·Java 권위/400·무제약 fallback 금지 | [적용 조건](../tests/browser/applied-product-filters.spec.js), [검색 문구](../tests/browser/search-phrases.spec.js), [범위](../tests/browser/product-ranges.spec.js), [태그](../tests/browser/product-tags.spec.js), [페이지 포커스](../tests/browser/catalog-pagination-focus.spec.js) |
| 상세·찜·장바구니 | 현재 Product7/특성·null/[]/0, 별도 오류·출처, 수량/보관 거부·제출 이후 새 입력·찜 계정/페이지·키보드 | [기본 흐름](../tests/browser/smoke.spec.js) |
| 계정 카트 | 기기 원본·명시 병합·99/100 상한·CAS 충돌·현재 가격/삭제 상품, 미저장 수량 주문 차단·다음 요청 보존, UUID 재생·재로그인 receipt 읽기·계정/HTTP 수명, 명시 DEMO 유사 추천의 현재 version·실제 기준/근거·부족/실패·늦은 응답 차폐 | [계정 카트](../tests/browser/account-cart.spec.js) |
| 내부 알림 | 헤더 최초 수량·본인 페이지, 자동 읽음 없음·개별/현재페이지 읽음·부분 실패와 멱등 복구, 삭제 대상·계정/HTTP 세대·읽기/쓰기401의 전체 차폐 | [알림](../tests/browser/notifications.spec.js) |
| 회원 후기 | 전체 평점·0/소수·정렬/페이지, 선택 맛 태그·원문·수정 보존/비움, 키보드 편집 진입/복귀·검증/오류와 현재 focus, 같은 인증의200/503 재확인에는 차폐 후 초안 복원·인증세대 전환에는 폐기 | [후기 집계·정렬·태그](../tests/browser/review-summary.spec.js) |
| 비공개 기록 | 상세 바로 작성·본인 목록/수정/삭제, 경험/관심·평점0/null·태그null/[]·개인 원문·상품 삭제 보존, revision409/불확실 결과 복구·계정/HTTP 수명, 읽기/쓰기401의 목록 전체 차폐·같은 인증 조회의DOM차폐/초안 보존·인증세대 전환 폐기 | [본인 기록](../tests/browser/notebook.spec.js) |
| 계정·최근 상품 | 같은/다른 계정·ABA, 현재 query/location·cold401/paused·불확실 쓰기 차폐, 비밀 입력/72바이트·저장 거부·메모리 정책 | [계정 설정](../tests/browser/account-settings.spec.js), [최근 상품](../tests/browser/recent-products.spec.js) |
| 상품 비교 | 반복 URL 최대4개·직접/잘못된 주소·현재 정보/개별 오류·빠른 Back·전체 해제·카트/기록 보존 | [비교](../tests/browser/product-comparison.spec.js) |
| 매장·데모 주문 | strict Java int·현재 권위/소유·401/403/404·snapshot/삭제 이력·실제0/미확인·사진 미제공 | [매장](../tests/browser/market-detail.spec.js), [주문](../tests/browser/order-detail.spec.js) |
| 관리자 | 탭/페이지·삭제/저장 이후 초안 수명·권한/오류·소수 입력·회원 편집 취소/저장 후 현재 행 복귀·확인창 focus·허용100자 전체 이름과 조작 수용 | [편집 진입](../tests/browser/admin-edit-focus.spec.js), [회원 편집 복귀](../tests/browser/admin-member-return.spec.js), [CRUD·경합](../tests/browser/smoke.spec.js) |

## 핵심 데이터·권한 계약

- 세션은 401만 비로그인으로 해석한다. pending/503·불확실 인증 쓰기는 권위 재확인 전 개인 조회·기록을 허용하지 않는다. 계정/query/경로와 HTTP 쓰기 수명은 캐시 초기화와 별도로 보존한다.
- 검색은 현재 URL의 적용 조건과 미제출 초안을 구분한다. 개별 해제는 선택한 URL 조건만 제거하고 첫 페이지로 이동하며 다른 입력과 수정한 해당 입력은 보존한다. 전체 해제·명시 검색·Back은 각 동작의 URL 복원 규칙을 따른다. 가격·도수0, 반복 taste/aroma AND와 리터럴 쉼표/개행을 보존한다. 태그는 Java strip·ASCII 변환만 클라이언트가 수행하고 비ASCII 정규화/400은 제공자가 판단한다. 조건 실패에 무제약 검색으로 바꾸지 않는다.
- F05는 비회원 ID/열람시각만 최대20개·30일 기기에 보관한다. 로그인 기록은 현재 인증 세대 메모리만 사용하고 새로고침/로그아웃/계정 전환에 초기화한다. 저장 거부 시 메모리로 동작하며 계정 ID·상품 snapshot을 디스크에 저장하지 않는다.
- F06 비교는 `/compare`의 ordered 반복 productId 최대4개가 정본이다. 현재 Product7/특성을 다시 조회하고 잘못된/중복/과다 주소는 조회하지 않는다.
- 가입·F09의 새 암호는4–100 UTF-16·최대72 UTF-8바이트로 제한하고 초과 입력을 전송 전에 알린다. 로그인·F09의 현재 암호에는 새 암호의72바이트 제한을 적용하지 않는다. 암호를 trim/변환하지 않는다. F09 성공 시 현재 세션 유지/다른 세션 회수,403 재입력과 불확실 결과의 권위 재확인을 구분한다.
- F07은 [Backend의 기록 계약](https://github.com/Pubburi/Backend/blob/main/docs/NOTEBOOK.md)을 소비한다. 관심 기록에는 경험 평점·맛·향을 전송하지 않고 개인 원문을 공개 후기·추천에 복사하거나 브라우저 저장소에 보관하지 않는다. 상품이 삭제되어도 UUID 기록을 수정/삭제하며 stale revision·불확실 쓰기는 명시 최신 읽기 후 재편집한다.
- F10은 [Backend의 카트 계약](https://github.com/Pubburi/Backend/blob/main/docs/CART.md)을 소비한다. 계정 값은 메모리에만 두며 기존 `pubburi-cart`는 기기 원본이다. 병합 성공 확인 뒤 제출 행·수량만 정리한다. CAS 충돌은 최신 읽기 뒤 명시 제출한다. 불확실한 병합·주문은 같은 로그인 세대에서만 동일 UUID/입력으로 확인한다. commit 뒤401도 가능하므로 인증 차폐와 별개로 nonce를 보존하고, 같은 Query/ID의 재확인이나 재로그인 뒤에는 원POST 대신 GET/명시 안전 종료로만 복구한다. 읽기 전용 receipt404는 지연 적용의 부재를 보장하지 않으므로 원본·미확정 작업을 유지하고 새 UUID를 막는다. 명시 안전 종료는 기존 접수를 확인하거나 이전 nonce를 영속 종료한 뒤에만 새 선택을 허용한다. 종료 응답이 유실돼도 같은 nonce/원입력만 확인하며 자동 재주문·이동하지 않는다. 이 복구 정보는 현재 탭 메모리 수명이라 모든 새로고침·크래시의 정확히 한 번 처리를 보장하지 않는다. 새로고침 후에는 계정 카트·주문 내역을 먼저 확인한다. 서버 카트 미지원 marker404만 기기 카트로 복귀하며 일반404/401/장애를 빈 계정 카트로 해석하지 않는다.
- F12는 [Backend의 내부 알림 계약](https://github.com/Pubburi/Backend/blob/main/docs/NOTIFICATIONS.md)을 소비한다. 헤더에서 현재 본인의 미확인 수를 읽으며 외부 push·폴링·자동 읽음은 없다. 묶음 읽음은 보이는 페이지의 미확인 UUID만 제출한다. 실패를 부분 성공·빈 목록으로 바꾸지 않고, 저장 후401/응답 유실에도 인증 재확인·같은 ID의 멱등 읽음으로 복구한다. 회원 삭제/재가입은 이전 캐시를 상속하지 않고 대상 삭제 뒤에는 보존된 사건과 이동 불가를 구분한다.
- R07의 현재 카트 비교는 [제공자 계약](https://github.com/Pubburi/Backend/blob/main/docs/CART.md#현재-카트의-검수-맥락-추천)을 따른다. 현재 저장 version·계정/화면·명시 요청에 결과를 묶고 카트 변경 뒤 이전 성공/오류를 복원하지 않는다. 기준/수량을 자르거나 선호·공동구매로 해석하지 않고 실제 winning 기준과 typed 사실만 표시한다. 추천401은 기존 카트 권위 경계를 사용하면서 진행 중 HTTP·nonce를 보존한다. 정상 빈 결과·UNAVAILABLE·HTTP 오류와 별도로 이동한 기본 추천을 구분한다. 본인 주문과 일반 서비스 카탈로그의 전체 R07 인수는 별도다.
- 주문 금액은 서버 snapshot/추정/미확인을 구분하며 현재 상품 가격으로 과거 주문을 재계산하지 않는다. 삭제된 상품/회원의 이력과 실제0·null·검수[]를 보존한다. 매장 위치/주문 상태는 DEMO이며 사진·주소·재고·예약·결제를 만들어내지 않는다.

순수 계약·상태 검사는 `src/**/*.test.*`에 둔다. 응답 순서/오프라인/task gate는 결정적 회귀 조건이며 자연 오류율·시간 성능으로 표시하지 않는다. 현재 기능/인수 범위는 [계획](ROADMAP.md), 변경별 실행 결과와 과거 실제 서버 근거는 해당 Git/PR에서 확인한다. 문서에 테스트 총수·run별 완료 로그를 누적하지 않는다.
