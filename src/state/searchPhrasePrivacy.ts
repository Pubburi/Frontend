import { authReadPrivacy } from './authReadPrivacy'

export const searchPhrasePrivacy = authReadPrivacy((key, id) =>
  key[0] === 'account' && key[1] === id && key[2] === 'search-phrases' && key.length === 6,
)
