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
- [대표 문제 해결](#problem-solving)
- [기술 스택](#technology)
- [시스템 구조](#architecture)
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
| 홈 | 배너, 주종 카테고리, 인기 상품, 매장 목록 |
| 탐색·상세 | 상품 검색·필터·정렬·페이지 이동, 가격·도수·후기 조회 |
| 회원·후기 | 회원가입·로그인, 평점과 후기 작성·수정·삭제 |
| 찜 | 상품 상세 저장·해제, 본인 찜 목록·페이지·현재 상품 링크 |
| 기본 둘러보기 | 설문 없이 기본 주류 조회·새로고침, 현재 상품 상세 이동 |
| 내 취향 | 본인 취향 설문·수정·건너뛰기·초기화, 선호와 반드시 지킬 범위 구분 |
| 장바구니·주문 | 기기 내 장바구니 저장, 수량 수정, 데모 주문 접수 |
| 마이·관리자 | 주문 내역·스탬프·등급, 상품·매장·회원·후기·주문 관리와 상품 특성·출처 편집 |

<a id="problem-solving"></a>

## 🧩 대표 문제 해결

### 1. 주문 완료와 다음 장바구니 입력 분리하기

**문제**

데모 주문을 전송한 뒤 다른 상품을 담거나 다음 요청사항을 작성하면, 이전 주문의 성공 처리가 아직 보내지 않은 입력까지 지웠다. 다른 화면으로 이동했어도 늦은 성공이 주문 내역으로 강제 이동시켰다. 서버에 접수된 주문과 이후 사용자의 선택을 함께 보존해야 했다.

**원인**

API에는 제출 시점의 상품·수량·요청을 올바르게 보냈지만, 완료 시점에는 현재 장바구니 전체와 현재 요청사항을 무조건 초기화했다. 상품 ID만 비교해서 제출량을 빼면 삭제 후 다시 담은 같은 상품을 새 선택으로 구분할 수 없고, 입력값만 비교하면 같은 값으로 다시 작성한 새 폼도 지운다.

**해결**

상품 행에 저장하지 않는 메모리 소유 토큰을 두고 제출할 때 수량·토큰·폼 객체를 캡처했다. 성공 뒤 같은 행에서 제출한 수량만 차감하며, 새 상품과 삭제 후 다시 담은 행은 남긴다. 요청사항은 여전히 제출 폼일 때만 비운다. 원래 장바구니 화면과 경로가 유지된 경우에만 주문 내역으로 이동하고, 접수 중 추가 수량과 새 요청은 다음 주문에 남는다는 의미를 안내한다. 기존 저장 키·배열 형식과 보관 실패의 분리는 유지했다.

**결과**

접수된 원래 주문을 바꾸지 않으면서 추가 상품·수량과 새 요청사항으로 다음 주문을 이어갈 수 있다. 로컬 실제 서버 연동에서도 원래 제출 내용과 다음 입력을 함께 보존했고, 다른 화면이나 다시 연 장바구니를 이전 성공이 이동시키지 않는다. 변경하지 않은 정상 주문은 정리하고 거절된 주문의 현재 입력은 남긴다. [적용 조건과 한계](docs/plans/2026-11-01-checkout-submission-ownership.md)는 작업 기록으로 구분했다.

**대체안/회고**

주문 중 모든 담기·편집·이동을 막는 대신 이미 보낸 주문과 다음 선택의 소유를 나눴다. 값 비교나 전체 초기화로는 수량 추가·삭제 후 재추가·새 폼을 함께 다루지 못한다. 전송 후 수량을 줄여도 접수된 주문을 취소하는 것은 아니며 잔여량을 음수로 만들지 않는다. 전체 새로고침·여러 창의 주문 조정, 서버 멱등성과 계정 장바구니 병합은 별도 과제다. 브라우저 보관이 막힌 동안 새로고침 복원을 보장하지 않는다.

**코드**

[상품 행·전송 수량·폼 소유 처리](src/state/cart.ts)

행을 새로 담을 때 소유를 만들고 삭제할 때 끝낸다. 토큰은 기존 저장 배열이나 API에 추가하지 않는다.

```ts
const lineOwners = new Map(restored.map((item) => [item.product.id, Symbol()]))
```

```ts
add(product, quantity = 1) {
  const amount = normalizeQuantity(quantity)
  const items = get().items
  if (!items.some((item) => item.product.id === product.id))
    lineOwners.set(product.id, Symbol())
  save(
    items.some((item) => item.product.id === product.id)
      ? items.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: Math.min(99, item.quantity + amount) }
            : item,
        )
      : [...items, { product, quantity: amount }],
  )
},
```

```ts
remove(id) {
  lineOwners.delete(id)
  save(get().items.filter((item) => item.product.id !== id))
},
```

전송 후에는 같은 행의 제출량만 정리하고 다음 폼은 남긴다.

```ts
async checkout(userId) {
  const { items, orderForm } = get()
  const submitted = new Map(
    items.map((item) => [
      item.product.id,
      { quantity: item.quantity, owner: lineOwners.get(item.product.id) },
    ]),
  )
  const order = await api.createOrder({
    userId,
    orderType: orderForm.orderType,
    orderTable: orderForm.orderTable.trim(),
    details: items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
    })),
  })
  save(
    get().items.flatMap((item) => {
      const original = submitted.get(item.product.id)
      if (!original || lineOwners.get(item.product.id) !== original.owner)
        return [item]
      const quantity = Math.max(0, item.quantity - original.quantity)
      if (quantity > 0) return [{ ...item, quantity }]
      lineOwners.delete(item.product.id)
      return []
    }),
  )
  if (get().orderForm === orderForm)
    set({ orderForm: { ...orderForm, orderTable: '' } })
  return order
},
```

[원래 화면의 성공 후 이동 경계](src/pages/AccountPages.tsx)

```tsx
const location = useLocation()
const currentLocation = useRef(location.key)
currentLocation.current = location.key
const mounted = useRef(false)
useEffect(() => {
  mounted.current = true
  return () => { mounted.current = false }
}, [])
async function checkout(event: FormEvent) {
  event.preventDefault()
  if (!session.data) {
    ui.error(new Error('주문하려면 먼저 로그인해 주세요.'))
    navigate('/account?redirect=/cart')
    return
  }
  const userId = session.data.id
  const submittedLocation = location.key
  const result = await ui.run(
    'checkout',
    () => cart.checkout(userId),
    '주문이 접수되었습니다.',
  )
  if (result.ok) {
    // The order succeeded. A later profile/list refresh must not turn it into a failed order.
    void client.invalidateQueries({ queryKey: ['account', userId] })
    void client.invalidateQueries({ queryKey: ['catalog', 'popular'] })
    if (mounted.current && currentLocation.current === submittedLocation)
      navigate('/profile')
  }
}
```


### 2. 검색·상세 경로별로 서버 상태를 분리해 늦은 응답 보호하기

**문제**

기존 고객 탐색에서 검색 응답 전에 필터를 해제하면 최신 요청이 누락됐고, 진행 중 상세를 떠나 다른 상품으로 이동해도 새 상세를 표시하지 못했다. Vue에서 고친 이 사용자 결과를 React 전환에서도 보존해야 했다.

**원인**

이전 읽기/쓰기 공용 중복 차단과 단일 catalog 상태는 최신 의도와 늦은 응답을 구분하지 못했다. 프레임워크만 바꾸고 같은 공용 응답 칸을 만들면 동일한 문제가 다시 생긴다.

**해결**

TanStack Query에서 검색 조건 전체·상품 ID·후기 페이지를 query key에 포함한다. 화면은 현재 URL key를 구독하며 이전 응답은 이전 key의 캐시에만 저장된다. 상세 컴포넌트도 상품 ID로 구분해 수량·편집 상태가 다른 상품으로 섞이지 않게 하고, 읽기 오류는 해당 query의 화면에서 안내한다. 쓰기는 Zustand의 동기 pending 검사로 중복 실행을 차단한다.

**결과**

검색 중 해제한 URL의 새 목록을 읽고, 떠난 상세의 늦은 성공·실패가 현재 상품이나 전역 오류를 바꾸지 않는다. 이전 읽기의 종료가 현재 읽기의 로딩 상태를 먼저 끄지도 않는다. 이는 응답 순서의 정확성 결과이며 네트워크 속도 개선 수치가 아니다. [이전 결함 재현](docs/plans/2026-10-31-latest-product-requests.md) · [React 전환 검증 범위](docs/plans/2026-10-31-react-migration.md)

**대체안/회고**

전역 catalog에 응답을 복사하고 버전을 다시 관리하는 대신 query key가 서버 상태를 소유하게 했다. 고객/관리자 key와 개인 주문의 계정 ID도 분리한다. 현재 이전 GET 전송 자체는 취소하지 않으므로 사용하지 않는 서버 작업은 계속될 수 있다. 실제 서버 통합과 재시도 정책은 API별로 검증을 더한다.

**코드**

[상품·후기 query와 라우트 상태](https://github.com/Pubburi/Frontend/blob/main/src/pages/CatalogPages.tsx)

```tsx
const products = useQuery<Page<Product>>({
    queryKey: ['catalog', 'products', filters],
    queryFn: () => api.products(filters),
  })
```

상세와 후기에도 현재 상품·페이지를 key에 포함한다.

```tsx
const product = useQuery<Product>({
    queryKey: ['catalog', 'product', id],
    queryFn: () => api.product(id),
  })
  const comments = useQuery<Page<Review>>({
    queryKey: ['reviews', id, page],
    queryFn: () => api.comments(id, { page, size: 10 }),
    enabled: product.isSuccess,
  })
```

### 3. 삭제 처리 중 활성 버튼이 없어도 확인창의 키보드 포커스 유지하기

**문제**

관리자 삭제 응답을 기다릴 때 취소·삭제 버튼이 모두 비활성화되면 Tab 포커스가 확인창 뒤의 화면으로 빠졌다. 화면에는 모달이 남아 있는데 키보드 사용자는 배경을 이동할 수 있었다.

**원인**

기존 처리는 확인창 section의 keydown에서 첫/마지막 활성 버튼만 확인했다. 활성 버튼이 없는 상태와 disabled 전환으로 포커스가 section 밖으로 이동하는 상태를 다루지 않아, aria-modal 표시와 실제 조작 경계가 달라졌다.

**해결**

확인창이 열려 있는 동안 document capture 단계에서 키보드 경계를 관리한다. 활성 버튼이 없으면 확인창 자체로 포커스를 옮기고, 다시 활성화되면 정·역방향 순환을 복원한다. 비동기 pending과 취소 callback의 최신 값을 ref로 읽으며 닫을 때 listener를 제거하고 남아 있는 원래 버튼으로 돌아간다.

**결과**

일반·좁은 웹 화면에서 삭제 처리 중 포커스가 확인창 안에 남고, 실패 응답 뒤에는 취소·키보드 순환·Escape 닫기·원래 버튼 복귀가 동작한다. 처리 중 Escape를 막는 기존 정책과 단일 삭제 요청을 유지한다. [재현 조건·오류 결과·한계](docs/plans/2026-11-01-pending-dialog-focus.md)

**대체안/회고**

버튼 disabled나 ARIA 속성만으로 포커스 소유권이 보장되지는 않았다. section 조건 하나를 보완하는 대신, 이미 밖으로 이동한 포커스도 복원할 수 있는 수명 관리 범위를 선택했다. 네이티브 dialog나 라이브러리 전환은 대안으로 남기고 현재 공통 확인창의 레이아웃·삭제 정책을 보존했다. 현재는 버튼으로 구성한 단일 확인창의 키보드 범위이며 중첩 모달·전체 보조기술 조합·삭제된 trigger의 대체 복귀까지 완료했다는 뜻은 아니다.

**코드**

[공통 확인창의 포커스·listener 수명](https://github.com/Pubburi/Frontend/blob/main/src/components/ui.tsx)

```tsx
  const dialog = useRef<HTMLElement>(null)
  const titleId = useId()
  const current = useRef({ pending, onCancel })
  current.current = { pending, onCancel }
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.focus()
    function handleKeyDown(event: KeyboardEvent) {
      const root = dialog.current
      if (!root) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (!current.current.pending) {
          current.current.onCancel()
        }
        return
      }
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey)
        return
      const buttons = Array.from(
        root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
      )
      const first = buttons[0]
      const last = buttons.at(-1)
      const focused = document.activeElement
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
    }
    document.addEventListener('keydown', handleKeyDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true)
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  useEffect(() => {
    if (pending) dialog.current?.focus()
  }, [pending])
```

### 4. 인증 캐시 초기화와 진행 중인 취향 쓰기의 수명 분리

**문제**

취향 저장 응답을 받기 전에 로그아웃하고 같은 계정으로 다시 로그인하면, 서버에는 새 값이 저장됐는데 새 편집 화면은 이전 값에 머물렀다. R01 초기 구현을 검토하며 이 순서를 재현했다. 다른 계정에 이전 응답이 섞이지 않도록 하는 검사만으로는 같은 계정의 재로그인 문제를 해결하지 못했다.

**원인**

로그인·로그아웃의 `client.clear()`는 개인 query와 mutation cache를 지웠다. 하지만 이미 인증 검사를 통과한 HTTP 쓰기는 서버에서 계속될 수 있다. mutation 개수가 0이라는 이유로 새 GET을 열면 쓰기 전 값을 편집 초기값으로 확정한다. 이전 세션 응답을 거부하는 검사는 유지돼야 하므로, 그 늦은 응답으로 새 폼을 고치는 것도 올바른 해결이 아니었다. 캐시가 비워진 상태와 서버 쓰기가 끝난 상태를 혼동한 것이 원인이었다.

**해결**

계정별 미완료 HTTP 소유를 QueryClient 밖의 Zustand Map에 두었다. 취향·인증값 대신 요청 토큰만 보관하고 자기 `finally`만 해제한다. 같은 계정의 새 세션은 이전 HTTP 응답이 정착한 뒤 새 GET으로 편집을 시작하며, 다른 계정은 독립적으로 사용한다. 인증 캐시는 계속 초기화한다. 늦은 응답은 캡처한 세션과 현재 세션이 같을 때만 캐시에 반영한다. 화면을 떠났으면 로컬 입력·알림을 갱신하지 않고, 같은 화면에서는 현재 초안이 제출한 객체와 같을 때만 정규화하고 이후의 새 입력을 보존한다.

**결과**

동일 계정으로 다시 로그인하면 진행 중인 취향 쓰기의 응답을 기다린 뒤 새 GET으로 서버 저장값과 편집 초기값을 일치시킨다. 다른 계정은 독립적으로 읽고 편집하며, 이전 세션의 늦은 응답은 새 세션에 적용하지 않는다. 같은 화면에서 저장 중 새로 입력한 초안도 유지한다. 이 동작은 같은 웹 실행 안의 계정 이동에 적용되며, 브라우저 종료·전체 재로딩을 넘는 미확정 저장까지 보장하지 않는다. [조건과 한계](docs/plans/2026-11-01-explicit-preferences-ui.md)

**대체안/회고**

미완료 쓰기를 기억하려고 로그아웃 시 개인 캐시를 남기는 대신, 취향값을 담지 않는 요청 소유만 분리했다. 저장 중 로그아웃을 막는 방법은 계정 이동까지 묶으며, 전송 취소만으로 이미 시작한 서버 작업의 취소를 보장할 수도 없다. 이 Map은 같은 웹 실행 안에서만 유효하다. 브라우저 종료·전체 재로딩 뒤 미확정 커밋 조정과 여러 창의 수정 충돌에는 별도 서버 계약이 필요하다. 초기 구현에서 재현한 결함과 확인한 한계를 기록하며 운영 장애나 모든 동시성 문제의 해결로 표현하지 않는다.

**코드**

[미완료 요청 소유](https://github.com/Pubburi/Frontend/blob/main/src/state/preferenceWrites.ts) · [새 GET의 시작 조건과 세션·초안 검사](https://github.com/Pubburi/Frontend/blob/main/src/pages/PreferencesPage.tsx) · [인증 캐시 초기화](https://github.com/Pubburi/Frontend/blob/main/src/pages/AccountPages.tsx)

```ts
import { create } from 'zustand'

interface PreferenceWrites {
  owners: Map<string, symbol>
  begin: (userId: string) => symbol | null
  finish: (userId: string, owner: symbol) => void
}
// HTTP writes may still finish after logout clears the account query/mutation cache.
// Keep only transient ownership here; never store preferences or credentials.
export const usePreferenceWrites = create<PreferenceWrites>((set, get) => ({
  owners: new Map(),
  begin(userId) {
    if (get().owners.has(userId)) return null
    const owner = Symbol()
    set({ owners: new Map(get().owners).set(userId, owner) })
    return owner
  },
  finish(userId, owner) {
    if (get().owners.get(userId) !== owner) return
    const next = new Map(get().owners)
    next.delete(userId)
    set({ owners: next })
  },
}))
```

```tsx
  const pending = usePreferenceWrites((state) => state.owners.has(user.id))
  const [initial, setInitial] = useState<ExplicitPreferences | null>(null)
  const query = useQuery({
    queryKey: preferenceQueryKey(user.id),
    queryFn: api.ownPreferences,
    enabled: !initial && !pending,
    refetchOnReconnect: false,
  })
  useEffect(() => {
    if (!initial && !pending && query.isSuccess && !query.isFetching)
      setInitial(query.data)
  }, [initial, pending, query.data, query.isSuccess, query.isFetching])
```

```tsx
  const sameSession = () => client.getQueryData(['session']) === user
  async function save(surveyStatus: SurveyStatus) {
    const submitted = draft
    let payload: ExplicitPreferences
    try {
      payload =
        surveyStatus === 'COMPLETED'
          ? buildPreferencePayload(submitted)
          : emptyPreferences(surveyStatus)
    } catch (error) {
      ui.error(error)
      return
    }
    const owner = usePreferenceWrites.getState().begin(user.id)
    if (!owner) return
    ui.clear()
    try {
      const saved = await api.replaceOwnPreferences(payload)
      if (!sameSession()) return
      client.setQueryData(preferenceQueryKey(user.id), saved)
      if (!mounted.current) return
      setDraft((current) =>
        current === submitted ? preferencesToDraft(saved) : current,
      )
      setConfirm(null)
      ui.status(
        surveyStatus === 'COMPLETED'
          ? '취향이 저장되었습니다.'
          : surveyStatus === 'SKIPPED'
            ? '설문을 건너뛰었습니다.'
            : '취향 입력을 초기화했습니다.',
      )
    } catch (error) {
      if (!sameSession()) return
      if (error instanceof ApiClientError && error.status === 401) {
        client.removeQueries({ queryKey: ['account', user.id] })
        client.setQueryData(['session'], null)
      }
      if (mounted.current) ui.error(error)
    } finally {
      usePreferenceWrites.getState().finish(user.id, owner)
    }
  }
```

<a id="technology"></a>

## ⚙️ 기술 스택

| 영역 | 현재 기술 |
|---|---|
| 화면 | React 19, TypeScript, 로컬 CSS primitive |
| 상태·라우팅 | TanStack Query 5, Zustand 5, React Router 7 |
| 빌드 | Vite 6, Node.js 24, npm lockfile |
| 테스트 | TypeScript strict, Vitest, jsdom, Playwright Chromium |
| 이미지 | WebP, sharp 기반 최적화 스크립트 |
| CI | GitHub Actions · frontend-ci |

<a id="architecture"></a>

## 🏛️ 시스템 구조

~~~mermaid
flowchart LR
    Views["React 화면 · 공통 UI"] --> Stores["React Router · Query · Zustand"]
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
npm ci
npx playwright install chromium
npm run check
~~~

브라우저는 처음 한 번 준비합니다. 검증 범위와 CI 실행 절차는 [테스트·CI 안내](docs/TESTING.md)를 따릅니다.

main은 PR·frontend-ci 성공·최신 main 반영·대화 해결을 요구합니다. 필수 승인은 0명이고 관리자에게도 적용합니다. Squash merge 뒤 작업 브랜치를 정리합니다.

자동화 PR은 최신 커밋의 Codex 리뷰와 관련 검증까지 통과해야 병합합니다. [프론트 개발·운영 기준](AGENTS.md)을 함께 적용합니다.

<a id="roadmap"></a>

## 🗺️ 개발 계획

- [x] [의존성 보안 경고 검토·수정 및 CI 검사](docs/DEPENDENCIES.md)
- [x] Vite·React·TypeScript·React Router·TanStack Query·Zustand로 실제 라우트 이전
- [x] 고객·관리자 화면과 상태·세션·장바구니·API 호출을 React 구조로 이전
- [x] 기존 API·세션·저장 형식·CSS·정적 자산 유지 및 fixture 사용자 흐름 검증
- [x] Vue 전용 테스트를 React 상태/계약 검증으로 전환하고 typecheck·CI·문서 갱신
- [ ] 실제 Backend 통합·인수와 전체 기능 동등성 최종 확인
- [x] 본인 명시취향 입력·수정·건너뛰기와 저장 API 연결
- [ ] 취향과 기본/맞춤 추천 연결·추천 이유·피드백·검색 필터·찜 화면 구현

기한은 **2027년 2월 5일**이며 P1·P2 모두 필수 목표입니다. 승인된 기획과 [프론트 작업 기준](AGENTS.md)에 따라 진행하고, 실제 완성 화면을 검증한 뒤 이미지를 추가합니다.
