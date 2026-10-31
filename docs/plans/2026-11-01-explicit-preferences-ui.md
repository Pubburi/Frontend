# R01 본인 명시취향 입력 UI·API 연결

## 범위와 완료의 구분

- 기준 main: `50775b0616b1e0cc0673ae533700022423d7533b` (`#12`). 기존 Profile에서 `/preferences`로 연결하는 로그인 회원용 입력 화면을 추가한다. 관리자도 본인 취향만 저장한다.
- 제공자 정본은 Backend [EXPLICIT-PREFERENCES](https://github.com/Pubburi/Backend/blob/main/docs/EXPLICIT-PREFERENCES.md)와 [OpenAPI](https://github.com/Pubburi/Backend/blob/main/docs/openapi/explicit-preferences.json)의 GET/PUT `/api/users/me/preferences`다. 소유 선택자를 보내지 않고 기존 쿠키 세션·ApiResponse를 유지한다.
- 이번 증분은 설문/수정·건너뛰기/초기화 UI와 저장 API 소비다. 기본/개인 추천 연결, 전체 R01·FE04·C04 완료와 다르다. 추천 결과·모델 성과·미구현 기능 CTA를 화면에 표시하지 않는다. Backend의 별도 찜 기능이나 Recommendation 모델을 구현하지 않는다.

## 사용자 결정과 전송 값

- 저장 상태는 아직 입력하지 않음/건너뜀/입력 완료로 구분한다. 저장 버튼은 COMPLETED로 현재 값 전체를 교체한다. 미선택 값만 있는 COMPLETED도 허용한다.
- 선호 주종/맛/향은 아직 모름(null), 특별한 선호 없음([]), 직접 고른 목록을 구분한다. []는 싫어요/제외 피드백이 아니다. 8개 주종의 실제 라벨을 그대로 쓰고 맛/향은 각각 최대 20개·40자, 내부 개행도 단일 항목의 일부로 유지한다.
- 선호 도수와 반드시 지킬 가격/도수 범위를 다른 영역으로 입력한다. 도수는 0–100/소수 두 자리, 가격은 0–2,147,483,647 정수다. 빈칸은 제한 없음/미선택이고 0은 실제 값이다. 각 필수 하한≤상한만 확인하며 선호 목표가 범위 밖이라고 필수 범위를 완화하거나 목표를 바꾸지 않는다.
- 건너뛰기(SKIPPED)/초기화(NOT_STARTED)는 기존 취향/범위를 지운다는 확인을 거쳐 모든 필드를 null로 교체한다. 취소는 현재 초안과 저장값을 보존한다. 입력 오류가 있는 초안도 명시적으로 건너뛰거나 초기화할 수 있다.
- 태그 입력의 배열/추가·삭제 UI와 검증을 작은 공유 모듈로 분리해 F03과 R01에서 같은 원형 보존 규칙을 사용한다. 기존 F03 라벨/행동과 검사도 유지한다. 확인창은 기본 삭제 라벨을 보존하며 새 두 동작에만 건너뛰기/초기화 라벨을 지정한다.

## 읽기·쓰기·계정 수명

첫 GET이 성공하기 전에는 저장 폼을 열지 않는다. 실패를 미입력 취향으로 바꾸어 PUT하지 않으며 명시적 다시 불러오기로 재시도한다. 새 진입은 현재 서버 값을 읽은 뒤 편집 초기값을 확정하고, 편집 중에는 query를 비활성화해 재연결/재조회가 입력 상태를 unmount하지 않도록 한다. 최신 값은 화면을 떠났다가 다시 진입해 읽는다.

개인 query key는 계정 ID를 포함하고 기존 로그인/로그아웃의 query 초기화를 유지한다. 쓰기는 계정별 mutation key와 동기 pending 검사로 중복 전송을 막는다. 저장 중 화면을 나갔다 돌아오면 해당 계정의 기존 쓰기가 끝난 뒤 새 GET을 수행해 초기 읽기/쓰기의 경쟁을 피한다. 전송 중 새 입력을 허용하되 성공 응답의 정규화는 현재 초안이 제출한 객체와 동일할 때만 반영한다.

늦은 PUT은 캡처한 session 객체가 현재 session과 같은 경우에만 개인 캐시를 갱신한다. 화면을 떠났으면 로컬 입력/알림은 갱신하지 않는다. 다른 계정으로 로그인한 뒤 이전 성공이 private cache를 다시 만들거나 이전 401이 새 계정을 로그아웃시키지 않는다. 현재 계정의 GET/PUT 401은 그 계정의 개인 query와 세션을 비우고 원래 경로를 보존한 로그인으로 연결한다. 네트워크/503/필드 오류를 401이나 기본값으로 해석하지 않는다.

선호는 localStorage에 저장하지 않는다. 화면을 떠난 미저장 초안의 영구 보관, 브라우저 여러 창의 계정 동기화/동시 편집, ETag 충돌 해결과 요청 취소는 이번 증분이 아니다. Backend의 실제 권한/epoch 검증이 서버 저장을 결정한다.

공식 참고: [TanStack mutation](https://tanstack.com/query/latest/docs/framework/react/guides/mutations), [mutation key별 진행 상태](https://tanstack.com/query/latest/docs/framework/react/reference/useIsMutating). 기존 라이브러리/lockfile과 global retry:false는 유지했다.

## 검증

```bash
npm run typecheck
npm run test -- src/preferences.test.ts src/productFeatures.test.ts src/services/api.test.js
VITE_API_BASE_URL=/api npm run build
npm run test:browser -- --grep '취향|명시취향'
npm run check
```

단위 검증은 전체 세 상태/unknown·null/[]/0·8주종·정수/정밀도/범위·태그 중복/원형·별도 session-bound GET/PUT을 확인한다. 새 Chromium 9개는 다음 사용자 결과를 확인한다.

- Profile 진입→저장→새로고침/수정→취소 초안 보존→건너뛰기/초기화·전체 clear→[] 재저장, 390px overflow.
- GET 503일 때 폼/PUT 차단, 재시도와 PUT 400 뒤 초안 보존/명시적 다음 저장.
- PUT gate 중 새 입력·offline/online 이벤트 후 초안 보존과 한 번만 저장. 같은 경로 재진입은 쓰기 완료 뒤 새 GET.
- 계정 변경 뒤 보류한 이전 GET 성공/PUT 성공/PUT 401이 새 계정의 값·알림·세션을 바꾸지 않음.
- 비회원의 원래 경로 로그인 복귀와 현재 private GET 401의 만료 처리.

최초 두 계정 경합 검사에서 로그인 링크를 버튼으로 찾은 검증 준비 오류를 수정했다. 앱 결함/성능 수치로 집계하거나 기다림·재시도로 숨기지 않았다. 수정한 선택 9개 흐름은 통과했다. 최종 `npm run check`는 Node24.22.1에서 저장소 검사·locked 설치·audit 0·이미지·strict TypeScript·단위 **39개**·프로덕션 빌드·Chromium **41개**를 통과했다. 기존 32개 브라우저 흐름과 미처리 API/pageerror 검사도 유지했다. 이후 source 변경 없이 문서/인계만 정리하고 파일별 dist SHA-256을 ignored 인계에 남겼다. fixture는 직접 작성한 시연 값이며 실제 취향/추천 품질 성과가 아니다.

## 실제 통합 인계·대표 사례

ignored `preferences-real.mjs`는 실제 로그인/Profile 링크·unknown 조회·명시 값/필수 0·범위 밖 목표/내부개행 저장·GET/재진입·취소/건너뛰기/초기화·다른 계정·390px를 검사하도록 작성했다. 실행은 조정자가 전용 폐기 DB/불변 jar+dist로 순차 수행하며 worker는 구문만 확인한다. 최초 guest auth/me 401과 이후 예기치 않은 API 오류를 분리하고 계정/비밀번호/본문/원문 stack을 출력하지 않는다. fixture 검사와 실제 서버 통합 결과를 구분한다.

개인 입력·계정/비동기 경계는 실구현 후보지만 기존 네 사례와 비교해 독립적인 과거 결함/실측 개선의 더 강한 근거가 아직 없어 README 현재 기능만 반영하고 네 대표 사례·순서를 보존한다. 신규 구현을 과거 장애나 성능 개선으로 꾸미지 않는다. 전체 R01 추천 연결 완료로 체크하지 않는다.
