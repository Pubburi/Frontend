import { describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { ApiClientError } from '../services/api'
import { searchPhrasePrivacy } from './authReadPrivacy'

describe('search phrase unauthorized request ownership', () => {
  it('retains the actual auth/query401 across manual data but scopes it to one view and optin revision', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['session'], { id: 'member' }); const privacy = searchPhrasePrivacy(client)
    const old = ['account', 'member', 'search-phrases', 1, 1, 'tasteTags']
    await expect(client.fetchQuery({ queryKey: old, queryFn: () => { throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401) } })).rejects.toMatchObject({ status: 401 })
    const failure = privacy.snapshot()[0]; expect(failure.query).toBe(client.getQueryCache().find({ queryKey: old, exact: true }))
    client.setQueryData(old, { source: 'PROVIDER' }); expect(privacy.snapshot()).toContain(failure)
    const current = ['account', 'member', 'search-phrases', 1, 2, 'aromaTags']
    await client.fetchQuery({ queryKey: current, queryFn: async () => ({ source: 'UNAVAILABLE', result: null }) })
    expect(privacy.snapshot().some((entry) => entry.query === client.getQueryCache().find({ queryKey: current, exact: true }))).toBe(false)
    client.clear(); client.setQueryData(['session'], { id: 'member' }); expect(privacy.snapshot()).toEqual([]); client.clear()
  })
  it('does not adopt another account,public read or saved-preference error as this phrase request', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); client.setQueryData(['session'], { id: 'member' }); const privacy = searchPhrasePrivacy(client)
    for (const key of [['account', 'other', 'search-phrases', 1, 1, ''], ['catalog', 'products'], ['account', 'member', 'preferences']])
      await expect(client.fetchQuery({ queryKey: key, queryFn: () => { throw new ApiClientError({ code: 'UNAUTHORIZED' }, 401) } })).rejects.toBeTruthy()
    expect(privacy.snapshot()).toEqual([]); client.clear()
  })
})
