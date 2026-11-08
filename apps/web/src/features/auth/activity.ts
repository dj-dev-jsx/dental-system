import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'

/** One line of the caller's own account activity, as GET /auth/my-activity returns it. */
export type MyActivity = {
  id: string
  action: 'LOGIN_SUCCEEDED' | 'LOGIN_FAILED' | 'PASSWORD_CHANGED'
  createdAt: string
  /** For a failed sign-in, why. */
  reason: string | null
}

/** The last ten sign-ins, failed attempts and password changes on your own account. */
export function useMyActivity() {
  return useQuery({
    queryKey: ['my-activity'],
    queryFn: () => api<{ items: MyActivity[] }>('/auth/my-activity'),
    // Always fresh: this is the page you check to see whether someone else used your account.
    staleTime: 0,
  })
}
