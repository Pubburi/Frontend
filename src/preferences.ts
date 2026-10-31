import { categories } from './catalog'
import { buildTags, readTagDraft, type TagDraft } from './tagDraft'
import type { ExplicitPreferences, SurveyStatus } from './types'

export interface PreferenceDraft {
  categories: TagDraft
  taste: TagDraft
  aroma: TagDraft
  targetAbvPercent: string
  minPriceKrw: string
  maxPriceKrw: string
  minAbvPercent: string
  maxAbvPercent: string
}
export const preferenceQueryKey = (userId: string) =>
  ['account', userId, 'preferences'] as const
export const emptyPreferences = (
  surveyStatus: SurveyStatus,
): ExplicitPreferences => ({
  surveyStatus,
  softPreferences: {
    categories: null,
    tasteTags: null,
    aromaTags: null,
    targetAbvPercent: null,
  },
  hardConstraints: {
    minPriceKrw: null,
    maxPriceKrw: null,
    minAbvPercent: null,
    maxAbvPercent: null,
  },
})
const text = (value: number | null) => (value === null ? '' : String(value))
export function preferencesToDraft(
  value: ExplicitPreferences,
): PreferenceDraft {
  return {
    categories: readTagDraft(value.softPreferences.categories),
    taste: readTagDraft(value.softPreferences.tasteTags),
    aroma: readTagDraft(value.softPreferences.aromaTags),
    targetAbvPercent: text(value.softPreferences.targetAbvPercent),
    minPriceKrw: text(value.hardConstraints.minPriceKrw),
    maxPriceKrw: text(value.hardConstraints.maxPriceKrw),
    minAbvPercent: text(value.hardConstraints.minAbvPercent),
    maxAbvPercent: text(value.hardConstraints.maxAbvPercent),
  }
}
function number(value: string, label: string, price = false): number | null {
  const input = value.trim()
  if (!input) return null
  if (
    !(price ? /^\d+$/ : /^\d+(?:\.\d{1,2})?$/).test(input) ||
    Number(input) > (price ? 2_147_483_647 : 100)
  )
    throw new Error(
      `${label}은 ${price ? '0~2,147,483,647의 정수' : '0~100 사이, 소수 둘째 자리까지'}로 입력해 주세요.`,
    )
  return Number(input)
}
export function buildPreferencePayload(
  draft: PreferenceDraft,
): ExplicitPreferences {
  let selected: string[] | null =
    draft.categories.status === 'unknown' ? null : []
  if (draft.categories.status === 'tags') {
    selected = [...draft.categories.values]
    if (
      !selected.length ||
      selected.length > 8 ||
      new Set(selected).size !== selected.length ||
      selected.some(
        (value) => !categories.some((category) => category.label === value),
      )
    )
      throw new Error(
        '선호하는 주종을 선택하거나 특별한 선호 없음으로 바꿔 주세요.',
      )
  }
  const hardConstraints = {
    minPriceKrw: number(draft.minPriceKrw, '최소 가격', true),
    maxPriceKrw: number(draft.maxPriceKrw, '최대 가격', true),
    minAbvPercent: number(draft.minAbvPercent, '최소 도수'),
    maxAbvPercent: number(draft.maxAbvPercent, '최대 도수'),
  }
  if (
    (hardConstraints.minPriceKrw !== null &&
      hardConstraints.maxPriceKrw !== null &&
      hardConstraints.minPriceKrw > hardConstraints.maxPriceKrw) ||
    (hardConstraints.minAbvPercent !== null &&
      hardConstraints.maxAbvPercent !== null &&
      hardConstraints.minAbvPercent > hardConstraints.maxAbvPercent)
  )
    throw new Error('반드시 지킬 범위의 최소값은 최대값보다 클 수 없습니다.')
  return {
    surveyStatus: 'COMPLETED',
    softPreferences: {
      categories: selected,
      tasteTags: buildTags(draft.taste, '맛 태그'),
      aromaTags: buildTags(draft.aroma, '향 태그'),
      targetAbvPercent: number(draft.targetAbvPercent, '선호 도수'),
    },
    hardConstraints,
  }
}
