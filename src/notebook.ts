import type { NotebookContent, NotebookEntry } from './types'
import { readTagDraft, type TagDraft } from './tagDraft'

export interface NotebookDraft {
  experience: NotebookContent['experience']
  rating: string
  taste: TagDraft
  aroma: TagDraft
  memo: string | null
}
export const notebookDraft = (entry?: NotebookContent | null): NotebookDraft => ({
  experience: entry?.experience ?? 'INTERESTED', rating: entry?.rating == null ? '' : String(entry.rating),
  taste: readTagDraft(entry?.tasteTags ?? null), aroma: readTagDraft(entry?.aromaTags ?? null), memo: entry?.memo ?? null,
})
const codePoints = (value: string) => Array.from(value)
function validText(value: string, max: number) {
  const points = codePoints(value)
  return points.length <= max && !value.includes('\0') && !points.some((point) => point.length === 1 && /[\ud800-\udfff]/.test(point))
}
const nonblank = (value: string) => /[^\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/u.test(value)
function tags(draft: TagDraft, label: string): string[] | null {
  if (draft.status === 'unknown') return null
  if (draft.status === 'empty') return []
  if (!draft.values.length || draft.values.length > 20 || draft.values.some((value) => !nonblank(value) || !validText(value, 40)))
    throw new Error(`${label}는 최대20개·항목별1~40자로 입력해 주세요.`)
  if (new Set(draft.values).size !== draft.values.length) throw new Error(`${label}에서 같은 태그의 중복을 지워 주세요.`)
  return [...draft.values]
}
export function checkedNotebookEntry(value: NotebookEntry | null, expected: { id?: string; productId?: number } = {}) {
  if (value === null && !expected.id) return null
  if (!value || typeof value !== 'object' || typeof value.id !== 'string' ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.id) ||
      !Number.isSafeInteger(value.version) || value.version < 0 ||
      (value.productId !== null && (!Number.isSafeInteger(value.productId) || value.productId <= 0)) ||
      (expected.id !== undefined && value.id !== expected.id) ||
      (expected.productId !== undefined && value.productId !== expected.productId) ||
      (value.experience !== 'TRIED' && value.experience !== 'INTERESTED') ||
      typeof value.productName !== 'string' || (value.memo !== null && typeof value.memo !== 'string') ||
      (value.rating !== null && (typeof value.rating !== 'number' || !Number.isFinite(value.rating) || value.rating < 0 || value.rating > 5)) ||
      [value.tasteTags, value.aromaTags].some((tags) => tags !== null && (!Array.isArray(tags) || tags.some((tag) => typeof tag !== 'string'))) ||
      (value.currentProduct !== null && value.currentProduct?.id !== value.productId) ||
      (value.experience === 'INTERESTED' && [value.rating, value.tasteTags, value.aromaTags].some((value) => value !== null))) throw new Error('내 취향 기록 응답을 확인하지 못했습니다.')
  return value
}
export function notebookPayload(draft: NotebookDraft): NotebookContent {
  if (draft.memo !== null && !validText(draft.memo, 2000)) throw new Error('메모는 최대2000자로 입력해 주세요.')
  if (draft.experience === 'INTERESTED') return { experience: 'INTERESTED', rating: null, tasteTags: null, aromaTags: null, memo: draft.memo }
  const rating = draft.rating.trim()
  if (rating && (!/^\d+(?:\.\d{1,2})?$/.test(rating) || Number(rating) > 5)) throw new Error('평점은0~5점·소수 둘째 자리까지 입력하거나 비워 주세요.')
  return { experience: 'TRIED', rating: rating ? Number(rating) : null, tasteTags: tags(draft.taste, '맛 태그'), aromaTags: tags(draft.aroma, '향 태그'), memo: draft.memo }
}
