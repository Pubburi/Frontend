import { useEffect, useRef } from 'react'
import { productTagFields, type ProductTags, type ProductTagIssues, type ProductTagKey } from '../productTags'

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
    <p className="muted" id="search-tag-help">등록된 태그와 정확히 일치하는 상품을 찾습니다. 한 행이 한 태그이며 쉼표·줄바꿈도 그 태그의 일부입니다. 지정한 모든 조건을 함께 적용합니다.</p>
    <div className="search-tag-columns">
      {productTagFields.map(({ key, label }) => <fieldset className="search-tag-kind" key={key}>
        <legend>{label} 조건</legend>
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
        <small className="muted">최대 20개·태그별 40자. 조건이 없으면 이 항목으로 제한하지 않습니다.</small>
      </fieldset>)}
    </div>
  </fieldset>
}
