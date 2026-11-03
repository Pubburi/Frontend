import { authReadPrivacy } from './authReadPrivacy'

// One detail read belongs to a mounted view and its current session query/account.
export const orderPrivacy = authReadPrivacy((key, id) =>
  key[0] === 'account' && key[1] === id && key[2] === 'order-detail' && key.length === 5,
)
