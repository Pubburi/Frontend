import { useEffect, useRef } from 'react'
import { normalizeProductTag, productTagFields, type ProductTags, type ProductTagIssues, type ProductTagKey } from '../productTags'
import { aromaTagChoices, tasteTagChoices } from '../tagChoices'

export function SearchTagFields({ values, issues, onChange, registerInput }: {
  values: ProductTags
  issues: ProductTagIssues
  onChange: (key: ProductTagKey, tags: string[]) => void
  registerInput: (key: ProductTagKey, index: number, element: HTMLTextAreaElement | null) => void
}) {
  const inputs = useRef<Partial<Record<ProductTagKey, (HTMLTextAreaElement | null)[]>>>({})
  const addButtons = useRef<Partial<Record<ProductTagKey, HTMLButtonElement | null>>>({})
  const focusIntent = useRef<{ key: ProductTagKey; index: number } | null>(null)
  useEffect(() => {
    const intent = focusIntent.current
    if (!intent) return
    focusIntent.current = null
    const index = Math.min(intent.index, values[intent.key].length - 1)
    const target = inputs.current[intent.key]?.[index] ?? addButtons.current[intent.key]
    target?.focus()
  }, [values.tasteTag, values.aromaTag])
  return <fieldset className="search-tag-group">
    <legend>맛·향 태그 조건</legend>
    <p className="muted" id="search-tag-help">목록에서 고르거나 원하는 조건을 추가하세요. 고른 맛과 향을 모두 확인할 수 있는 상품만 표시합니다.</p>
    <div className="search-tag-columns">
      {productTagFields.map(({ key, label }) => <fieldset className="search-tag-kind" key={key}>
        <legend>{label} 조건</legend>
        <div className="button-row tag-choice-row">
          {(key === 'tasteTag' ? tasteTagChoices : aromaTagChoices).map((choice) => {
            const selected = values[key].some((tag) => normalizeProductTag(tag) === choice.value)
            return <button key={choice.value} type="button" aria-pressed={selected}
              className={`btn btn-sm ${selected ? 'btn-dark' : 'btn-outline-dark'}`}
              disabled={!selected && values[key].length >= 20}
              onClick={() => onChange(key, selected
                ? values[key].filter((tag) => normalizeProductTag(tag) !== choice.value)
                : [...values[key], choice.value])}>{choice.label}</button>
          })}
        </div>
        {values[key].map((tag, index) => {
          const error = issues[key]?.index === index ? issues[key]?.message : undefined
          return <div className="search-tag-row" key={index}>
            <label className="field-group">
              <span>{label} 태그 조건 {index + 1}</span>
              <textarea className="form-control" rows={2} aria-label={`${label} 태그 조건 ${index + 1}`}
                aria-invalid={error ? true : undefined} aria-describedby={error ? `search-tag-error-${key}` : 'search-tag-help'}
                ref={(element) => {
                  inputs.current[key] ??= []
                  inputs.current[key]![index] = element
                  registerInput(key, index, element)
                }}
                value={tag} onChange={(event) => onChange(key, values[key].map((value, i) => i === index ? event.target.value : value))} />
              {error && <small className="range-field-error" id={`search-tag-error-${key}`}>{error}</small>}
            </label>
            <button type="button" className="btn btn-sm btn-outline-secondary" aria-label={`${label} 태그 조건 ${index + 1} 삭제`}
              onClick={() => { focusIntent.current = { key, index }; onChange(key, values[key].filter((_, i) => i !== index)) }}>삭제</button>
          </div>
        })}
        <button type="button" className="btn btn-sm btn-outline-dark" disabled={values[key].length >= 20}
          ref={(element) => { addButtons.current[key] = element }}
          onClick={() => { focusIntent.current = { key, index: values[key].length }; onChange(key, [...values[key], '']) }}>{label} 조건 추가</button>
        <small className="muted">직접 추가할 때는 한 칸에 한 태그만 넣어 주세요. 최대 20개 · 태그별 40자</small>
      </fieldset>)}
    </div>
  </fieldset>
}
