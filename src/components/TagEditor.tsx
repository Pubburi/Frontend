import { useEffect, useRef } from 'react'
import type { TagDraft, TagStatus } from '../tagDraft'

export function TagEditor({
  label,
  value,
  onChange,
  unknownLabel = '미확인',
  emptyLabel = '검수 완료 · 선언할 태그 없음',
  tagsLabel = '확인한 태그 입력',
  optional = false,
  maxLength = 40,
  help = '항목별로 최대 20개·각 40자. 대소문자만 다른 중복도 사용할 수 없습니다.',
}: {
  label: string
  value: TagDraft
  onChange: (value: TagDraft) => void
  unknownLabel?: string
  emptyLabel?: string
  tagsLabel?: string
  optional?: boolean
  maxLength?: number
  help?: string
}) {
  const inputs = useRef<(HTMLTextAreaElement | null)[]>([])
  const add = useRef<HTMLButtonElement>(null)
  const focus = useRef<number | null>(null)
  useEffect(() => {
    if (focus.current === null) return
    const index = Math.min(focus.current, value.values.length - 1)
    focus.current = null
    const target = inputs.current[index] ?? add.current
    target?.focus()
  }, [value.values])
  return (
    <fieldset className="feature-tags">
      <legend>{label}</legend>
      {!optional && <label className="field-group">
        <span>확인 상태</span>
        <select
          className="form-select"
          aria-label={`${label} 확인 상태`}
          value={value.status}
          onChange={(e) =>
            onChange({
              ...value,
              status: e.target.value as TagStatus,
              values:
                e.target.value === 'tags' && !value.values.length
                  ? ['']
                  : value.values,
            })
          }
        >
          <option value="unknown">{unknownLabel}</option>
          <option value="empty">{emptyLabel}</option>
          <option value="tags">{tagsLabel}</option>
        </select>
      </label>}
      {(optional || value.status === 'tags') && (
        <div className="feature-tag-items">
          {value.values.map((tag, index) => (
            <div className="feature-tag-item" key={index}>
              <label className="field-group">
                <span>
                  {label} {index + 1}
                </span>
                <textarea
                  className="form-control"
                  aria-label={`${label} ${index + 1}`}
                  required
                  ref={(element) => { inputs.current[index] = element }}
                  maxLength={maxLength}
                  rows={1}
                  value={tag}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      values: value.values.map((current, i) =>
                        i === index ? e.target.value : current,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                aria-label={`${label} ${index + 1} 삭제`}
                onClick={() => {
                  if (optional) focus.current = index
                  onChange({
                    ...value,
                    values: value.values.filter((_, i) => i !== index),
                  })
                }}
              >
                삭제
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-sm btn-outline-dark"
            disabled={value.values.length >= 20}
            ref={add}
            onClick={() => {
              if (optional) focus.current = value.values.length
              onChange({ ...value, values: [...value.values, ''] })
            }}
          >
            {label} 추가
          </button>
          <small>{help}</small>
        </div>
      )}
    </fieldset>
  )
}
