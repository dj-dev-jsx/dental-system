import { type ComponentType, type SVGProps, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { buttonOnDark } from '../components/buttons'
import { AlertIcon, CalendarIcon, InboxIcon, ListIcon, PeopleIcon, PlusIcon, SettingsIcon, SignOutIcon, SunIcon, UsersIcon } from '../components/icons'
import { MiniMonth } from '../components/MiniMonth'
import { useRequestCount } from '../features/appointments/queries'
import { ROLE_LABELS, useAuthStore, useStaffUser } from '../features/auth/authStore'
import { isDate, todayInManila } from '../lib/format'

type Item = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  count?: number
  /** Today is /app itself, so it's only current on exactly that path. */
  exact?: boolean
}

/** The places in the sidebar, in order. Admins get a second group. */
function useNavItems() {
  const user = useStaffUser()
  const requestCount = useRequestCount().data?.count ?? 0
  const main: Item[] = [
    { to: '/app', label: 'Today', icon: SunIcon, exact: true },
    { to: '/app/appointments', label: 'Schedule', icon: CalendarIcon },
    { to: '/app/requests', label: 'Requests', icon: InboxIcon, count: requestCount },
    { to: '/app/patients', label: 'Patients', icon: PeopleIcon },
  ]
  const admin: Item[] =
    user.role === 'ADMIN'
      ? [
          { to: '/app/staff', label: 'Staff', icon: UsersIcon },
          { to: '/app/settings', label: 'Clinic settings', icon: SettingsIcon },
          { to: '/app/activity', label: 'Activity log', icon: ListIcon },
        ]
      : []
  return { main, admin }
}

function useIsActive() {
  const { pathname } = useLocation()
  return (item: { to: string; exact?: boolean }) => (item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))
}

/** Signing out can fail when the server can't be reached; then say so rather than pretend. */
export function useSignOut() {
  const signOut = useAuthStore((store) => store.signOut)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(false)
  async function run() {
    setSigningOut(true)
    setError(false)
    try {
      await signOut()
    } catch {
      // Still signed in on the server.
      setError(true)
      setSigningOut(false)
    }
  }
  return { signingOut, error, signOut: () => void run() }
}

/** "Clinic A Dental" -> "CA": the first letters of the first two words. */
function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}

/**
 * The staff area's navigation: a 15rem column of film-black down the left, the white work area
 * beside it lit like a lightbox. From 1024px it is always there; on phones the same sidebar
 * opens as a drawer from the menu button (then `onNavigate` closes the drawer after a choice).
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useStaffUser()
  const { main, admin } = useNavItems()
  const isActive = useIsActive()
  const { signingOut, error, signOut } = useSignOut()
  const onAccount = isActive({ to: '/app/account' })
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  // The small month follows the day the schedule shows; elsewhere it shows today.
  const onSchedule = location.pathname === '/app/appointments'
  const requested = params.get('date')
  const shownDate = onSchedule && isDate(requested) ? requested : todayInManila()

  /** Opens that day in the schedule, keeping the schedule's view and dentist when already there. */
  function pickDay(date: string) {
    const next = new URLSearchParams(onSchedule ? params : undefined)
    next.set('date', date)
    if (!onSchedule) next.set('view', 'day')
    navigate(`/app/appointments?${next}`)
    onNavigate?.()
  }

  const link = (item: Item) => {
    const active = isActive(item)
    return (
      <li key={item.to}>
        <Link
          to={item.to}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 ${
            active ? 'bg-white/12 text-white' : 'text-neutral-400 hover:bg-white/6 hover:text-white'
          }`}
        >
          <item.icon className="shrink-0" />
          <span className="flex-1">{item.label}</span>
          {item.count ? (
            <span className="min-w-5 rounded-full bg-white px-1.5 text-center text-xs/5 font-semibold text-neutral-950 tabular-nums">
              {item.count}
              <span className="sr-only"> waiting</span>
            </span>
          ) : null}
        </Link>
      </li>
    )
  }

  return (
    <div className="flex h-full flex-col bg-neutral-950 text-white">
      {/* In the drawer the close button sits top right, so the name leaves room for it. */}
      <div className={`flex shrink-0 items-center gap-3 px-4 pt-4 ${onNavigate ? 'pr-14' : ''}`}>
        <span className="grid size-10 shrink-0 place-items-center rounded-md bg-white text-sm font-bold tracking-[-0.02em] text-neutral-950" aria-hidden="true">
          {initialsOf(user.clinicName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base/6 font-semibold">{user.clinicName}</p>
          <p className="text-xs text-neutral-500">Staff</p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-color:var(--color-neutral-700)_transparent] [scrollbar-width:thin]">
        <div className="px-3 pt-5">
          <Link to="/app/appointments/new" onClick={onNavigate} className={`${buttonOnDark} h-10 w-full text-sm`}>
            <PlusIcon className="size-4" /> Book appointment
          </Link>
        </div>
        <nav aria-label="Main" className="mt-4 px-3">
          <ul className="flex flex-col gap-0.5">{main.map(link)}</ul>
          {admin.length > 0 && (
            <>
              <p className="mt-5 mb-1.5 px-3 text-xs font-medium text-neutral-500">Admin</p>
              <ul className="flex flex-col gap-0.5">{admin.map(link)}</ul>
            </>
          )}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-4">
          <MiniMonth selected={shownDate} onPick={pickDay} />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <Link
          to="/app/account"
          onClick={onNavigate}
          aria-current={onAccount ? 'page' : undefined}
          className={`flex items-center gap-3 rounded-md px-2 py-1 outline-white transition-colors duration-150 hover:bg-white/6 focus-visible:outline-2 ${onAccount ? 'bg-white/12' : ''}`}
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/12 text-xs font-semibold" aria-hidden="true">
            {user.firstName[0]}
            {user.lastName[0]}
          </span>
          <span className="min-w-0 flex-1 text-sm/5">
            <span className="block truncate font-medium">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-neutral-400">{ROLE_LABELS[user.role]} · Account</span>
          </span>
        </Link>
        {error && (
          <p role="alert" className="mt-2 flex gap-2 px-2 text-xs/5 text-neutral-200">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Couldn’t sign out. Check the connection and try again.
          </p>
        )}
        <button
          type="button"
          onClick={signOut}
          disabled={signingOut}
          className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/20 text-sm font-medium text-neutral-200 outline-white transition-colors duration-150 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait"
        >
          <SignOutIcon className="size-4" />
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
