import type { Page } from './types'

export interface Notification {
  id: string
  type: 'ORDER_COMPLETED' | 'REVIEW_REMOVED'
  createdAt: number
  readAt: number | null
  orderId: number | null
  productId: number | null
  productName: string | null
  targetAvailable: boolean
}
export interface NotificationPage extends Page<Notification> { unreadCount: number }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
function need(value: unknown): asserts value { if (!value) throw new Error('알림 응답을 확인하지 못했습니다.') }
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const time = (value: unknown): value is number => count(value) && value <= 8640000000000000
const id = (value: unknown) => count(value) && value > 0 && value <= 2147483647
export function checkedNotifications(value: unknown, page: number, size: number): NotificationPage {
  need(object(value) && Object.keys(value).length === 7 && value.page === page && value.size === size && count(value.total) &&
    value.totalPages === Math.ceil(value.total / size) && value.hasNext === (page < Number(value.totalPages)) &&
    count(value.unreadCount) && value.unreadCount <= value.total && Array.isArray(value.items) && value.items.length <= size && value.items.length <= value.total)
  const ids = new Set<string>()
  for (const item of value.items) {
    need(object(item) && Object.keys(item).length === 8 && typeof item.id === 'string' && uuid.test(item.id) && !ids.has(item.id) &&
      time(item.createdAt) && (item.readAt === null || time(item.readAt)) && typeof item.targetAvailable === 'boolean')
    need(item.type === 'ORDER_COMPLETED' ? id(item.orderId) && item.productId === null && item.productName === null :
      item.type === 'REVIEW_REMOVED' && item.orderId === null && id(item.productId) && typeof item.productName === 'string' && !!item.productName.trim())
    ids.add(item.id)
  }
  return value as unknown as NotificationPage
}
export function checkedNotificationReads(value: unknown, expected: string[]) {
  need(object(value) && Object.keys(value).length === 2 && count(value.unreadCount) && Array.isArray(value.items) && value.items.length === expected.length)
  const ids = new Set(expected)
  need(ids.size === expected.length)
  for (const item of value.items) {
    need(object(item) && Object.keys(item).length === 2 && typeof item.id === 'string' && ids.delete(item.id) && time(item.readAt))
  }
  need(ids.size === 0)
}
