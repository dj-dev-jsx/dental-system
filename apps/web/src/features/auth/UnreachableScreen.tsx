import { buttonOnLight } from '../../components/buttons'
import { AuthLayout } from './AuthLayout'
import { useAuthStore } from './authStore'

/** Shown when the app opens but can't reach the API, instead of a sign-in form that can't work. */
export function UnreachableScreen() {
  const checkSession = useAuthStore((store) => store.checkSession)

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">Can’t reach the server</h1>
      <p className="mt-2 text-pretty text-neutral-600">
        Check this computer’s internet connection, then try again. If other websites work, the
        clinic system may be down for a moment.
      </p>
      <button type="button" onClick={() => void checkSession()} className={`${buttonOnLight} mt-8 h-11 w-full px-4`}>
        Try again
      </button>
    </AuthLayout>
  )
}
