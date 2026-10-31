import { date, money, orderType } from '../utils/format'
import type { Order } from '../types'

export function priceBasisLabel(value?: string | null) {
  if (value === 'ORDER_SNAPSHOT') return '주문 당시 금액'
  if (value === 'LEGACY_ESTIMATE') return '과거 주문 추정 금액'
  return '금액 출처 미확인'
}
export function orderMoney(value: number | null | undefined) {
  return value == null ? '금액 미확인' : `${money(value)}원`
}
export function OrderLines({ order }: { order: Order }) {
  return (
    <>
      <div className="order-detail-meta">
        <span>주문 시각 {date(order.orderTime)}</span>
        {order.orderTable && <span>요청: {order.orderTable}</span>}
        <span className="badge">{priceBasisLabel(order.priceBasis)}</span>
      </div>
      <div className="order-items">
        {order.details.map((detail) => (
          <div key={detail.id} className="order-item-line">
            <span>
              {detail.name}
              {detail.productId === null && <small> · 삭제된 상품</small>}{' '}
              {detail.type && `· ${detail.type}`} × {detail.quantity}
            </span>
            <strong>{orderMoney(detail.sumPrice)}</strong>
          </div>
        ))}
      </div>
    </>
  )
}
export function OrderCard({ order }: { order: Order }) {
  return (
    <article className="order-row profile-order-row">
      <div className="order-summary-head">
        <div>
          <span className="eyebrow">Order #{order.oId}</span>
          <strong>{orderType(order.orderType)}</strong>
          <p>
            <span className={`badge ${order.completed !== 'Y' ? 'muted' : ''}`}>
              {order.completed === 'Y' ? '완료' : '진행 중'}
            </span>
            <span className="muted">{date(order.orderTime)}</span>
          </p>
        </div>
        <strong className="order-total">{orderMoney(order.totalPrice)}</strong>
      </div>
      <OrderLines order={order} />
    </article>
  )
}
