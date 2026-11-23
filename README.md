<div align="center">
  <img src="public/images/icon/mainIcon.webp" alt="주점부리" width="96" />
  <h1>주점부리 · Frontend</h1>
  <a href="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml"><img src="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
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

주점부리에서 상품을 찾고 비교하는 웹입니다. 회원은 후기를 쓰거나 비공개로 취향을 기록하고, 장바구니에 담은 상품으로 데모 주문을 접수합니다. 관리자는 상품 정보와 주문을 관리합니다.

<a id="features"></a>

## 🥃 현재 기능과 범위

- 상품을 주종·가격·도수·맛과 향으로 찾습니다. 검색 결과가 없으면 다른 검색어를 제안합니다. 최대 네 상품의 최신 가격과 확인된 특성을 비교할 수 있습니다.
- 홈에서 도수와 용량 기준으로 입문·선물·음식에 맞는 상품을 둘러봅니다.
- 회원은 취향과 계정 정보를 수정하고, 찜한 상품과 최근 본 상품을 다시 엽니다. 비회원 열람 기록은 기기에 최대 20개를 30일간, 회원 기록은 로그인 중에만 보관합니다.
- 계정 장바구니와 기기 장바구니를 선택해 합칩니다. 데모 주문을 접수한 뒤 주문 당시 금액과 처리 상태를 확인합니다.
- 공개 후기를 작성하거나 나만 보는 경험과 관심을 기록합니다. 주문 처리와 후기 삭제는 내부 알림에서 확인합니다.
- 관리자는 상품·특성과 출처, 매장·회원 정보를 수정하고, 후기를 삭제하거나 데모 주문을 완료 처리합니다.

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

### 응답 유실·로그인 변경에도 장바구니 작업을 중복 반영하지 않기

#### 문제

계정 장바구니를 검증하던 중 병합 응답을 받지 못하고 계정을 바꿨다가 돌아오면, 기기에 담은 2개가 계정 장바구니에 4개로 합산됐다. 서버가 작업을 접수한 뒤 401을 돌려주면 원래 접수를 조회할 정보도 사라졌다.

#### 원인

로그인 캐시를 비울 때 미확정 작업의 식별자도 버렸다. 접수 조회가 404여도 먼저 보낸 요청이 나중에 반영될 수 있다. 쓰기를 끝낸 서버가 응답 전에 인증을 다시 확인하면 401도 반환할 수 있다.

#### 해결

화면을 소유한 계정, 진행 중인 HTTP 요청, 계정별 미확정 작업을 따로 관리했다. 401이나 재로그인 뒤에는 처음 요청의 접수 결과를 조회한다. 조회가 404면 기기 원본과 식별자를 유지하고 새 작업을 막는다. 사용자가 안전 종료를 누르면 서버는 접수 결과를 돌려주거나 같은 식별자의 후속 실행을 차단한다. 접수를 확인한 경우에만 기기에서 실제로 제출한 수량을 뺀다. 늦게 도착한 이전 계정의 응답은 현재 화면과 입력을 건드릴 수 없다.

#### 결과

응답이 유실되거나 지연된 조건에서 기기 수량이 한 번만 반영됐다. 인증이 바뀌어도 새 주문을 만들지 않고 원래 접수를 확인했다. PostgreSQL·JPA를 연결한 일반 화면과 좁은 화면에서 기기 병합, 수량 충돌 복구, 주문 당시 금액과 계정 격리를 확인했다.

#### 대체안/회고

실패할 때마다 새 식별자를 발급하면 서버에서 먼저 처리 중인 작업을 막을 수 없었다. 서버에 종료를 기록하고 화면에서 같은 작업의 접수만 조회하도록 했다. 복구 정보는 현재 탭에 남는다. 새로고침 뒤에는 장바구니와 주문 내역을 확인해야 한다.

#### 코드

같은 계정에서 제출한 작업의 접수가 확인되면 기기 제출분을 정리한다.

```ts
if (!owns(scope) || recoveries.get(scope.id) !== op) return null
publish(scope, cart)
if (result.status === 'APPLIED' && op.guest) cartStore.getState().consume(op.guest)
// A new login does not restore the old form's ownership or redirect intent.
recoveries.delete(scope.id)
```

### 취향 기록을 접어도 작성 중인 입력 지키기

#### 문제

내 취향 기록 목록에서 편집을 접었다가 다시 열면 작성 중인 메모·평점·맛 태그가 사라졌다. 다시 열 때마다 서버에서 저장된 값을 불러왔다.

#### 원인

같은 상태로 편집할 기록과 열림 여부를 관리했다. 접을 때 선택을 해제하면서 편집 폼과 초안이 사라졌고, 다음에 열 때 상세 조회부터 시작했다.

#### 해결

편집할 기록 ID와 열림 상태를 구분했다. 같은 기록을 접으면 폼은 유지하고 `hidden`으로 가려 Tab 탐색에서 건너뛰게 했다. 다른 기록·페이지·계정으로 이동하거나 목록을 새로고침하면 기존 폼을 제거한다.

#### 결과

390px·1440px Chromium을 실제 PostgreSQL에 연결하고 같은 기록을 읽는 세션 1개·4개가 있는 조건에서 전후 각각 12회 측정했다. 초안 손실은 12/12회에서 0/12회, 다시 열 때 보낸 상세 조회는 12건에서 0건이 됐다. Enter로 펼쳐 메모 입력이 보일 때까지의 p95는 41.26ms에서 7.43ms로 33.83ms(82.0%) 줄었다. 실제 저장값과 버전도 전후 동일했다.

#### 대체안/회고

초안을 전역 상태나 브라우저 저장소에 두면 다른 화면에서도 복원할 수 있지만 비공개 입력을 지우는 계정·페이지 경계가 늘어난다. 편집 폼이 이미 가진 상태를 써서 같은 화면의 한 기록에만 초안을 남겼다. 탭을 닫거나 다시 로그인하면 서버에 저장된 값부터 편집한다.

#### 코드

같은 기록은 열림만 바꾼다. 편집 영역은 이 상태를 받아 접힐 때 `hidden`을 적용한다.

```tsx
<button
  className="btn btn-outline-dark"
  type="button"
  aria-expanded={editing?.id === note.id && editing.open}
  onClick={() => setEditing((current) => ({
    id: note.id,
    open: current?.id === note.id ? !current.open : true,
  }))}
>
  {editing?.id === note.id && editing.open ? '기록 편집 닫기' : '내 기록 편집'}
</button>
```

<a id="development"></a>

## 🚀 로컬 실행

Node.js 24와 실행 중인 Backend가 필요합니다. Backend와 데이터베이스는 해당 저장소의 실행 안내를 따릅니다. [Backend](https://github.com/Pubburi/Backend)

```bash
cp .env.example .env
npm ci
./scripts/dev.sh
```

- 웹은 http://localhost:5173에서 열립니다. 포트는 `PUBBURI_FRONTEND_PORT`로 지정합니다. 지정한 포트가 사용 중이면 실행을 종료합니다.
- API 주소의 기본값은 `/api`입니다. 개발 프록시는 `VITE_API_PROXY_TARGET`의 Backend로 전달합니다. 기본 대상은 `http://127.0.0.1:9987`입니다.
- 세션 인증에는 `credentials: include`를 사용합니다. 브라우저에서 읽을 수 있는 `VITE_` 변수에는 공개 설정만 넣습니다.
- 이미지 변환은 `npm run optimize:images`로 실행합니다. 새 이미지는 `public/images`의 기존 WebP와 중복되는지 먼저 확인합니다.

<a id="verification"></a>

## ✅ 검증과 협업

```bash
npm ci
npx playwright install chromium
npm run check
```

`npm run check`는 의존성·이미지·타입·단위 테스트·프로덕션 빌드와 Chromium 흐름을 검증합니다. main은 `frontend-ci`를 통과하고 최신 main을 반영한 PR을 Squash merge합니다. 자동화 PR은 최신 커밋의 Codex 리뷰와 대화 해결을 확인합니다. [협업 기준](CONTRIBUTING.md)

제품 변경에는 프로덕션 브라우저의 완료·오류 n/N 측정을 필수로 수행하고, 동작에 맞게 로딩·상호작용 시간의 p50/p95와 요청·전송량을 기록합니다. 관련 Backend에 격리 부하를 걸어 사용자 흐름과 데이터 정합성도 확인합니다. 입력·환경·부하·캐시·반복 조건을 고정해 전후 원값과 한계를 남깁니다. 문서 수정만으로 새 성능 측정을 완료한 것으로 기록하지 않습니다.

<a id="roadmap"></a>

## 🗺️ 개발 계획

MVP 검증 기한은 **2026년 12월 31일**, 최종 인계일은 **2027년 1월 15일**입니다. 날짜는 한국 시간 기준입니다.
