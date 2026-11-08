<div align="center">
  <img src="docs/brand/pubburi.webp" alt="주점부리" width="96" />
  <h1>주점부리 · Frontend</h1>
  <p><strong>취향에 맞는 한 잔을 발견하고 기록하는 주류 큐레이션</strong></p>
  <p>상품 탐색·후기·데모 주문과 관리자 웹</p>
  <a href="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml"><img src="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/React-19-61DAFB" alt="React 19" /> <img src="https://img.shields.io/badge/Vite-6-646CFF" alt="Vite 6" /> <img src="https://img.shields.io/badge/Node.js-24-5FA04E" alt="Node.js 24" />
</div>

<br />

## 📄 목차

- [프로젝트 개요](#overview)
- [현재 기능과 범위](#features)
- [기술 스택](#technology)
- [시스템 구조](#architecture)
- [문제 해결](#problem-solving)
- [로컬 실행](#development)
- [검증과 협업](#verification)
- [개발 계획](#roadmap)

<br />

<a id="overview"></a>

## ✍ 프로젝트 개요

상품을 탐색하고 후기를 확인하며 데모 주문을 생성하는 주점부리 웹입니다. Vite·React·TypeScript·React Router·TanStack Query·Zustand를 사용합니다.

<a id="features"></a>

## 🥃 현재 기능과 범위

| 영역 | 현재 제공 기능 |
|---|---|
| 홈·매장 | 배너, 주종 카테고리, 인기 상품, 매장 목록·현재 상세 위치 조회 |
| 탐색·상세 | 상품 검색·가격/도수 범위·맛/향 태그 필터·정렬·페이지 이동, 가격·도수·후기와 등록된 용량·설명·맛/향 태그·출처 조회, 유사 상품의 검수된 비교 근거 |
| 상품 비교 | 최대 네 상품 선택·해제, 현재 가격·도수·주종과 확인된 용량·맛/향·출처 비교, 비교 주소 복원 |
| 최근 본 상품 | 비회원 브라우저 기록 최대20개·30일, 로그인 중 메모리 기록, 현재 상품 다시 보기·기록 삭제/전체 삭제 |
| 회원·후기 | 회원가입·로그인, 본인 이름·비밀번호 수정, 평점과 후기 작성·수정·삭제 |
| 찜 | 상품 상세 저장·해제, 본인 찜 목록·페이지·현재 상품 링크 |
| 기본 둘러보기 | 설문 없이 기본 주류 조회·새로고침, 현재 상품 상세 이동 |
| 내 취향 | 본인 취향 설문·수정·건너뛰기·초기화, 필수 범위와 선호 구분, 검수 로컬 상품의 명시 추천·근거·개인 피드백과 현재 상세 연결 |
| 비공개 취향 기록 | 상세에서 경험·관심 메모 작성, 본인 목록·수정·삭제, 개인 평점·맛/향과 삭제된 상품의 기록 보존 |
| 취향 검색 문구 | 이번 검색에 사용할 선호 선택, 저장한 필수 범위와 문구 확인·명시 적용, 빈 결과·검색 조건 해제 |
| 장바구니·주문 | 기기 장바구니와 본인 계정 카트, 명시 병합·수량/삭제·중복 없는 결과 확인, 카트·본인 데모 주문의 검수 상품 특성 비교, 데모 주문 접수·현재 상세/상태와 당시 금액 조회 |
| 내부 알림 | 데모 주문 처리 완료·관리자의 본인 후기 삭제 소식, 헤더 미확인 수·본인 목록·개별/현재페이지 읽음과 관련 화면 연결 |
| 마이·관리자 | 주문 내역·스탬프·등급, 상품·매장·회원·후기·주문 관리와 상품 특성·출처 편집 |

<a id="technology"></a>

## ⚙️ 기술 스택

| 분류 | 기술 스택 |
|---|---|
| 언어 | TypeScript · CSS |
| UI | React |
| 라우팅 | React Router |
| 서버 상태 | TanStack Query |
| 클라이언트 상태 | Zustand |
| 개발·빌드 | Vite · Node.js · npm |
| 정적 자산 | WebP · sharp |
| 테스트 | Vitest · jsdom · Playwright |
| CI | GitHub Actions |

<a id="architecture"></a>

## 🏛️ 시스템 구조

```mermaid
flowchart LR
    Views["React 화면 · 공통 UI"] --> Stores["React Router · Query · Zustand"]
    Stores --> Client["API client · credentials include"]
    Client --> Proxy["Vite /api proxy · 개발 환경"]
    Proxy --> Backend["Backend :9987"]
```

<a id="problem-solving"></a>

## 🧩 문제 해결

### 1. 응답 유실·로그인 변경에도 장바구니 작업을 중복 반영하지 않기

#### 문제

계정 장바구니를 연결하는 개발 인수에서, 병합 응답을 받지 못한 뒤 다른 계정으로 갔다 돌아오면 기기에 담은 2개가 4개로 중복 합산됐다. 서버가 작업을 접수한 뒤401을 반환할 때는 원래 접수를 확인할 정보도 사라졌다. 사용자가 기기 원본과 주문 결과를 잃지 않고 복구할 방법이 필요했다.

#### 원인

로그인 캐시와 함께 미확정 작업의 식별자를 버려 새 병합을 만들었다. 브라우저 요청의 종료를 서버 작업의 종료로 오인한 것이다. 접수 기록 조회의404 뒤에도 먼저 전송한 작업이 나중에 반영될 수 있고, 서버가 작업을 반영한 뒤 인증을 다시 검사해401을 반환할 수도 있었다. 오류 코드나 현재 수량만으로 미적용을 판단할 수 없었다.

#### 해결

현재 화면의 인증 소유와 실제 HTTP 수명, 계정별 미확정 작업을 분리했다. 재로그인이나401 뒤에는 원POST를 재전송하지 않고 접수 결과를 조회한다.404에서도 기기 원본과 식별자를 유지하고 새 작업을 막는다. 사용자가 안전 종료를 선택하면 이미 접수된 결과를 돌려주거나 그 작업 번호의 후속 실행을 막도록 서버에 종료를 기록하는 API를 연결했다. 접수된 경우에만 캡처한 기기 제출분을 정리하고, 종료된 경우에는 원본을 남긴다. 이전 계정의 늦은 응답은 현재 입력·알림·경로를 바꾸지 못한다.

#### 결과

통제한 응답 유실·지연 반영 경로에서 같은 기기 수량이 반복 합산되지 않고, 인증 변경 뒤에도 새 주문을 만들지 않은 채 원래 접수를 확인한다. 실제 PostgreSQL/JPA와 일반·좁은 웹 화면을 연결해 명시 병합, 다른 기기의 수량 충돌 복구, 주문 당시 금액·원문 요청과 계정 격리를 확인했다. 개발 인수에서 확인한 정합성 결과다.

#### 대체안/회고

실패할 때마다 새 식별자로 보내거나404만 보고 원본을 다시 합치는 대안은 아직 실행 중인 서버 작업을 막지 못했다. 서버에 남는 종료 기록과 클라이언트의 복구 모드 제한을 함께 사용했다. 값 비교만으로 판단하지 않고 어떤 작업의 결과인지 확인한 점이 핵심이다. 복구 정보는 현재 탭 메모리 수명이며 모든 새로고침·크래시의 정확히 한 번 처리를 보장하지 않는다. 새로고침 뒤에는 현재 카트와 주문 내역을 먼저 확인한다.

#### 코드

현재 인증과 같은 작업의 접수를 확인한 경우에만 기기 제출분을 정리한다.

```ts
if (!owns(scope) || recoveries.get(scope.id) !== op) return null
publish(scope, cart)
if (result.status === 'APPLIED' && op.guest)
  cartStore.getState().consume(op.guest)
recoveries.delete(scope.id)
```

### 2. 검색·상세 경로별로 서버 상태를 분리해 늦은 응답 보호하기

#### 문제

기존 고객 탐색에서 검색 응답 전에 필터를 해제하면 최신 요청이 누락됐고, 진행 중 상세를 떠나 다른 상품으로 이동해도 새 상세를 표시하지 못했다. Vue에서 고친 이 사용자 결과를 React 전환에서도 보존해야 했다.

#### 원인

이전 읽기/쓰기 공용 중복 차단과 단일 catalog 상태는 최신 의도와 늦은 응답을 구분하지 못했다. 프레임워크만 바꾸고 같은 공용 응답 칸을 만들면 동일한 문제가 다시 생긴다.

#### 해결

TanStack Query에서 검색 조건 전체·상품 ID·후기 정렬·페이지를 query key에 포함한다. 화면은 현재 URL key를 구독하며 이전 응답은 이전 key의 캐시에만 저장된다. 상세 컴포넌트도 상품 ID로 구분해 수량·편집 상태가 다른 상품으로 섞이지 않게 하고, 읽기 오류는 해당 query의 화면에서 안내한다. 쓰기는 Zustand의 동기 pending 검사로 중복 실행을 차단한다.

#### 결과

검색 중 해제한 URL의 새 목록을 읽고, 떠난 상세의 늦은 성공·실패가 현재 상품이나 전역 오류를 바꾸지 않는다. 이전 읽기의 종료가 현재 읽기의 로딩 상태를 먼저 끄지도 않는다. 이는 응답 순서의 정확성 결과이며 네트워크 속도 개선 수치가 아니다.

#### 대체안/회고

전역 catalog에 응답을 복사하고 버전을 다시 관리하는 대신 query key가 서버 상태를 소유하게 했다. 고객/관리자 key와 개인 주문의 계정 ID도 분리한다. 현재 이전 GET 전송 자체는 취소하지 않으므로 사용하지 않는 서버 작업은 계속될 수 있다. 실제 서버 통합과 재시도 정책은 API별로 검증을 더한다.

#### 코드

```tsx
const products = useQuery<Page<Product>>({
  queryKey: ['catalog', 'products', filters],
  queryFn: () => api.products(filters),
  enabled: !invalidUrlFilters,
  refetchOnReconnect: (query) => !(query.state.error instanceof ApiClientError && query.state.error.status === 400),
})
```

상세와 후기에도 현재 상품·정렬·페이지를 key에 포함한다.

```tsx
const product = useQuery<Product>({
  queryKey: ['catalog', 'product', id],
  queryFn: () => api.product(id),
})
const comments = useQuery<ReviewPage>({
  queryKey: ['reviews', id, sort, page],
  queryFn: () => api.comments(id, { page, size: 10, sort, includeSummary: true, includeTasteTags: true }),
  enabled: product.isSuccess,
})
```

### 3. 삭제 처리 중 활성 버튼이 없어도 확인창의 키보드 포커스 유지하기

#### 문제

관리자 삭제 응답을 기다릴 때 취소·삭제 버튼이 모두 비활성화되면 Tab 포커스가 확인창 뒤의 화면으로 빠졌다. 화면에는 모달이 남아 있는데 키보드 사용자는 배경을 이동할 수 있었다.

#### 원인

기존 처리는 확인창 section의 keydown에서 첫/마지막 활성 버튼만 확인했다. 활성 버튼이 없는 상태와 disabled 전환으로 포커스가 section 밖으로 이동하는 상태를 다루지 않아, aria-modal 표시와 실제 조작 경계가 달라졌다.

#### 해결

확인창이 열려 있는 동안 document capture 단계에서 키보드 경계를 관리한다. 활성 버튼이 없으면 확인창 자체로 포커스를 옮기고, 다시 활성화되면 정·역방향 순환을 복원한다. 비동기 pending과 취소 callback의 최신 값을 ref로 읽으며 닫을 때 listener를 제거하고 남아 있는 원래 버튼으로 돌아간다.

#### 결과

일반·좁은 웹 화면에서 삭제 처리 중 포커스가 확인창 안에 남고, 실패 응답 뒤에는 취소·키보드 순환·Escape 닫기·원래 버튼 복귀가 동작한다. 처리 중 Escape를 막는 기존 정책과 단일 삭제 요청을 유지한다.

#### 대체안/회고

버튼 disabled나 ARIA 속성만으로 포커스 소유권이 보장되지는 않았다. section 조건 하나를 보완하는 대신, 이미 밖으로 이동한 포커스도 복원할 수 있는 수명 관리 범위를 선택했다. 네이티브 dialog나 라이브러리 전환은 대안으로 남기고 현재 공통 확인창의 레이아웃·삭제 정책을 보존했다. 현재는 버튼으로 구성한 단일 확인창의 키보드 범위이며 중첩 모달·전체 보조기술 조합·삭제된 trigger의 대체 복귀까지 완료했다는 뜻은 아니다.

#### 코드

```tsx
if (!first || !last) {
  event.preventDefault()
  root.focus()
} else if (!root.contains(focused) || focused === root) {
  event.preventDefault()
  const target = event.shiftKey ? last : first
  target.focus()
} else if (event.shiftKey && focused === first) {
  event.preventDefault()
  last.focus()
} else if (!event.shiftKey && focused === last) {
  event.preventDefault()
  first.focus()
}
```

### 4. 인증 소유와 조회 상태를 분리해 비공개 기록·후기 초안 보호하기

#### 문제

비공개 취향 기록을 기존 상품 상세에 연결하는 개발 인수에서 두 결함을 재현했다. 세션이 만료된 상태로 기록을 저장하면 편집창만 숨고 목록의 개인 메모·평점·태그는 남았다. 반대로 같은 계정의 로그인 상태를 다시 확인하는 정상 동작만으로 작성·수정 중인 회원 후기가 초기화됐다.

#### 원인

기록 API의 401을 편집 폼 안에서만 처리해 목록이 의존하는 상위 계정은 계속 유효한 것으로 남았다. 후기에서는 일시적인 `writable` 상태까지 초안 소유의 일부로 사용했다. 공유 세션의 GET 대기·실패를 실제 로그아웃과 같은 입력 폐기로 처리한 것이다.

#### 해결

현재 인증에서 받은 기록 API의 401을 상위 계정 경계로 전달해 목록과 편집을 함께 차폐하고, 명시 재확인 뒤에만 다시 읽는다. 이전 계정의 늦은 401은 현재 경계를 바꾸지 못한다. 후기 초안의 소유는 인증 Query·계정 ID·권한·실제 인증 전환으로 판단하고, 조회 준비 상태는 표시와 제출을 제어한다. 같은 인증의 조회 중에는 개인 입력 DOM을 제거하면서 메모리 초안을 보존하고 인증 세대가 바뀌면 폐기한다.

#### 결과

실제 서버의 세션을 브라우저 밖에서 종료한 뒤 저장·삭제·편집 조회를 시도해도 재확인 전 개인 카드와 입력이 표시되지 않았다. 일반·좁은 웹 화면에서 기록을 처음 펼쳐 로그인 GET을 실행한 뒤에도 후기 본문·평점·맛 태그가 유지됐다. 조회 실패 뒤 같은 계정으로 복구하는 상황과 재로그인의 초안 폐기도 제어한 브라우저 조건에서 구분했다. 개발 중 재현과 폐기 환경 인수의 결과이며 운영 사고 통계·자연 오류율·성능 개선 수치로 해석하지 않는다.

#### 대체안/회고

조회마다 캐시와 초안을 지우면 정상 재확인에도 입력을 잃는다. 폼만 숨기고 상위 계정을 유지하면 인증 실패 뒤 개인 목록이 남는다. 인증 소유와 읽기 준비를 분리해 두 상황을 다르게 처리했다. 브라우저 밖의 세션 변경은 다음 실제 API 응답에서 확인하며, 서버의 소유자 검증과 기록 revision 계약도 함께 필요하다.

#### 코드

```tsx
if (error instanceof ApiClientError && error.status === 401 && sameActor()) {
  active.current = null
  setVerified(null); setFailed('expired')
}
```

```tsx
if (account.auth !== auth || account.id !== session.data?.id ||
    account.role !== session.data?.role || account.transitioning !== transitioning) {
  const next = { auth, id: session.data?.id, role: session.data?.role, transitioning }
  currentAccount.current = next
  focusIntent.current = null
  saveFocus.current = null
  setAccount(next)
  setDraft({ rating: 5, comment: '', tasteTags: [] })
  setEditing(null)
  setDeleting(null)
}
```

<a id="development"></a>

## 🚀 로컬 실행

Node.js 24와 실행 중인 Backend가 필요합니다. 레포 루트에서 실행합니다.

세 서버와 DB를 함께 실행하는 방법은 [로컬 통합 실행](https://github.com/Pubburi/Backend/blob/main/docs/LOCAL-DEVELOPMENT.md)을 참고하세요.

```bash
cp .env.example .env
npm ci
./scripts/dev.sh
```

- 웹: http://localhost:5173
- VITE_API_BASE_URL이 비어 있으면 /api를 사용합니다. 개발 프록시는 VITE_API_PROXY_TARGET(기본 http://127.0.0.1:9987)로 전달합니다.
- 개발 포트는 PUBBURI_FRONTEND_PORT(기본 5173)이며, 사용 중이면 다른 포트로 바꾸지 않고 종료합니다.
- 세션 인증을 위해 API client의 credentials: include를 유지합니다.
- 환경변수에 비밀키를 넣지 않습니다. VITE_ 값은 브라우저에 포함됩니다.

```bash
npm run optimize:images
```

이미지 도구는 이 레포의 public/images를 처리합니다. 대응 WebP가 있는 PNG/JPG를 다시 추가하지 않습니다.

<a id="verification"></a>

## ✅ 검증과 협업

```bash
npm ci
npx playwright install chromium
npm run check
```

브라우저는 처음 한 번 준비합니다. 검증 범위와 CI 실행 절차는 [테스트·CI 안내](docs/TESTING.md)를 따릅니다.

main은 PR·frontend-ci 성공·최신 main 반영·대화 해결을 요구합니다. 필수 승인은 0명이고 관리자에게도 적용합니다. Squash merge 뒤 작업 브랜치를 정리합니다.

자동화 PR은 최신 커밋의 Codex 리뷰와 관련 검증까지 통과해야 병합합니다. [프론트 개발·운영 기준](AGENTS.md)을 함께 적용합니다.

<a id="roadmap"></a>

## 🗺️ 개발 계획

전체 R01–R08·F01–F12 MVP의 구현·연결·필수 검증 기한은 **2026년 12월 31일**, 최종 인계는 **2027년 2월 5일**입니다. P1·P2 모두 필수입니다.

현재 진행 범위와 완료 기준은 [프론트 계획](docs/ROADMAP.md)을 따릅니다. MVP 완료 이후에는 오류 개선과 실측 최적화를 이어갑니다.
