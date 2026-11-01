import { QueryClient, useQuery } from '@tanstack/react-query'
import { api, ApiClientError } from './services/api'
import type { User } from './types'
import { profilePrivacy } from './state/profilePrivacy'

export const createQueryClient = () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  })
  profilePrivacy(client)
  return client
}
export async function readSession(): Promise<User | null> {
  try {
    return await api.me()
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) return null
    throw error
  }
}
export const useSession = () =>
  useQuery({ queryKey: ['session'], queryFn: readSession, staleTime: Infinity })
export function safeRedirect(value: string | null) {
  return value?.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes(String.fromCharCode(92))
    ? value
    : '/profile'
}
