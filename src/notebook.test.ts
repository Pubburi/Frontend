import { describe, expect, it } from 'vitest'
import { checkedNotebookEntry, notebookDraft, notebookPayload } from './notebook'
import type { NotebookEntry } from './types'

const entry: NotebookEntry = { id: '11111111-1111-4111-8111-111111111111', productId: null, productName: '기록 당시 이름', currentProduct: null,
  experience: 'TRIED', rating: 0, tasteTags: [], aromaTags: null, memo: '', version: 2, createdAt: 0, updatedAt: 1 }
describe('private notebook content boundaries', () => {
  it('round trips zero, empty/unknown tags and empty memo without making them missing', () => {
    expect(notebookPayload(notebookDraft(entry))).toEqual({ experience: 'TRIED', rating: 0, tasteTags: [], aromaTags: null, memo: '' })
    expect(notebookPayload(notebookDraft({ ...entry, rating: 4.25, memo: '  내 메모\n' })).memo).toBe('  내 메모\n')
    expect(notebookPayload(notebookDraft({ ...entry, rating: null, memo: null })).rating).toBeNull()
  })
  it('interest never becomes an experience rating or tasted facts', () => {
    const draft = { ...notebookDraft(entry), experience: 'INTERESTED' as const, rating: '4.123', taste: { status: 'tags' as const, values: [''] } }
    expect(notebookPayload(draft)).toEqual({ experience: 'INTERESTED', rating: null, tasteTags: null, aromaTags: null, memo: '' })
  })
  it('uses code points, preserves literal case/order, rejects broken strings and exact duplicates', () => {
    const draft = notebookDraft(entry)
    draft.taste = { status: 'tags', values: ['😀'.repeat(40), ' Dry ', 'dry'] }; draft.memo = '😀'.repeat(2000)
    expect(notebookPayload(draft).tasteTags).toEqual(draft.taste.values)
    expect(notebookPayload(draft).memo).toBe(draft.memo)
    for (const values of [['😀'.repeat(41)], ['a', 'a'], ['\u3000'], ['\ud800'], ['a\0b']])
      expect(() => notebookPayload({ ...draft, taste: { status: 'tags', values } })).toThrow()
    expect(() => notebookPayload({ ...draft, memo: '😀'.repeat(2001) })).toThrow()
    expect(() => notebookPayload({ ...draft, rating: '5.01' })).toThrow()
    expect(() => notebookPayload({ ...draft, rating: '1.001' })).toThrow()
  })
  it('rejects a response for another record/product and an unusable revision', () => {
    expect(checkedNotebookEntry(entry, { id: entry.id })).toBe(entry)
    expect(checkedNotebookEntry(null, { productId: 7 })).toBeNull()
    expect(() => checkedNotebookEntry(entry, { productId: 7 })).toThrow()
    expect(() => checkedNotebookEntry(null, { id: entry.id })).toThrow()
    expect(() => checkedNotebookEntry({ ...entry, version: -1 })).toThrow()
  })
})
