import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { api, pageQuery } from '../services/api'
import { money } from '../utils/format'
import { buildProductQuery } from '../utils/productFilters'

type Suggestion = { id: number; name: string; type: string; price: number }
type Edit = { value: string; view: string }

function readSuggestions(value: unknown): Suggestion[] {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 1 ||
    !('items' in value) || !Array.isArray(value.items) || value.items.length > 8) {
    throw new Error('상품명 제안 응답을 확인하지 못했습니다.')
  }
  const ids = new Set<number>()
  for (const item of value.items) {
    if (!item || typeof item !== 'object' || Object.keys(item).length !== 4 ||
      !Number.isInteger(item.id) || item.id < 1 || item.id > 2147483647 || ids.has(item.id) ||
      typeof item.name !== 'string' || !item.name.trim() || typeof item.type !== 'string' || !item.type.trim() ||
      !Number.isInteger(item.price) || item.price < 0 || item.price > 2147483647) {
      throw new Error('상품명 제안 응답을 확인하지 못했습니다.')
    }
    ids.add(item.id)
  }
  return value.items
}

export function HomeProductSearch() {
  const [keyword, setKeyword] = useState('')
  const [edit, setEdit] = useState<Edit | null>(null)
  const [response, setResponse] = useState<{ edit: Edit; items: Suggestion[] } | null>(null)
  const [active, setActive] = useState(-1)
  const composing = useRef(false)
  const composingEnter = useRef(false)
  const inputId = useId()
  const listId = `${inputId}-products`
  const location = useLocation()
  const navigate = useNavigate()
  const current = edit?.view === location.key ? edit : null
  const items = current && response?.edit === current ? response.items : []
  const highlighted = items[active]
  const optionId = (id: number) => `${listId}-${id}`

  useEffect(() => {
    if (!current) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      try {
        const items = readSuggestions(await api.productSuggestions(current.value, controller.signal))
        if (!controller.signal.aborted) setResponse({ edit: current, items })
      } catch {
        // The separate free-text search remains available even if suggestions fail.
      }
    }, 200)
    return () => { window.clearTimeout(timer); controller.abort() }
  }, [current])

  function editKeyword(value: string) {
    const length = [...value.trim().normalize('NFC')].length
    setActive(-1)
    setEdit(!composing.current && length >= 2 && length <= 100 ? { value, view: location.key } : null)
  }

  function close() {
    setEdit(null)
    setActive(-1)
  }

  function choose(item: Suggestion) {
    close()
    navigate(`/products/${item.id}`)
  }

  function handleKey(event: KeyboardEvent<HTMLInputElement>) {
    const duringComposition = composing.current || event.nativeEvent.isComposing || event.keyCode === 229
    if (event.key === 'Enter') composingEnter.current = duringComposition
    if (duringComposition) return
    if (event.key === 'Escape' && current) {
      event.preventDefault()
      close()
    } else if (event.key === 'Enter' && highlighted) {
      event.preventDefault()
      choose(highlighted)
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!current && event.key === 'ArrowDown') editKeyword(keyword)
      if (!items.length) return
      event.preventDefault()
      const index = event.key === 'ArrowDown' ? Math.min(active + 1, items.length - 1) :
        active === -1 ? items.length - 1 : Math.max(active - 1, 0)
      setActive(index)
      document.getElementById(optionId(items[index].id))?.scrollIntoView({ block: 'nearest' })
    }
  }

  return (
    <form className="inline-field home-search" role="search" aria-label="홈 상품 검색" onSubmit={(event) => {
      event.preventDefault()
      if (composing.current || composingEnter.current) return
      close()
      navigate(`/products?${pageQuery(buildProductQuery({ q: keyword }, 1))}`)
    }}>
      <div className="field-group home-search-field">
        <label htmlFor={inputId}>상품 검색</label>
        <input id={inputId} className="form-control" type="text" inputMode="search" enterKeyHint="search" name="q" maxLength={100}
          placeholder="찾는 상품명을 입력하세요" autoComplete="off" role="combobox" aria-autocomplete="list"
          aria-controls={listId} aria-expanded={items.length > 0} aria-activedescendant={highlighted ? optionId(highlighted.id) : undefined}
          value={keyword} onKeyDown={handleKey} onFocus={() => editKeyword(keyword)}
          onKeyUp={(event) => { if (event.key === 'Enter') composingEnter.current = false }}
          onBlur={() => { composing.current = false; composingEnter.current = false; close() }}
          onChange={(event) => { setKeyword(event.target.value); editKeyword(event.target.value) }}
          onCompositionStart={() => { composing.current = true; close() }}
          onCompositionEnd={(event) => {
            composing.current = false
            setKeyword(event.currentTarget.value)
            if (document.activeElement === event.currentTarget) editKeyword(event.currentTarget.value)
          }} />
        <ul id={listId} className="home-search-suggestions" role="listbox" aria-label="상품 바로가기"
          tabIndex={-1} hidden={items.length === 0}>
          {items.map((item, index) => (
            <li key={item.id} id={optionId(item.id)} role="option" aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item)}>
              <span>{item.name}</span>
              <small>{item.type} · {money(item.price)}원{items.some((other) =>
                other.id !== item.id && other.name === item.name && other.type === item.type && other.price === item.price)
                ? ` · 상품 번호 ${item.id}` : ''}</small>
            </li>
          ))}
        </ul>
      </div>
      <button className="btn btn-dark" type="submit">검색하기</button>
    </form>
  )
}
