# 프론트 테스트와 CI

프론트 단위 검증과 실제 Chromium의 프로덕션 빌드 스모크를 별도로 실행한다.
브라우저 테스트는 `/api`에 직접 작성한 ApiResponse fixture를 제공하므로 Backend/DB를
기동하지 않는다. 이는 프론트 화면·라우터·상태·응답 처리 검증이며 실제 서버 간 통합 E2E를 대신하지 않는다.

## 실행

Node 24에서 처음 한 번 브라우저를 준비한다.

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check`는 저장소 검사 → locked 설치 → audit → 이미지 도구 → Vitest →
`/api` 기준 프로덕션 빌드 → Chromium 스모크를 순서대로 실행한다.
독립 실행은 `npm run test`, `VITE_API_BASE_URL=/api npm run build`, `npm run test:browser`다.
Linux CI는 `npx playwright install --with-deps chromium`으로 시스템 의존성도 설치한다.

preview는 127.0.0.1:4173에서 strict port로 실행하며 기존 서버를 재사용하지 않는다.
해당 포트를 사용 중인 사용자 프로세스를 종료하지 말고 먼저 충돌 원인을 확인한다.
Playwright는 자신이 시작한 서버만 실행 종료 시 정리한다.

## 검증 범위

- 검색 조건의 URL/API 전달, 상품 상세·실제 정적 이미지, 수량·장바구니 새로고침 보존과 비회원 주문 안내.
- 비회원의 보호 경로 리다이렉트와 목적지 보존, 일반 회원의 관리자 화면/API 접근 차단.
- 상품 API 실패 후 재시도 복구와 상품 404 직접 링크 안내.
- 처리하지 않은 API 요청과 브라우저 JavaScript 예외는 테스트 실패다. fixture 상품은 실상품/추천 학습 데이터가 아니다.

Vitest는 브라우저 spec을 수집하지 않는다. 기존 유틸·상태·API 단위 검증과 production browser
검증을 모두 `frontend-ci` 필수 검사 안에서 실행한다. React 전환 시 동일 사용자 결과를 유지하도록 옮긴다.

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
