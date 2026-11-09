import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isSignedOut, type Me, portalApi } from './api'

// The patient's session, kept apart from the staff one (features/auth/authStore is staff only).
// The cookie is httpOnly and separate from staff, so "who is signed in"
// is simply GET /portal/me: a Me, or null when nobody is.

export const meKey = () => ['portal', 'me'] as const
export const appointmentsKey = () => ['portal', 'appointments'] as const

export function useSession() {
  return useQuery({
    queryKey: meKey(),
    queryFn: async (): Promise<Me | null> => {
      try {
        return await portalApi.me()
      } catch (error) {
        if (isSignedOut(error)) return null
        throw error
      }
    },
    staleTime: 5 * 60_000,
  })
}

/** Signs in and loads who that is. Throws the ApiError, so the form can say why it failed. */
export function useSignIn() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      await portalApi.login(email, password)
      return portalApi.me()
    },
    onSuccess: (me) => {
      queryClient.setQueryData(meKey(), me)
      void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
    },
  })
}

/** Marks the session as ended, such as after a 401 from a signed-in route. */
export function useForgetSession() {
  const queryClient = useQueryClient()
  return () => queryClient.setQueryData(meKey(), null)
}

/**
 * Signs out, then loads the clinic's page fresh, which wipes what the last person had open
 * from memory (phones and computers get shared). Throws only when the server can't be reached.
 */
export async function signOut() {
  try {
    await portalApi.logout()
  } catch (error) {
    if (!isSignedOut(error)) throw error // already signed out is what we wanted
  }
  window.location.replace("/")
}
