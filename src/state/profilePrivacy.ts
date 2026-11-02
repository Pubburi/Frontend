import { authReadPrivacy } from './authReadPrivacy'

export type { AuthReadFailure as ProfileFailure } from './authReadPrivacy'

export const profilePrivacy = authReadPrivacy((key, id) =>
  key[0] === 'account' && key[1] === id &&
  ((key[2] === 'profile' && key.length === 3) || (key[2] === 'orders' && key.length === 4)),
)
