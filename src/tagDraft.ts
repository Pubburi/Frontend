export type TagStatus = 'unknown' | 'empty' | 'tags'
export interface TagDraft {
  status: TagStatus
  values: string[]
}
export const readTagDraft = (values: string[] | null): TagDraft => ({
  status: values === null ? 'unknown' : values.length ? 'tags' : 'empty',
  values: values ? [...values] : [],
})
export function buildTags(draft: TagDraft, label: string): string[] | null {
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
