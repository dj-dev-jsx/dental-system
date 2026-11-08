import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { api, ApiError, setSessionEndedHandler } from '../../lib/api'

export type StaffRole = 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'ASSISTANT'

/** The logged-in staff member, as GET /auth/me returns them. */
export type StaffUser = {
  id: string
  clinicId: string
  clinicName: string
  email: string
  firstName: string
  lastName: string
  role: StaffRole
  /** True after an admin created or reset the account: a new password must be chosen first. */
  mustChangePassword: boolean
}

export const ROLE_LABELS: Record<StaffRole, string> = {
  ADMIN: 'Admin',
  DENTIST: 'Dentist',
  RECEPTIONIST: 'Receptionist',
  ASSISTANT: 'Assistant',
}

// One of these at a time, so the screen can never show "signed in" and "signed out" together.
export type AuthState =
  | { status: 'checking' }
  | { status: 'unreachable' }
  | { status: 'signedOut'; notice?: string }
  | { status: 'signedIn'; user: StaffUser }

type AuthStore = {
  state: AuthState
  /** Asks the API who is logged in, using the cookie the browser already has. */
  checkSession: () => Promise<void>
  /** Throws an ApiError when the login fails, so the form can say why. */
  signIn: (email: string, password: string) => Promise<void>
  /** Throws when the server can't be reached, so the user knows they're still signed in. */
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>()((set) => ({
  state: { status: 'checking' },

  async checkSession() {
    set({ state: { status: 'checking' } })
    try {
      const user = await api<StaffUser>('/auth/me')
      set({ state: { status: 'signedIn', user } })
    } catch (error) {
      const signedOut = error instanceof ApiError && error.status === 401
      set({ state: signedOut ? { status: 'signedOut' } : { status: 'unreachable' } })
    }
  },

  async signIn(email, password) {
    await api('/auth/login', { method: 'POST', json: { email, password } })
    const user = await api<StaffUser>('/auth/me')
    set({ state: { status: 'signedIn', user } })
  },

  async signOut() {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (error) {
      // 401 means the session had already ended, which is what we wanted anyway.
      if (!(error instanceof ApiError && error.status === 401)) throw error
    }
    // Loading a fresh page wipes everything the last person had open from memory, which
    // matters on a shared front-desk computer.
    window.location.replace('/sign-in')
  },
}))

/**
 * Handed down by the /app route (App.tsx) to everything inside the staff area. Passing it
 * down, rather than each screen reading the store, means a screen never renders without
 * a user, even in the moment a session ends and the app is switching to the sign-in page.
 */
export const StaffUserContext = createContext<StaffUser | null>(null)

/** The signed-in staff member, for screens inside the staff area. */
export function useStaffUser(): StaffUser {
  const user = useContext(StaffUserContext)
  if (!user) throw new Error('useStaffUser can only be used inside the staff area')
  return user
}

setSessionEndedHandler(() =>
  useAuthStore.setState({
    state: { status: 'signedOut', notice: 'Your session ended. Sign in again to continue.' },
  }),
)
