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

export function PreferenceTagChoices({
  label,
  choices,
  value,
  onChange,
}: {
  label: '맛' | '향'
  choices: readonly { label: string; value: string }[]
  value: TagDraft
  onChange: (value: TagDraft) => void
}) {
  const unknown = useRef<HTMLButtonElement>(null)
  const selected = value.status === 'tags' ? value.values : []
  const token = (tag: string) => tag.trim().toLowerCase()
  const selectedTokens = new Set(selected.map(token))
  const legacy = selected.filter((tag) => !choices.some((choice) => choice.value === token(tag)))

  function select(values: string[]) {
    onChange({ status: values.length ? 'tags' : 'empty', values })
  }

  return (
    <fieldset className="feature-tags preference-tag-choices">
      <legend>선호하는 {label}</legend>
      <div className="button-row">
        {choices.map((choice) => {
          const pressed = selectedTokens.has(choice.value)
          return (
            <button
              key={choice.value}
              type="button"
              className={`btn ${pressed ? 'btn-dark' : 'btn-outline-dark'}`}
              aria-pressed={pressed}
              disabled={!pressed && selected.length >= 20}
              onClick={() => select(pressed
                ? selected.filter((tag) => token(tag) !== choice.value)
                : [...selected, choice.value])}
            >
              {choice.label}
            </button>
          )
        })}
        <button type="button" ref={unknown}
          className={`btn ${value.status === 'unknown' ? 'btn-dark' : 'btn-outline-dark'}`}
          aria-pressed={value.status === 'unknown'}
          onClick={() => onChange({ status: 'unknown', values: [] })}
        >
          아직 모르겠어요
        </button>
        <button type="button"
          className={`btn ${value.status === 'empty' ? 'btn-dark' : 'btn-outline-dark'}`}
          aria-pressed={value.status === 'empty'}
          onClick={() => select([])}
        >
          특별히 선호하는 {label} 없음
        </button>
      </div>
      {legacy.length > 0 && (
        <div className="preference-legacy-tags">
          <p className="muted">이전에 저장한 {label}입니다. 그대로 쓰거나 삭제할 수 있어요.</p>
          <div className="button-row">
            {legacy.map((tag) => (
              <button key={tag} type="button" className="btn btn-outline-dark"
                aria-label={`이전에 저장한 ${label} ${tag} 삭제`}
                onClick={() => {
                  select(selected.filter((current) => current !== tag))
                  unknown.current?.focus()
                }}
              >
                <span>{tag}</span> <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </fieldset>
  )
}
