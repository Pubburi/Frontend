# FE03 고객 페이지 이동의 키보드 포커스 보존

## 범위·기준

- 기준 main은 `c09ee23`이다. 고객 상품 목록의 이전/다음 키보드 이동에서 기존 버튼이 사라지며 BODY로 포커스가 빠지는 경계를 수정한다. 관리자/찜/마이페이지의 페이지 동작은 유지한다.
- `/api`·ApiResponse·Product 일곱 필드·세션/장바구니, 가격/도수·리터럴 맛/향과 Unicode/제공자400, 적용 조건/초안·이전 응답 격리를 보존한다. 실제 PG·원본 DB·추천/검색 엔진을 변경하지 않는다.
- 선택한 고객 키보드/화면 검증이며 전체 FE03/C04·모든 보조기술/시각 인수를 완료로 바꾸지 않는다.

## 문제·원인과 사전 고정

제품 소스를 바꾸기 전에 기존100개 프로덕션 파일·소스/README와 작성한 시나리오/하네스를 SHA-256으로 고정했다. 같은 프로덕션 Chromium·직접 작성한14개 상품·두 번째 페이지 GET gate에서1280/390px의 키보드 Next를 실행했다. 로딩 중 `document.activeElement`가 BODY가 되는 같은 assertion 실패를 두 폭에서 먼저 확인했다. 직접 작성한 fixture의 고정 포커스 위반은2/2이며 실제 서버 관측과 합산하지 않는다.

새 페이지의 query key에는 초기 data가 없으므로 `Pagination`이 null로 바뀐다. 활성 버튼이 unmount되지만 다음 포커스 대상이 없었다. 실제 서버의 native Tab은 다음 상품으로 연결될 수도 있으므로, 이 결함을 상품 접근 불가능/Tab 건너뛰기나 전부 broken navigation으로 표현하지 않는다. 고정한 문제는 로딩/완료 사이의 명명되지 않은 BODY 포커스 손실이다.

## 선택·구현

고객 결과의 로딩·성공·조건 거절·오류가 같은 **상품 검색 결과** region 안에서 바뀌게 한다. region은 tabindex=-1로 일반 Tab 순서에 추가하지 않고 기존 팔레트의 focus-visible 표시를 사용한다. 현재 페이지 버튼에 DOM 포커스가 있는 키보드 활성화만 URL 변경 **전에 동기적으로** region에 포커스를 옮기고 첫 결과가 보이도록 스크롤한다. 완료 응답의 effect가 포커스/스크롤을 이동하지 않는다. 사용자가 Shift+Tab·다른 입력·다른 경로로 이동하면 늦은 응답은 그 선택을 유지한다.

공통 Pagination의 `onChange(page)` 한 인자 계약을 유지하고 고객만 선택적인 키보드 callback을 사용한다. 다른 호출자의 선택적 두 번째 인자(관리자 replace 등)를 새 의미로 바꾸지 않는다. 포인터와 현재 버튼이 집중되지 않은 script click은 기존 이동만 수행한다.

일반 query 이동의 App scrollTop이 좁은 화면의 새 포커스를 숨기지 않게, 정확한 키보드 이동에만 한 번 적용되는 소유를 전달한다. Router PUSH·이전 location key·정확한 목적지·여전히 집중된 결과 region을 모두 확인한다. 처리한 key를 기록하고 같은 URL의 새 key도 갱신한다. POP/REPLACE·직접 진입·검색·포인터에는 예외를 재사용하지 않으며, region이 계속 집중되어 있어도 Alt+Left는 기존 App 스크롤 정책을 따른다.

- 이전 결과를 placeholder로 남기는 대안은 로딩/실패와 새 조건의 결과 의미를 바꾸므로 선택하지 않았다.
- 응답 완료 뒤 자동 포커스 복구는 사용자가 이동한 뒤 초점을 빼앗을 수 있어 선택하지 않았다.
- region marker만으로 전역 스크롤을 생략하는 대안은 다음 POP에도 남을 수 있어, 단일 이동의 key/목적지 소유를 사용했다.

## 로컬 검증과 준비 경계

```bash
npm run typecheck
VITE_API_BASE_URL=/api npm run build
npm run test:browser -- catalog-pagination-focus.spec.js
npm run check
```

선택 Chromium10개가 통과했다. 두 폭의 Next·pending/완료 region 포커스·sticky header 아래 가시성/outline·다음 Tab의 첫 상품, cached Previous Space, Shift+Tab 이탈, pointer/새 초안·비집중 script click·다른 경로와 늦은 응답, 제공자400/503 뒤 명시 동작의 Tab 연결을 확인한다. 기존 조건/range0·리터럴 반복 태그도 API에 보존된다.

region이 계속 집중된 POP은 App의 기존 scrollTop 요청이 실행되는지 확인한다. native history가 이후 자기 스크롤 위치를 복원할 수 있으므로 최종 scrollY=0을 보장했다고 주장하지 않는다. 같은 URL 검색으로 새 history key를 만든 뒤의 다음 키보드 이동도 별도로 확인했다.

첫 선택 실행의 두 기대 오류는 원 시나리오/실패 trace와 함께 보존했다. region 직전 Tab 대상은 검색 버튼이 아니라 기존 전체 해제였고, POP의 최종 scrollY만으로 App 정책을 판단할 수 없었다. 실제 DOM 순서와 원래 scrollTo를 그대로 호출하는 관찰로 구분했다. 같은 제품/빌드에서 기대를 보완해10개를 확인했으며 assertion 제거·timeout 확대나 native history 강제 변경은 하지 않았다.

Node **24.22.1**의 전체 `npm run check`는 저장소 검사·locked 설치·audit 취약점 **0**·이미지 도구·strict TypeScript·단위 **86개**·프로덕션 빌드·Chromium **244개**를 통과했다. 최종100개 프로덕션 파일과 소스/시나리오를 SHA-256으로 동결했고, 검사 뒤 같은 byte임을 확인했다. 자체 preview를 종료했고 기존 사용자 프로세스를 변경하지 않았다.

직접 작성한 fixture는 실제 상품 사실/추천 자료나 Backend E2E가 아니다. 테스트/CI 집계나 고정 포커스 정확성 결과를 시간 성능·자연 발생 오류율로 바꾸지 않는다.

## 별도 실제 연결·사례 판단·인계

같은80개 시연 상품의 소유 폐기 MySQL, 불변 legacy Backend jar(SHA-256 `dcb73c35b4dbf148b05775992408b8d930977e84022fbabc878e68491ed22b81`), 고정 Recommendation `aef0283ae65af1fdbde58f7c7d13bb808add3a80`/B0와 기준/후보 프로덕션 웹을 연결했다. 같은 GET-only 하네스(SHA-256 `012a79c530d04827311a39bef1b69b608d36ef9ea4cbff5f7fcac189ffba3b7c`)를1280×900/390×900의 양쪽 웹에 적용했다. 실제 API 응답을 가로채거나 보류/대체하지 않았고 업무 쓰기는 없었다.

| 같은 실제 조건 | 기준 웹 | 후보 웹 |
|---|---|---|
| 1280px 키보드 Next의 pending/페이지2 완료 | BODY | 이름이 상품 검색 결과인 SECTION |
| 390px의 같은 활성화 | BODY | 같은 명명된 SECTION |
| 다음 Tab | 양쪽 폭에서 이미 첫 상품 `/products/62` | 같은 첫 상품 연결 보존 |

고정한 실제 BODY 포커스 손실 조건은 **2/2→0/2**다. natural pending은 두 폭 모두 관측됐지만 지연을 주입한 fixture와 합산하지 않는다. 별도 네 대조(폭별 포인터1·검색/이력1)는 이전 포커스 속성과 입력 소유를 유지했고 페이지별 상품 ID도 같았다. Tab이 첫 상품을 건너뛰던 문제를 수정한 것으로 표시하지 않는다.

후보만의 별도 가시성 진단에서는 region top이1280px에서90.078125px/header bottom72px,390px에서89.875px/header bottom64px였다. 첫 카드 top91.078125/90.875px·solid3px outline과 문서 너비1280/390px를 확인했다. 이 진단은 수정 뒤 두 화면의 위치/표시 근거이며 같은 전후 산식의 시각 개선율이나 전체 보조기술 인수가 아니다.

예상하지 않은 API 오류·pageerror·응답 대체·하네스 업무 쓰기는 없었다. 소유 프로세스만 정리했고 원본/공유 DB·계정은 수정하지 않았다. 실제 두 조건·네 대조·후보 가시성·fixture10개는 각각 별도 근거다.

기존 네 README 사례와 비교했다. 고객의 일반 키보드 탐색이라는 실제 결함이지만, 기존 파괴적 확인창의 비동기 DOM 포커스와 인접하며 주문 입력·개인 쓰기/인증 수명·최신 요청보다 강한 독립 영향을 입증하지 못했다. README 전체와 네 본문/순서·코드를 보존하고 [선정 기록](../case-study-register.md)에 판단을 남긴다. 테스트 수/CI 집계로 교체하지 않는다.

최신 PR/CI·완료 Codex 리뷰·미해결 대화·한국어 Squash/main CI·브랜치 정리는 조정자가 확인한다. 비공개 기획 주소·개인 경로·자격정보·원문 로컬 로그는 공개 근거에 포함하지 않는다.
