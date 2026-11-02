# FE03 — 관리자 비공개 목록401의 명시적 로그인 복구

## 기준과 사전 재현

기준 main `c05e342b`에서 관리자 세션 query는 정상 ADMIN을 보존하지만 서버 세션만 사라질 수 있다.
관리자 주문·후기·회원 읽기가401이면 기본 화면은 일반 `다시 시도`만 제공했다. 재조회도401을
반복하고 SPA의 캐시된 계정은 남는다. 정상 로그아웃이나 전체 새로고침은 별도 우회 방법이며,
이 작업은 서버의 세션 수명을 바꾸지 않고 관리자 화면에 명시적 복구를 연결한다.

제품 코드 변경 전 Node24.22.1·Chromium·1280×900에서 기준 production100파일을 크기/SHA로
대조·동결했다. 같은 명시 API fixture·하네스와 다음 두 조건을 고정했다.

| 고정 조건 · 각1회 | 서버 인증만 없어진 뒤 동작 | 기준 결과 | 수정 결과 |
|---|---|---|---|
| users-first | 관리자 상품 화면에서 회원 탭 첫 조회401 | 일반 재시도가401을 반복, 복구 조작 없음 | 명시적 로그인 후 원래 회원 탭과 현재 목록으로 복귀 |
| orders-refresh | 이미 읽은 주문 페이지의 새로고침401 | 같은 복구 부재 | 비공개 내용 차폐 후 로그인·현재 주문 페이지로 복귀 |

불변 하네스 SHA `34b7f1d1b69a…`의 복구 위반은 **2/2→0/2**였다. 두 고정 조건의 비율은
100%→0%(100%p 차이)이며 양쪽 인프라·예상외 API·pageerror 검사는 성공했다. 이는 직접 작성한
API fixture에서 확인한 기능 정확성이고 자연 세션 만료 빈도·실사용자 오류율·시간 성능이 아니다.
이전 마이페이지 수정의 두 조건과 합산하거나 같은 문제의 새로운 과거 장애로 표시하지 않는다.

## 원인·대안과 구현

인증 캐시가 ADMIN인 것과 현재 관리자 API가 인증을 인정하는 것은 서로 다른 관측이다.
모든401에 전역 로그아웃을 붙이면 이전 요청의 늦은 실패가 새 인증을 지울 수 있다. 모든 오류를
로그인 문제로 취급하면403·5xx의 정상 재시도를 잃는다. 화면 새로고침을 강제하기보다 현재
인증과 실제 비공개 query에 속한401만 보존하고 사용자의 명시적 조작으로 복구한다.

- 기존 profilePrivacy의 관측 엔진을 내부 [authReadPrivacy](../../src/state/authReadPrivacy.ts)로
  추출했다. 본인 profile/orders의 기존 predicate와 실패 객체·인증/query 수명은 유지하며,
  [adminPrivacy](../../src/state/adminPrivacy.ts)는 현재 ADMIN의 orders/comments/users 목록만
  별도 store로 관측한다. 공개 상품·매장 query는 인증 상실 근거로 쓰지 않는다.
- 실패 관측은 실제 session query·계정 객체·실패 query에 묶는다. 로그인/로그아웃의 cache.clear,
  query 제거/새 객체 재생성은 옛 관측을 폐기한다. 같은ID의 새 로그인도 이전401을 상속하지 않는다.
- cold refetch는 query.error를 지울 수 있으므로 error 필드만 보지 않는다. pending/paused와 뒤503,
  수동 캐시 쓰기는 인증 확인이 아니다. 해당 query의 새 HTTP fetch 성공만 그 관측을 해제한다.
- 현재 인증의 관리자401이 남으면 관리 패널의 목록·카운트·편집/등록폼을 함께 감춘다. 다른 관리
  탭으로 이동하거나 route를 다시 열어도 같은 관측이 살아 있다. 헤더의 캐시된 계정까지 자동으로
  삭제하거나 서버 로그아웃을 보내지는 않는다.
- `다시 로그인` 클릭 직전에 현재 auth/계정/query의 동일성과 진행 상태를 다시 확인한다. 관련
  인증/실패 읽기 재검증 중에는 전환하지 않는다. 유효한 현재 관측의 명시적 조작에서만 기존 로그인
  전환과 같은 query 정리를 하고 session을 null로 둔 뒤 현재 pathname/query를 redirect로 보존한다.
- 기기 장바구니·미제출 주문 요청은 보존하고 업무 쓰기를 자동 재전송하지 않는다. 관리자 비공개
  초안을 새 인증에 이월하지 않는다. 다른 계정이 ADMIN이 아니면 기존 guard가 접근을 차단한다.

### 검토 후보에서 찾은 paused 준비 상태 알림

기본 복구가 동작한 후보의 별도 production 회귀에서 cold401→offline→다른 관리 탭→회원 탭의
paused 재진입은 복구 버튼을 enabled로 남겼다. 관측 store가 실패 추가/제거만 알리고 보존 중인
query의 fetchStatus 변화를 발행하지 않아, isFetching이 idle/paused에서 모두 false인 경우
준비 상태 재렌더가 누락됐다. 클릭 handler의 현재 상태 재검사와 버튼의 안내 상태는 구분한다.

관측 query의 fetchStatus가 바뀔 때도 같은 실패/소유 객체들을 담은 새 snapshot을 발행하도록
보강했다. 단위 구독과 같은 production 조건에서 paused/fetching은 차단하고 실제 성공 뒤에만
복원했다. 이 후보1조건의 위반1/1→0/1은 최초 main의 고정2조건과 합산하지 않는다. 관측 객체를
복제해 소유 판정을 바꾸거나 무조건 timeout/재시도를 늘리지 않았다.

## 검증과 남은 범위

고정 두 조건과 별도로403/500/503 일반 복구, 같은ID/다른 ADMIN의 늦은 이전401, cold 재검증의
성공/503과 다른 탭 차폐, offline paused 재진입, 후기 단독401, 새 인증에서 장바구니·미제출
주문 보존/관리 초안 미이월,390px 웹의 Enter와 추가 query 복귀를 production Chromium으로 확인한다.
기존 profile 관측 회귀는 공통 엔진 추출 뒤에도 유지한다. API fixture는 실제 Backend/DB E2E가 아니다.

관련 단위14개(기존 profile9·새 admin5)와 새 production browser13개가 통과했다. Node24.22.1의
전체 `npm run check`도 저장소 검사·locked npm ci·audit0·이미지 도구·strict TypeScript·단위73개·
production build·Chromium176개를 통과했다. 원래 두 조건의 최종 동결 production100파일과 동일
하네스도 재확인했다. manifest 파일 SHA는 `ef4b9f67ce1c…`, compact 파일 목록 SHA는
`b62757f53390…`다. 아래 실제 서버 두 조건도 통과했으며 최신 head 리뷰/CI·병합 mainCI는
별도 게이트다.
원문 fixture/서버 로그·불변 웹과 계정/개인 경로는 ignored 자료로 보관한다. 검증 완료 범위와
실패를 아래 실행 결과에 기록하며 전체 FE03/C04·PostgreSQL DB06 인수로 올리지 않는다.

## 실제 서버 비교 계약

조정자는 같은 기존 API JAR·seed·자체 관리자/비밀번호·하네스와 before/after production 웹을
별도 폐기 DB/동적 loopback에 연결한다. 두 조건은 각자 새 browser context에서 시작한다.
실제 로그인200과 auth/me ADMIN을 확인하고 React 로그아웃 버튼을 누르지 않은 채 같은 cookie의
POST `/api/auth/logout`200으로 서버 세션만 무효화한다. auth/me401과 남은 SPA 헤더를 함께 확인한다.

users-first는 상품 관리에서 회원 탭으로, orders-refresh는 초기 주문200 뒤 새로고침으로 실제401을
읽는다. 기준의 일반 재시도401/복구 부재와 수정의 명시적 account redirect·다시 입력한 실제
자격의 login200·원래 private GET200/현재 ADMIN을 구분한다. 업무 성공 응답 합성은 없다.
실제 결과의 두 조건은 fixture2·검토 후보1·추가 회귀의 분모와 합산하지 않는다.

## 실제 서버 전후 결과

조정자가 같은 기존 Backend JAR(`dcb73c35b4db…`)·고정 Recommendation main `d7561dff`·
seed80·Java17/MySQL8.4/Node24/Chromium을 사용했다. 별도 폐기 before/after DB에 같은 자체
관리자ID/비밀번호를 한 runner에서 적용했고, 불변 전후 웹100파일과 같은 실제 하네스
(`49dd41652054…`)를 실행 전에 확인했다. 기준 manifest 파일 SHA는 `b5d74e22e6cd…`, 수정은
`ef4b9f67ce1c…`다. 각 모드의 두 조건은 서로 다른 새 browser context로 실행했다.

| 실제 고정 조건 · 각1회 | 양쪽 실제 서버 확인 | 기준 복구 | 수정 복구 |
|---|---|---|---|
| users-first | 로그인200/ADMIN·서버logout200/authme401·SPA 캐시/대상 회원GET401 | 일반 retry가401 반복·명시 조작 없음 | 원래 users URL로 복귀·재로그인200·회원Page200/ADMIN |
| orders-refresh | 초기 주문Page200 캐시·서버logout200/authme401·SPA 캐시/주문GET401 | 같은 복구 부재 | 원래 orders URL로 복귀·재로그인200·주문Page200/ADMIN |

실제 복구 진입 위반도 **2/2→0/2**, 이 고정 집합의 비율은100%→0%(100%p 차이)였다. 양쪽
인프라·예상외 API·pageerror 검사는 성공했고 업무 성공 응답 합성은0이었다. after는 별도 실제
auth/me의 현재 ADMIN/ID와 private Page 배열도 확인했다. 웹 프록시→Backend→고정 추천 서버의
기본 목록 BASELINE도 유지했다. 기본 추천의 새 품질 성과는 아니다.

이 결과는 실제 cookie를 가진 소유 관리자에서 서버만 logout한 통제 조건이다. 자연 세션 만료
발생률·실사용자 오류율·시간 성능이나 다른 계정/키보드/403·5xx의 모든 실제 인수를 뜻하지
않는다. 그런 추가 경계는 위 production API fixture로 분리한다. 현재 MySQL은 PG 이관 전
기준이며, PostgreSQL 제공자의 전체 관리자/업무 API가 준비되면 다시 확인해야 한다.

## README 판단

현재 네 사례의 본문/순서를 보존한다. 관리자 인증 캐시와 비공개 조회의 불일치를 수정한 실제
복구이지만 현재 네 번째 인증/진행 중 HTTP 수명 사례와 인접한 보완이다. 나머지 수량/초안/경로,
최신 요청, 파괴적 확인창/포커스보다 더 강한 독립 영향·대안 판단을 확보한 근거는 부족하다.
다섯 번째 사례나 회귀 횟수/절차·CI 집계를 README에 넣지 않는다.
같은 기존 서버/불변 웹의 실제 두 조건을 추가 확인했지만 이 선정 판단은 유지한다.
