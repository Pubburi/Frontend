import type { ProductFeatureValues } from './types'

export type TagStatus = 'unknown' | 'empty' | 'tags'
export interface TagDraft {
  status: TagStatus
  values: string[]
}
export interface FeatureDraft {
  volumeMl: string
  description: string
  taste: TagDraft
  aroma: TagDraft
  sourceName: string
  sourceUrl: string
  sourceNote: string
}
const tagDraft = (tags: string[] | null): TagDraft => ({
  status: tags === null ? 'unknown' : tags.length ? 'tags' : 'empty',
  values: tags ? [...tags] : [],
})
export function featuresToDraft(value: ProductFeatureValues): FeatureDraft {
  return {
    volumeMl: value.volumeMl === null ? '' : String(value.volumeMl),
    description: value.description ?? '',
    taste: tagDraft(value.tasteTags),
    aroma: tagDraft(value.aromaTags),
    sourceName: value.sourceName ?? '',
    sourceUrl: value.sourceUrl ?? '',
    sourceNote: value.sourceNote ?? '',
  }
}
export const unknownFeatures = (): ProductFeatureValues => ({
  volumeMl: null,
  description: null,
  tasteTags: null,
  aromaTags: null,
  sourceName: null,
  sourceUrl: null,
  sourceNote: null,
})
export const featureQueryKey = (userId: string, productId: number) =>
  ['admin-product-features', userId, productId] as const
export const featureSaveKey = (userId: string, productId: number) =>
  `admin-product-features-${userId}-${productId}`

function optionalText(text: string, max: number, label: string) {
  const value = text.trim()
  if (value.length > max)
    throw new Error(`${label}은 ${max}자 이내로 입력해 주세요.`)
  return value || null
}
function tags(draft: TagDraft, label: string): string[] | null {
  if (draft.status === 'unknown') return null
  if (draft.status === 'empty') return []
  const values = draft.values.map((tag) => tag.trim())
  if (values.length > 20)
    throw new Error(`${label}는 최대 20개까지 입력해 주세요.`)
  if (
    !values.length ||
    values.some(
      (tag) => !tag || tag.length > 40 || tag.toLowerCase().length > 40,
    )
  )
    throw new Error(`${label}는 항목별로 1~40자로 입력해 주세요.`)
  if (new Set(values.map((tag) => tag.toLowerCase())).size !== values.length)
    throw new Error(`${label}에서 대소문자·공백을 제외한 중복을 제거해 주세요.`)
  return values
}
export function buildFeaturePayload(draft: FeatureDraft): ProductFeatureValues {
  const volume = draft.volumeMl.trim()
  if (
    volume &&
    (!/^\d+$/.test(volume) || Number(volume) < 1 || Number(volume) > 1_000_000)
  )
    throw new Error(
      '용량은 1~1,000,000mL의 정수 또는 미확인으로 입력해 주세요.',
    )
  const payload = {
    volumeMl: volume ? Number(volume) : null,
    description: optionalText(draft.description, 2000, '설명'),
    tasteTags: tags(draft.taste, '맛 태그'),
    aromaTags: tags(draft.aroma, '향 태그'),
    sourceName: optionalText(draft.sourceName, 200, '출처명'),
    sourceUrl: optionalText(draft.sourceUrl, 1000, '출처 URL'),
    sourceNote: optionalText(draft.sourceNote, 1000, '공개 검수 메모'),
  }
  if (
    (payload.volumeMl !== null ||
      payload.description !== null ||
      payload.tasteTags !== null ||
      payload.aromaTags !== null) &&
    !payload.sourceName
  )
    throw new Error('확인한 특성이나 검수 완료 태그에는 출처명이 필요합니다.')
  if (payload.sourceUrl) {
    try {
      const url = new URL(payload.sourceUrl)
      if (
        !/^https?:\/\//i.test(payload.sourceUrl) ||
        /\s/.test(payload.sourceUrl) ||
        !url.hostname ||
        url.username ||
        url.password
      )
        throw new Error('invalid source URL')
    } catch {
      throw new Error(
        '출처 URL은 계정 정보 없는 http 또는 https 주소로 입력해 주세요.',
      )
    }
  }
  return payload
}
