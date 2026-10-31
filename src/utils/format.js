export function productImage(product) {
  if (!product?.img) return '/images/icon/mainIcon.webp'
  const src = product.img.startsWith('/') ? product.img : `/images/pub/${product.img}`
  return webpSource(src) || src
}

export function webpSource(src) {
  if (!src || !/\.(png|jpe?g)$/i.test(src)) return ''
  return src.replace(/\.(png|jpe?g)$/i, '.webp')
}

export function money(value) {
  return Number(value || 0).toLocaleString('ko-KR')
}

export function date(value) {
  return value ? new Date(value).toLocaleString('ko-KR') : ''
}

export const orderTypeLabels = {
  TAKEOUT: '포장 주문',
  ONLINE: '온라인 주문',
  OFFLINE: '매장 주문',
}

export function orderType(value) {
  return orderTypeLabels[value] || value || '-'
}

export function orderTotal(order) {
  return (order?.details || []).reduce((sum, detail) => sum + Number(detail.sumPrice || detail.unitPrice * detail.quantity || 0), 0)
}
