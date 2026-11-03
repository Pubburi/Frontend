// Passwords are literal UTF-16 strings, as in the existing provider contract.
export function validPassword(value: string) { return value.length >= 4 && validAccountName(value) && new TextEncoder().encode(value).byteLength <= 72 }
export function validAccountName(value: string) { return value.length <= 100 && /[^\u0009-\u000d\u001c-\u0020\u1680\u2000-\u2006\u2008-\u200a\u2028\u2029\u205f\u3000]/u.test(value) }

export const validCurrentPassword = validAccountName
