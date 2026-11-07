import { type ComponentType, type SVGProps, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { buttonOnDark } from '../components/buttons'
import { AlertIcon, CalendarIcon, InboxIcon, ListIcon, PeopleIcon, PlusIcon } from '../components/icons'
import { MiniMonth } from '../components/MiniMonth'
import { PRODUCT_NAME } from '../config'
import { useRequestCount } from '../features/appointments/queries'
import { ROLE_LABELS, useAuthStore, useStaffUser } from '../features/auth/authStore'
import { isDate, todayInManila } from '../lib/format'

type Item = {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  count?: number
}

/**
 * The staff area's navigation: a column of film-black down the left, the white work area
 * beside it lit like a lightbox. On phones it opens from the menu button instead.
 */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useStaffUser()
  const signOut = useAuthStore((store) => store.signOut)
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState(false)
  const requestCount = useRequestCount().data?.count ?? 0
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()

  const onSchedule = location.pathname === '/app/appointments'
  const shownDate = onSchedule && isDate(params.get('date')) ? params.get('date')! : todayInManila()

  const items: Item[] = [
    { to: '/app/appointments', label: 'Schedule', icon: CalendarIcon },
    { to: '/app/requests', label: 'Requests', icon: InboxIcon, count: requestCount },
    { to: '/app/patients', label: 'Patients', icon: PeopleIcon },
  ]
  const adminItems: Item[] = user.role === 'ADMIN' ? [{ to: '/app/activity', label: 'Activity log', icon: ListIcon }] : []

  function pickDay(date: string) {
    const next = new URLSearchParams(onSchedule ? params : undefined)
    next.set('date', date)
    if (!onSchedule) next.set('view', 'day')
    navigate(`/app/appointments?${next}`)
    onNavigate?.()
  }

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

  function isActive(item: Item) {
    return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`)
  }

  const link = (item: Item) => {
    const active = isActive(item)
    return (
      <li key={item.to}>
        <Link
          to={item.to}
          onClick={onNavigate}
          aria-current={active ? 'page' : undefined}
          className={`flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium outline-white transition-colors duration-150 focus-visible:outline-2 ${
            active ? 'bg-white/12 text-white' : 'text-neutral-400 hover:bg-white/6 hover:text-white'
          }`}
        >
          <item.icon className="size-[1.125rem] shrink-0" />
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
      {/* The clinic's name heads the sidebar; the product's name sits quietly under it. */}
      <div className="shrink-0 px-5 pt-5 pb-1">
        <p className="truncate text-base/6 font-semibold">{user.clinicName}</p>
        <p className="text-xs text-neutral-500">{PRODUCT_NAME}</p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-color:var(--color-neutral-700)_transparent] [scrollbar-width:thin]">
        <div className="px-3 pt-4">
          <Link to="/app/appointments/new" onClick={onNavigate} className={`${buttonOnDark} h-10 w-full text-sm`}>
            <PlusIcon className="size-4" /> Book appointment
          </Link>
        </div>

        <nav aria-label="Main" className="mt-4 px-3">
          <ul className="flex flex-col gap-0.5">{items.map(link)}</ul>
          {adminItems.length > 0 && (
            <>
              <p className="mt-5 mb-1.5 px-3 text-xs font-medium text-neutral-500">Admin</p>
              <ul className="flex flex-col gap-0.5">{adminItems.map(link)}</ul>
            </>
          )}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-4">
          <MiniMonth selected={shownDate} onPick={pickDay} />
        </div>
      </div>

      <div className="shrink-0 border-t border-white/10 p-3">
        <div className="flex items-center gap-3 px-2 py-1">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-semibold" aria-hidden="true">
            {user.firstName[0]}
            {user.lastName[0]}
          </span>
          <span className="min-w-0 flex-1 text-sm/5">
            <span className="block truncate font-medium">
              {user.firstName} {user.lastName}
            </span>
            <span className="block text-neutral-400">{ROLE_LABELS[user.role]}</span>
          </span>
        </div>
        {error && (
          <p role="alert" className="mt-2 flex gap-2 px-2 text-xs/5 text-neutral-200">
            <AlertIcon className="mt-0.5 size-4 shrink-0" />
            Couldn’t sign out. Check the connection and try again.
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          className="mt-2 h-9 w-full rounded-md border border-white/20 text-sm font-medium text-neutral-200 outline-white transition-colors duration-150 hover:border-white hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait"
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </div>
  )
}
