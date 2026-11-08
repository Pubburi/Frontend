import { describe, expect, it } from 'vitest'
import { checkedNotifications, checkedNotificationReads } from './notifications'

const id = '00000000-0000-0000-0000-000000000001'
const item = { id, type: 'REVIEW_REMOVED', createdAt: 1000, readAt: null, orderId: null, productId: 7, productName: '원문 <상품>', targetAvailable: false }
const page = { items: [item], page: 1, size: 20, total: 1, totalPages: 1, hasNext: false, unreadCount: 1 }
describe('notification display contract', () => {
  it('preserves unread null and removed target snapshots without inventing a link', () => {
    expect(checkedNotifications(page, 1, 20).items[0]).toEqual(item)
    expect(checkedNotifications({ ...page, items: [{ ...item, type: 'ORDER_COMPLETED', orderId: 4, productId: null, productName: null, readAt: 0 }], unreadCount: 0 }, 1, 20).items[0].readAt).toBe(0)
  })
  it('rejects contradictory targets, duplicate identities and unknown event shapes', () => {
    for (const items of [[item, item], [{ ...item, type: 'OTHER' }], [{ ...item, productId: null }], [{ ...item, orderId: 4 }], [{ ...item, targetAvailable: undefined }], [{ ...item, readAt: -1 }], [{ ...item, id: '../orders/1' }]])
      expect(() => checkedNotifications({ ...page, items }, 1, 20)).toThrow()
  })
  it('never turns malformed pagination/counts into an empty success', () => {
    for (const value of [{ ...page, unreadCount: 2 }, { ...page, totalPages: 0 }, { ...page, page: 2 }, { ...page, hasNext: true }, { ...page, total: -1 }, { ...page, size: 10 }, { ...page, extra: true }])
      expect(() => checkedNotifications(value, 1, 20)).toThrow()
    expect(checkedNotifications({ ...page, items: [], page: 2 }, 2, 20).items).toEqual([])
  })
  it('requires every requested read receipt, no partial or foreign success', () => {
    checkedNotificationReads({ items: [{ id, readAt: 1000 }], unreadCount: 0 }, [id])
    for (const value of [{ items: [], unreadCount: 0 }, { items: [{ id: 'other', readAt: 1000 }], unreadCount: 0 }, { items: [{ id, readAt: null }], unreadCount: 0 }, { items: [{ id, readAt: 1 }], unreadCount: -1 }])
      expect(() => checkedNotificationReads(value, [id])).toThrow()
  })
})
