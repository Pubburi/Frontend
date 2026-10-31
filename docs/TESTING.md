# 프론트 테스트와 CI

React/TypeScript 앱의 타입·상태/계약 단위 검증과 실제 Chromium의 프로덕션 빌드 흐름 검증을 별도로 실행한다.
브라우저 테스트는 `/api`에 직접 작성한 ApiResponse fixture를 제공하므로 Backend/DB를
기동하지 않는다. 이는 프론트 화면·라우터·상태·응답 처리 검증이며 실제 서버 간 통합 E2E를 대신하지 않는다.

## 실행

Node 24에서 처음 한 번 브라우저를 준비한다.

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check`는 저장소 검사 → locked 설치 → audit → 이미지 도구 → strict TypeScript → Vitest →
`/api` 기준 프로덕션 빌드 → Chromium 스모크를 순서대로 실행한다.
독립 실행은 `npm run typecheck`, `npm run test`, `VITE_API_BASE_URL=/api npm run build`, `npm run test:browser`다.
Linux CI는 `npx playwright install --with-deps chromium`으로 시스템 의존성도 설치한다.

preview는 127.0.0.1:4173에서 strict port로 실행하며 기존 서버를 재사용하지 않는다.
해당 포트를 사용 중인 사용자 프로세스를 종료하지 말고 먼저 충돌 원인을 확인한다.
Playwright는 자신이 시작한 서버만 실행 종료 시 정리한다.

## 검증 범위

- 검색 조건의 URL/API 전달, 상품 상세·실제 정적 이미지, 수량·장바구니 새로고침 보존과 비회원 주문 안내.
- 비회원의 보호 경로 리다이렉트와 목적지 보존, 일반 회원의 관리자 화면/API 접근 차단.
- 상품 API 실패 후 재시도 복구와 상품 404 직접 링크 안내.
- 응답을 보류한 검색 중 필터 해제·상세 재진입에서 최신 요청이 실행되고 늦은 이전 응답/오류가 현재 화면을 덮지 않는지 확인.
- 가입·아이디 확인·로그인/로그아웃·계정 전환, 세션 조회 장애와 401의 구분·복귀 경로.
- 후기 등록·편집·확인 뒤 삭제, 관리자 상품/매장 등록·편집·삭제와 회원 편집/삭제·자기 삭제 차단·후기 삭제·주문 완료/삭제.
- 후기 등록/수정 응답을 보류한 동안 새 입력·취소 후 같은/다른 후기 재편집을 시작해도 이전 성공이 현재 초안을 지우지 않는지 확인. 서버에는 제출 시점의 내용만 전송하고, 거절 뒤 초안·명시적 재제출과 수정하지 않은 성공 후 초기화를 구분.
- 관리자 상품 특성의 별도 GET/전체 PUT, 미확인 null·검수 완료 빈 태그·태그 입력, 출처 필수/공개 메모·정규화·전체 지우기와 기존 상품 CRUD 계약 보존. 조회·권한/필드 오류와 GET/PUT 대기 중 상품 전환·새 초안 보존을 확인.
- 특성 편집 중 offline→online 재연결에 초안을 유지하고, 기존 단일 태그 안의 개행을 설명만 수정하는 전체 PUT에서 다른 태그로 나누지 않는지 확인.
- 본인 취향 설문/수정·건너뛰기·초기화, 미선택/null·선호없음/[]·실제 0과 목표/필수 범위 분리. 최초 읽기 실패·필드 오류·세션 만료에서 초안을 기본값으로 덮어쓰지 않으며, 계정 전환의 늦은 GET/PUT 성공·401과 같은 경로 재진입·재연결을 검증.
- 같은 계정으로 로그아웃/재로그인하는 동안 기존 취향 PUT이 남아 있어도 요청 소유를 잃지 않고, 완료 뒤 새 GET으로 최신 서버값을 편집하는지 확인. 다른 계정의 독립성·기존 auth 캐시 초기화를 유지.
- 본인 찜 상세·목록·페이지와 현재 상품 링크, 조회 실패/빈 상태·삭제 뒤 페이지 보정. 단건 상태 GET으로 첫 페이지 밖 상품도 확인하고 카탈로그 N+1/전체 수집을 하지 않는다. PUT/DELETE 대기 중 중복 차단·같은 계정 재로그인·다른 계정의 늦은 GET/DELETE 성공·401·이전 목록 GET을 분리하고, 저장 후 응답 실패도 권위 재조회한다.
- 데모 주문 실패 시 장바구니 보존, 성공 후 서버 주문 금액과 ORDER_SNAPSHOT/LEGACY_ESTIMATE/미확인 출처·null 금액·삭제 상품/탈퇴 회원 표시.
- 일반/좁은 웹 화면의 삭제 확인창에서 처리 중 활성 버튼이 없어도 Tab·Shift+Tab 포커스를 유지하고, 실패 뒤 취소/복귀 및 단일 삭제 요청을 확인.
- 처리하지 않은 API 요청과 브라우저 JavaScript 예외는 테스트 실패다. fixture 상품은 실상품/추천 학습 데이터가 아니다.

Vitest는 브라우저 spec을 수집하지 않는다. 기존 유틸·상태·API 단위 검증과 production browser
검증을 모두 `frontend-ci` 필수 검사 안에서 실행한다. 기존 Pinia/Vue Router 테스트를 Zustand·세션 query·관리자 API 선택과 React 브라우저 검증으로 옮겼다. 테스트 개수의 일치를 기능 동등성으로 간주하지 않고 사용자 결과·오류/권한 경계를 추적한다.

## 결과 보관

단위 JUnit은 `reports/unit.xml`, 브라우저 JUnit은 `reports/browser.xml`, HTML은
`playwright-report/`, 실패 trace·스크린샷은 `test-results/`에 생성된다.
CI는 성공/실패와 관계없이 생성된 보고서를 `frontend-test-reports` artifact로 7일 보관한다.
보고서·trace·스크린샷은 ignore 및 저장소 생성물 검사 대상이며 Git에 올리지 않는다.
테스트 통과 수·CI 시간은 서비스 성능 개선 수치가 아니다.

공식 근거: [Playwright CI](https://playwright.dev/docs/ci),
[webServer](https://playwright.dev/docs/test-webserver),
[API mocking](https://playwright.dev/docs/mock),
[Vitest JUnit output](https://v4.vitest.dev/config/outputfile).
