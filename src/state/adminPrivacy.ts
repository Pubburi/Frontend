import { authReadPrivacy } from './authReadPrivacy'

export const adminPrivacy = authReadPrivacy((key, id, account) =>
  'role' in account && account.role === 'ADMIN' && key[0] === 'admin' && key[1] === id && key.length === 4 &&
  (key[2] === 'users' || key[2] === 'orders' || key[2] === 'comments'),
)
