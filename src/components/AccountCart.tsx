import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAccountCart } from '../state/accountCart'
import { useCart, cartTotals } from '../state/cart'
import type { AccountCartItem } from '../types'
import { money } from '../utils/format'
import { Confirm, Empty } from './ui'
import { CartRecommendations } from './CartRecommendations'
import './purchase-journey.css'

type Account = ReturnType<typeof useAccountCart>
function AccountLine({ item, account }: { item: AccountCartItem; account: Account }) {
  const draft = account.drafts[item.productId] ?? String(item.quantity)
  const valid = /^\d+$/.test(draft) && Number(draft) >= 1 && Number(draft) <= 99
  const unavailable = account.pending || account.loading || account.blocked || !!account.operation
  const changed = Number(draft) !== item.quantity
  function save(event: FormEvent) {
    event.preventDefault()
    if (valid && !unavailable && changed) void account.quantity(item.productId, Number(draft))
  }
  return <article className="account-cart-row settings-card">
    <div className="purchase-item-name">
      {item.currentProduct && <span className="product-type">{item.currentProduct.type}</span>}
      <h3>{item.currentProduct ? <Link to={`/products/${item.productId}`}>{item.currentProduct.name}</Link> : item.productName}</h3>
      <p className="muted">{item.currentProduct ? `현재 병당 ${money(item.currentProduct.price)}원` : '삭제된 상품입니다. 주문하려면 이 항목을 제거해 주세요.'}</p>
    </div>
    <form onSubmit={save} className="account-cart-quantity">
      <label className="field-group"><span>수량</span><input className="form-control" type="number" min={1} max={99} step={1} aria-label={`${item.productName} 수량`} value={draft} disabled={account.pending} onChange={(event) => account.draft(item.productId, event.target.value)} /></label>
      <button className={`btn ${changed && valid ? 'btn-dark' : 'btn-outline-dark'} btn-sm`} disabled={!valid || unavailable || !changed}>수량 저장</button>
    </form>
    <div className="purchase-item-total">
      <strong>{item.currentProduct ? `${money(item.currentProduct.price * item.quantity)}원` : '금액 미확인'}</strong>
      <p className="muted">저장 수량 {item.quantity}개</p>
      <button className="text-button danger-text" disabled={unavailable} aria-label={`${item.productName} 계정에서 삭제`} onClick={() => void account.remove(item.productId)}>삭제</button>
    </div>
  </article>
}
export function AccountCartView({ account }: { account: Account }) {
  const guest = useCart(), location = useLocation(), navigate = useNavigate()
  const currentLocation = useRef(location.key), mounted = useRef(false)
  currentLocation.current = location.key
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const [clearing, setClearing] = useState<Account['scope']>(null)
  const data = account.ready && !account.error && !account.loading ? account.data : null
  const unavailable = !account.ready || account.pending || account.loading || account.blocked || !!account.operation
  const missing = data?.items.some((item) => item.currentProduct === null)
  const unsaved = data?.items.some((item) => Number(account.drafts[item.productId] ?? item.quantity) !== item.quantity)
  const total = data && !missing ? data.items.reduce((sum, item) => sum + item.currentProduct!.price * item.quantity, 0) : null
  const count = data?.items.reduce((sum, item) => sum + item.quantity, 0)
  const deviceCount = cartTotals(guest.items).count
  const requestLength = Array.from(guest.orderForm.orderTable).length
  const checkoutBlocked = unavailable || missing || unsaved || requestLength > 20
  async function checkout(retry = false) {
    const submittedLocation = location.key
    const id = await (retry ? account.retry() : account.checkout())
    if (id !== null && mounted.current && currentLocation.current === submittedLocation) navigate(`/orders/${id}`)
  }
  return <section className="view cart-view">
    <div className="shop-intro compact-intro purchase-intro">
      <div><p className="section-kicker">계정 장바구니</p><h1>장바구니</h1><p>담은 상품을 확인하고 데모 주문을 접수하세요.</p></div>
      {count !== undefined && <span className="purchase-chip">계정에 담은 상품 {count}개</span>}
    </div>
    {account.error && <p className="notice error" role="alert">{account.error}</p>}
    {!account.ready && <div role="status"><p>로그인 상태 확인 전에는 계정 장바구니를 표시하지 않습니다.</p><button className="btn btn-outline-dark" onClick={() => void account.recheck()}>장바구니 로그인 상태 다시 확인</button></div>}
    {account.ready && <>
      {account.recoveryMessage && <p className="notice success" role="status">{account.recoveryMessage} {account.confirmedOrderId !== null && <Link className="text-link" to={`/orders/${account.confirmedOrderId}`}>확인한 주문 보기</Link>}</p>}
      {account.loading && <p role="status">계정 장바구니를 불러오는 중입니다.</p>}
      {account.pending && <p className="purchase-feedback" role="status">계정 장바구니를 처리 중입니다. 요청 사항은 계속 편집할 수 있어요.</p>}
      {account.operation && !account.pending && <div className="settings-card purchase-recovery">
        <h2>{account.operation.kind === 'merge' ? '기기 병합' : '주문'} 결과를 확인해 주세요</h2>
        <p role="status">{account.resolveRequired ? '이전 작업을 안전하게 확인하거나 닫습니다. 새 상품이나 주문은 전송하지 않습니다.' : account.recoveryOnly ? '이전 로그인에서 보낸 작업의 접수 결과만 조회합니다.' : '같은 작업의 결과만 확인합니다. 중복으로 반영되지 않습니다.'}</p>
        <button className="btn btn-dark" onClick={() => account.resolveRequired ? void account.resolve() : account.operation?.kind === 'checkout' && !account.recoveryOnly ? void checkout(true) : void account.retry()}>{account.resolveRequired ? '이전 작업 안전 종료·결과 확인' : account.recoveryOnly ? '이전 작업 결과 조회' : '같은 작업 결과 확인'}</button>
      </div>}
    </>}
    {!!guest.items.length && <section className="settings-card guest-cart-summary purchase-merge" aria-label="이 기기에 담은 상품">
      <div className="purchase-section-head">
        <div><h2>이 기기에 담은 상품</h2><p>계정에 아직 합치지 않은 {deviceCount}개가 있습니다.</p></div>
        <button className="btn btn-dark" disabled={unavailable || !data} onClick={() => void account.merge()}>기기 상품을 계정에 합치기</button>
      </div>
      <ul>{guest.items.map((item) => <li key={item.product.id}>
        <span>{item.product.name} · {item.quantity}개</span>
        <button className="text-button" aria-label={`${item.product.name} 기기에서 삭제`} onClick={() => guest.remove(item.product.id)}>기기에서 삭제</button>
      </li>)}</ul>
      <details><summary>합치기 조건</summary>
        <p className="muted">같은 상품의 수량을 더하며 성공한 경우에만 기기에서 빠집니다. 상품당 99개·최대 100종을 넘거나 삭제된 상품이 있으면 양쪽을 유지합니다.</p>
      </details>
    </section>}
    {account.ready && <section aria-label={data ? '내 계정 장바구니' : undefined} className="purchase-account-cart">
      <div className="purchase-section-head">
        <h2>내 계정 장바구니</h2>
        <div className="button-row">
          <button className="btn btn-outline-dark" disabled={account.pending || account.loading} onClick={() => void account.load()}>계정 장바구니 새로고침</button>
          {!!data?.items.length && <button className="text-button danger-text" disabled={unavailable} onClick={() => setClearing(account.scope)}>계정 장바구니 비우기</button>}
        </div>
      </div>
      {data && (data.items.length ? <div className="cart-layout">
        <div className="cart-list">{data.items.map((item) => <AccountLine key={item.productId} item={item} account={account} />)}</div>
        <aside className="checkout-card" aria-labelledby="account-checkout-heading">
          <div><p className="section-kicker">시연 주문</p><h2 id="account-checkout-heading">주문 요약</h2></div>
          <dl className="summary-list">
            <div><dt>저장 수량</dt><dd>{count}개</dd></div>
            <div className="summary-total"><dt>주문 예정 금액</dt><dd>{total === null ? '금액 미확인' : `${money(total)}원`}</dd></div>
          </dl>
          <form className="checkout-form" onSubmit={(event) => { event.preventDefault(); if (!checkoutBlocked) void checkout() }}>
            <label className="field-group"><span>주문 방식</span><select className="form-select" aria-label="주문 방식" value={guest.orderForm.orderType} onChange={(event) => guest.setOrderForm({ orderType: event.target.value })}>
              <option value="TAKEOUT">포장 주문</option><option value="ONLINE">온라인 주문</option><option value="OFFLINE">매장 주문</option>
            </select></label>
            <label className="field-group">
              <span>테이블·요청 사항 <small>선택</small></span>
              <input className="form-control" aria-label="테이블·요청 사항" aria-invalid={requestLength > 20} maxLength={40} value={guest.orderForm.orderTable} onChange={(event) => guest.setOrderForm({ orderTable: event.target.value })} />
              <small>{requestLength}/20자 · 공백도 그대로 접수합니다.</small>
            </label>
            {missing && <p className="purchase-feedback" role="status">삭제된 상품을 제거한 뒤 주문해 주세요.</p>}
            {unsaved && <p className="purchase-feedback" role="status">바꾼 수량을 먼저 저장한 뒤 주문해 주세요. 금액은 저장 수량 기준입니다.</p>}
            {requestLength > 20 && <p className="purchase-feedback" role="status">요청 사항을 20자 이내로 줄여 주세요.</p>}
            <button className="btn btn-gold btn-wide" disabled={checkoutBlocked}>{total === null ? '금액 미확인 · 주문할 수 없음' : `${money(total)}원 주문하기`}</button>
            <p className="muted">실제 결제 없이 데모 주문을 접수합니다. 접수된 수량만 장바구니에서 빠집니다.</p>
          </form>
        </aside>
      </div> : <Empty title="계정 장바구니가 비어 있습니다"><Link className="btn btn-dark" to="/products">전체 주류 보기</Link></Empty>)}
    </section>}
    {!!data?.items.length && <CartRecommendations account={account} />}
    {clearing && clearing === account.scope && account.ready && <Confirm title="계정 장바구니를 비울까요?" description="기기에 따로 담은 상품과 접수한 주문은 지우지 않습니다." pending={account.pending}
      onCancel={() => setClearing(null)} onConfirm={() => void account.remove(null).then(() => setClearing(null))} />}
  </section>
}
