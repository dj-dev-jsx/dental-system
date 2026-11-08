import { InfoIcon } from '../../components/icons'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { AuthLayout } from './AuthLayout'
import { useAuthStore } from './authStore'
import { ChangePasswordForm } from './ChangePasswordForm'

/**
 * Shown instead of the app while the account still has the temporary password an admin gave
 * out. The API refuses every other request until it's changed, so there is nothing else to do.
 */
export function ChangePasswordScreen() {
  useDocumentTitle('Choose a new password')
  const checkSession = useAuthStore((store) => store.checkSession)
  const signOut = useAuthStore((store) => store.signOut)

  return (
    <AuthLayout>
      <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">Choose a new password</h1>
      <p className="mt-2 text-pretty text-neutral-600">
        Your clinic gave you a temporary password. Choose one only you know, then you can start.
      </p>
      <p className="mt-6 flex gap-3 rounded-md bg-neutral-100 px-3.5 py-3 text-sm/6 text-neutral-900">
        <InfoIcon className="mt-0.5 shrink-0" />
        Type the temporary password in the first box, then your new one twice.
      </p>
      <div className="mt-8">
        {/* Asking the API who we are again shows the app, now that the change is done. */}
        <ChangePasswordForm autoFocus submitLabel="Save and continue" onChanged={() => checkSession()} />
      </div>
      <button
        type="button"
        onClick={() => void signOut().catch(() => undefined)}
        className="mt-8 rounded text-sm font-medium text-neutral-600 underline underline-offset-3 outline-neutral-950 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Sign out
      </button>
    </AuthLayout>
  )
}
