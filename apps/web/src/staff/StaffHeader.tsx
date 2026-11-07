import { useState } from 'react'
import { NavLink } from 'react-router'
import { buttonOutline } from '../components/buttons'
import { PRODUCT_NAME } from '../config'
import { ROLE_LABELS, useAuthStore, useStaffUser } from '../features/auth/authStore'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex items-center border-b-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 ${
    isActive ? 'border-neutral-950 text-neutral-950' : 'border-transparent text-neutral-600 hover:text-neutral-950'
  }`

/** The bar across the top of the staff area: where you are, who you are, and Sign out. */
export function StaffHeader() {
  const user = useStaffUser()
  const signOut = useAuthStore((store) => store.signOut)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    setError(false)
    try {
      await signOut()
    } catch {
      // Still signed in on the server, so say so rather than pretending it worked.
      setError(true)
      setSigningOut(false)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-stretch gap-4 border-b border-neutral-200 bg-white px-4 sm:px-6">
      <p className="flex min-w-0 items-center gap-2 text-sm sm:mr-2">
        <span className="hidden shrink-0 font-semibold sm:inline">{PRODUCT_NAME}</span>
        <span aria-hidden="true" className="hidden text-neutral-300 lg:inline">/</span>
        <span className="hidden truncate text-neutral-600 lg:inline">{user.clinicName}</span>
      </p>

      <nav aria-label="Main" className="flex gap-5">
        <NavLink to="/app/patients" className={tab}>
          Patients
        </NavLink>
        <NavLink to="/app/chart" className={tab}>
          Sample chart
        </NavLink>
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3 text-sm">
        {error && (
          <span role="alert" className="font-medium">
            Couldn’t sign out. Check the connection and try again.
          </span>
        )}
        <span className="hidden md:inline">
          {user.firstName} {user.lastName}
          <span className="text-neutral-500"> · {ROLE_LABELS[user.role]}</span>
        </span>
        <button type="button" onClick={() => void handleSignOut()} disabled={signingOut} className={`${buttonOutline} h-8 px-3 font-medium`}>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </header>
  )
}
