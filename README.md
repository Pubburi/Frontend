<div align="center">
  <img src="docs/brand/pubburi.webp" alt="주점부리" width="96" />
  <h1>주점부리 · Frontend</h1>
  <p><strong>취향에 맞는 한 잔을 발견하고 기록하는 주류 큐레이션</strong></p>
  <p>상품 탐색·후기·데모 주문과 관리자 웹</p>
  <a href="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml"><img src="https://github.com/Pubburi/Frontend/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <img src="https://img.shields.io/badge/Vue-3-4FC08D" alt="Vue 3" /> <img src="https://img.shields.io/badge/Vite-6-646CFF" alt="Vite 6" /> <img src="https://img.shields.io/badge/Node.js-24-5FA04E" alt="Node.js 24" />
</div>

<br />

## 📄 목차

- [프로젝트 개요](#overview)
- [현재 기능과 범위](#features)
- [대표 문제 해결](#problem-solving)
- [기술 스택](#technology)
- [시스템 구조](#architecture)
- [로컬 실행](#development)
- [검증과 협업](#verification)
- [개발 계획](#roadmap)

<br />

<a id="overview"></a>

## ✍ 프로젝트 개요

상품을 탐색하고 후기를 확인하며 데모 주문을 생성하는 주점부리 웹입니다. 현재 Vue 3·Vite·Pinia·Vue Router를 사용합니다.

<a id="features"></a>

## 🥃 현재 기능과 범위

| 영역 | 현재 제공 기능 |
|---|---|
| 홈 | 배너, 주종 카테고리, 인기 상품, 매장 목록 |
| 탐색·상세 | 상품 검색·필터·정렬·페이지 이동, 가격·도수·후기 조회 |
| 회원·후기 | 회원가입·로그인, 평점과 후기 작성·수정·삭제 |
| 장바구니·주문 | 기기 내 장바구니 저장, 수량 수정, 데모 주문 접수 |
| 마이·관리자 | 주문 내역·스탬프·등급과 관리자 관리 화면 |

<a id="problem-solving"></a>

## 🧩 대표 문제 해결

### 1. 브라우저 저장값을 검증하고 주문 성공 뒤에만 장바구니 비우기

**문제**

장바구니는 새로고침 뒤에도 복원되어야 하지만 브라우저에 저장된 값은 신뢰할 수 없다. 손상된 JSON이나 범위를 벗어난 수량을 화면 상태로 받아들이는 문제와, 주문 요청이 실패했는데 선택한 상품까지 잃는 문제를 함께 다뤄야 했다.

**원인**

`localStorage`의 문자열은 서버가 보장한 데이터가 아니며 수량 입력도 문자열·소수·음수가 될 수 있다. 주문 요청의 완료와 로컬 상태 초기화를 같은 시점으로 취급하면 실패 시 재시도에 필요한 상태가 사라진다.

**해결**

복원과 저장 경계에서 배열·상품 객체·정수로 해석되는 ID·음수가 아닌 가격을 확인하고 수량을 정규화한다. 수량은 1–99의 정수로 제한하고 해석할 수 없는 JSON은 빈 목록으로 복원한다. 데모 주문에는 상품 ID와 수량을 보내며, 주문 API의 성공 응답을 기다린 다음 장바구니를 비운다.

**결과**

화면은 정규화한 수량으로 합계를 계산하고, 주문 API가 거절되면 초기화 구문에 도달하지 않아 선택 상태를 유지한다. 브라우저에 보관한 상품 가격은 화면 표시용이며 서버의 주문 가격 검증을 대신하지 않는다.

**대체안/회고**

실패 후 장바구니를 다시 만드는 방식보다 성공 이후 초기화하는 흐름이 단순하다. 현재 필터는 저장 구조와 수량의 기본 방어이며 상품의 실재성·가격의 최신성을 보장하지 않는다. 저장 범위는 이 브라우저이고 계정 장바구니·로그인 시 병합은 별도 구현 대상이다. 이 사례는 데이터 보존에 관한 설계이며 전후 응답 시간 개선을 주장하지 않는다.

**코드**

[저장값 정규화·복원 및 주문 처리](https://github.com/Pubburi/Frontend/blob/main/src/stores/cart.js)

```js
export const MAX_CART_QUANTITY = 99

export function normalizeQuantity(value) {
  const quantity = Math.trunc(Number(value))
  if (!Number.isFinite(quantity)) return 1
  return Math.min(MAX_CART_QUANTITY, Math.max(1, quantity))
}

export function normalizeCart(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item) => item?.product && Number.isInteger(Number(item.product.id)) && Number(item.product.price) >= 0)
    .map((item) => ({ product: item.product, quantity: normalizeQuantity(item.quantity) }))
}

function readCart() {
  try {
    return normalizeCart(JSON.parse(localStorage.getItem('pubburi-cart') || '[]'))
  } catch {
    return []
  }
}
```

Pinia의 주문 action은 다음 순서로 로컬 상태를 변경한다.

```js
    async checkout(userId) {
      const order = await api.createOrder({
        userId,
        orderType: this.orderForm.orderType,
        orderTable: this.orderForm.orderTable.trim(),
        details: this.items.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
      })
      this.items = []
      this.persist()
      this.orderForm.orderTable = ''
      return order
    }
```

### 2. 관리자 작업의 갱신 범위를 활성 탭에 한정하기

**문제**

관리자 화면은 상품·매장·주문·후기·회원을 함께 다룬다. 한 영역을 변경한 뒤 다른 영역까지 다시 조회하거나, 고객 탐색 화면의 필터와 페이지를 관리 화면에서 공유하지 않도록 경계를 정해야 했다.

**원인**

고객 카탈로그의 검색 조건과 관리자 페이지의 조회 단위는 다르다. 상품 관리가 고객 카탈로그 상태를 재사용하면 고객 화면의 필터가 관리 목록에 영향을 줄 수 있고, 공통 전체 새로고침은 실제로 변경한 영역을 드러내지 못한다.

**해결**

고객용 `catalog`와 관리자용 `admin`을 별도 Pinia store로 두고 관리자 목록마다 페이지 상태를 소유하게 했다. 활성 탭의 조회 action만 선택하고, 주문 완료 같은 변경 action은 관련 주문 목록만 다시 불러온다.

**결과**

후기 탭의 새로고침은 후기 API를 선택하며 주문·회원 목록을 함께 요청하지 않는다. 주문 완료 후에도 갱신 범위가 주문 목록으로 한정된다. 이는 조회 책임과 상태 경계의 결과이며 실제 지연 시간이나 처리량의 개선 수치는 아직 제시하지 않는다.

**대체안/회고**

모든 목록을 한 번에 갱신하면 호출부는 단순하지만 변경 범위와 재조회 범위가 달라진다. 현재는 탭별 action을 명시하는 방식을 선택했다. 이 분리는 데이터 조회의 지연 로딩이며 관리자 화면 번들의 코드 분할을 뜻하지 않는다. 빠른 탭 전환의 응답 경쟁은 별도 개선 과제다.

**코드**

[관리자 조회·변경 action](https://github.com/Pubburi/Frontend/blob/main/src/stores/admin.js) · [독립된 고객 카탈로그](https://github.com/Pubburi/Frontend/blob/main/src/stores/catalog.js)

```js
    async loadActive(params = {}) {
      if (this.tab === 'products') return this.loadProducts(params)
      if (this.tab === 'markets') return this.loadMarkets(params)
      if (this.tab === 'orders') return this.loadOrders(params)
      if (this.tab === 'comments') return this.loadComments(params)
      return this.loadUsers(params)
    }
```

```js
    async completeOrder(id) {
      await api.completeOrder(id)
      await this.loadOrders({ page: this.ordersPage.page })
    }
```

### 3. HTTP 실패와 API 오류를 같은 오류 계약으로 전달하기

**문제**

화면은 JSON 형식의 업무 오류뿐 아니라 fetch 요청 실패와 JSON이 아닌 서버 오류에도 대응해야 한다. 화면마다 `fetch`와 응답 해석을 반복하면 사용자 안내와 필드별 오류 처리 방식이 달라진다.

**원인**

HTTP 상태, `ApiResponse.error`, 응답 본문의 파싱 가능 여부는 서로 다른 정보다. 통신 자체가 실패하면 HTTP 응답도 없으므로 단순한 JSON 처리만으로는 같은 인터페이스를 제공할 수 없다.

**해결**

요청 함수를 하나로 모아 세션 쿠키를 포함하고, 응답 텍스트를 해석한 뒤 HTTP 실패와 업무 오류를 `ApiClientError`로 변환한다. 성공한 응답은 `data`를 꺼내 반환하며 오류에는 상태·코드·필드 정보를 남긴다.

**결과**

호출부는 성공 데이터를 직접 사용하고, 실패 시에는 fetch 단계 네트워크 오류의 상태 0, HTTP 오류의 실제 상태, 업무 오류의 필드 정보를 같은 오류 객체에서 읽는다. HTML·일반 텍스트 오류가 JSON 파싱 예외로만 노출되는 흐름도 API 경계에서 정리한다.

**대체안/회고**

각 화면에서 오류를 해석하는 대신 전송 계층에서 형태를 통일했다. 다만 API client가 구분한 정보를 화면이 올바르게 활용하는 것은 별도 책임이다. 세션 초기화에서 네트워크 실패를 비로그인과 구분하는 동작은 아직 개선 대상이며, 이 사례가 그 문제까지 해결했다는 뜻은 아니다.

**코드**

[API 요청·오류 계약](https://github.com/Pubburi/Frontend/blob/main/src/services/api.js)

```js
async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    })
  } catch (cause) {
    const error = new ApiClientError({ code: 'NETWORK_ERROR' }, 0)
    error.cause = cause
    throw error
  }

  const text = await response.text()
  let envelope = null
  if (text) {
    try {
      envelope = JSON.parse(text)
    } catch {
      if (!response.ok) {
        throw new ApiClientError({ code: response.statusText || 'INVALID_RESPONSE' }, response.status)
      }
      throw new ApiClientError({ code: 'INVALID_RESPONSE', message: '서버 응답을 읽을 수 없습니다.' }, response.status)
    }
  }
  const hasEnvelope = envelope && Object.prototype.hasOwnProperty.call(envelope, 'data')

  if (!response.ok || envelope?.error) {
    const error = envelope?.error || { code: response.statusText, message: response.statusText }
    throw new ApiClientError(error, response.status)
  }

  return hasEnvelope ? envelope.data : envelope
}
```

### 4. 보안 업데이트와 기존 Vue 동작의 호환성 함께 지키기

**문제**

고정된 의존성 그래프에서 Vue·Vite·Vitest·sharp 및 전이 패키지의 보안 권고가 보고됐다. React 전환을 기다리는 동안에도 현재 Vue 웹을 유지해야 하므로 일괄 강제 업데이트로 동작을 바꾸는 접근은 적절하지 않았다.

**원인**

애플리케이션 소스가 그대로여도 lockfile이 오래되면 알려진 취약 버전을 계속 설치한다. 사용처가 없는 Vue Test Utils도 beautifier 계열의 전이 의존성을 남겼으며, sharp는 이미지 처리용 native 라이브러리까지 영향을 받았다.

**해결**

공식 권고와 Node·peer 호환 범위를 확인해 Vue 3·Vite 6·Vitest 4를 유지한 수정 버전을 적용했다. 사용하지 않는 테스트 유틸은 제거하고 이미지 도구의 실제 변환 경로를 유지했다. 의존성 검사에서 보통 이상 권고를 실패로 처리하도록 검사 명령도 추가했다.

**결과**

2026년 10월 31일 기준 전체·운영 의존성의 `npm audit` 보고 항목은 각각 0개가 됐다. 이는 변경 전 높음 8·보통 6 항목에 대한 알려진 보안 권고의 검사 결과이며, 실제 공격 차단 실험이나 모든 보안 위험의 부재를 뜻하지 않는다. 현재 화면·API·정적 자산은 유지했다.

**대체안/회고**

강제 audit fix나 peer 검사 생략 대신 호환 범위를 확인하고 lockfile을 갱신했다. lock 생성 중 발생한 npm 11.5.2의 peer 해석 오류는 격리된 npm 12.2.1로 처리해 전역 도구를 바꾸지 않았다. 새 권고가 생기면 다시 평가하며 보안 항목 감소를 앱 성능 향상으로 해석하지 않는다.

**코드**

[의존성 명세](https://github.com/Pubburi/Frontend/blob/main/package.json) · [선정 근거와 적용 조건](docs/DEPENDENCIES.md)

```json
{
  "name": "pubburi-vue",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "audit:deps": "npm audit --audit-level=moderate",
    "check:images": "node scripts/check-images.mjs",
    "optimize:images": "node scripts/optimize-images.mjs",
    "preview": "vite preview",
    "check": "bash scripts/check.sh"
  },
  "dependencies": {
    "pinia": "^2.3.1",
    "vue": "^3.5.42",
    "vue-router": "^4.6.4"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.3",
    "jsdom": "^24.1.3",
    "sharp": "^0.35.5",
    "vite": "^6.4.5",
    "vitest": "^4.1.12"
  },
  "engines": {
    "node": ">=24 <25"
  }
}
```

<a id="technology"></a>

## ⚙️ 기술 스택

| 영역 | 현재 기술 |
|---|---|
| 화면 | Vue 3, 로컬 CSS primitive |
| 상태·라우팅 | Pinia, Vue Router |
| 빌드 | Vite 6, Node.js 24, npm lockfile |
| 테스트 | Vitest, jsdom |
| 이미지 | WebP, sharp 기반 최적화 스크립트 |
| CI | GitHub Actions · frontend-ci |

<a id="architecture"></a>

## 🏛️ 시스템 구조

~~~mermaid
flowchart LR
    Views["Vue 화면 · 공통 UI"] --> Stores["Pinia · Router"]
    Stores --> Client["API client · credentials include"]
    Client --> Proxy["Vite /api proxy · 개발 환경"]
    Proxy --> Backend["Backend :9987"]
~~~

<a id="development"></a>

## 🚀 로컬 실행

Node.js 24와 실행 중인 Backend가 필요합니다. 레포 루트에서 실행합니다.

세 서버와 DB를 함께 실행하는 방법은 [로컬 통합 실행](https://github.com/Pubburi/Backend/blob/main/docs/LOCAL-DEVELOPMENT.md)을 참고하세요.

~~~bash
cp .env.example .env
npm ci
./scripts/dev.sh
~~~

- 웹: http://localhost:5173
- VITE_API_BASE_URL이 비어 있으면 /api를 사용합니다. 개발 프록시는 VITE_API_PROXY_TARGET(기본 http://127.0.0.1:9987)로 전달합니다.
- 개발 포트는 PUBBURI_FRONTEND_PORT(기본 5173)이며, 사용 중이면 다른 포트로 바꾸지 않고 종료합니다.
- 세션 인증을 위해 API client의 credentials: include를 유지합니다.
- 환경변수에 비밀키를 넣지 않습니다. VITE_ 값은 브라우저에 포함됩니다.

~~~bash
npm run optimize:images
~~~

이미지 도구는 이 레포의 public/images를 처리합니다. 대응 WebP가 있는 PNG/JPG를 다시 추가하지 않습니다.

<a id="verification"></a>

## ✅ 검증과 협업

~~~bash
npm run check
~~~

저장소 검사, lockfile 기반 설치, 의존성 보안 검사, 이미지 변환 확인, 기존 Vue 테스트와 프로덕션 빌드를 실행합니다. CI도 같은 검증을 수행합니다.

main은 PR·frontend-ci 성공·최신 main 반영·대화 해결을 요구합니다. 필수 승인은 0명이고 관리자에게도 적용합니다. Squash merge 뒤 작업 브랜치를 정리합니다.

자동화 PR은 최신 커밋의 Codex 리뷰와 관련 검증까지 통과해야 병합합니다. [개발·운영 기준](https://github.com/Pubburi/Backend/blob/main/docs/DELIVERY-PLAN.md)을 함께 적용합니다.

<a id="roadmap"></a>

## 🗺️ 개발 계획

- [x] [의존성 보안 경고 검토·수정 및 CI 검사](docs/DEPENDENCIES.md)
- [ ] Vite·React·TypeScript·React Router·TanStack Query·Zustand로 전환
- [ ] 기존 화면·라우팅·Pinia 상태·API 호출을 React 구조로 이전
- [ ] 기존 API 계약·세션 로그인·정적 자산·고객/관리자 기능 유지
- [ ] Vue 전용 테스트를 React에 맞게 전환하고 CI·문서 갱신
- [ ] 주요 고객·관리자 흐름의 기능 동등성 확인
- [ ] 취향 입력·맞춤 추천·추천 이유·피드백·검색 필터·찜 화면 구현

기한은 **2027년 2월 5일**이며 P1·P2 모두 필수 목표입니다. [전체 기능·일정](https://github.com/Pubburi/Backend/blob/main/docs/DELIVERY-PLAN.md)에 따라 진행하고, 실제 완성 화면을 검증한 뒤 이미지를 추가합니다.
