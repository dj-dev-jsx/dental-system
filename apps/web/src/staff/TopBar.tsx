import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useLocation } from 'react-router'
import { buttonOnLight } from '../components/buttons'
import { ArrowLeftIcon, CloseIcon, MenuIcon, PlusIcon, SearchIcon } from '../components/icons'
import { useRequestCount } from '../features/appointments/queries'
import { useStaffUser } from '../features/auth/authStore'
import { GlobalSearch } from './GlobalSearch'
import { Sidebar } from './Sidebar'

const WIDE = '(min-width: 1024px)'

/** True from 1024px, where the rail shows and the search box is always open. */
function useIsWide() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(WIDE)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(WIDE).matches,
  )
}

/** Typing "/" anywhere but in a box jumps to the search, as in mail and issue trackers. */
function useSlashShortcut(onSlash: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
      if (document.querySelector('dialog[open]')) return
      event.preventDefault()
      onSlash()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onSlash])
}

const iconButton = 'relative grid size-10 shrink-0 place-items-center rounded-md text-neutral-700 outline-neutral-950 transition-colors duration-150 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2'

/**
 * Across the top of the work area: find a patient, and book. On phones it also carries the
 * menu button, and the search folds into an icon until it's needed.
 */
export function TopBar() {
  const user = useStaffUser()
  const wide = useIsWide()
  const input = useRef<HTMLInputElement>(null)
  const [searching, setSearching] = useState(false)
  const onSlash = useCallback(() => (wide ? input.current?.focus() : setSearching(true)), [wide])
  useSlashShortcut(onSlash)

  if (wide) {
    return (
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-6 border-b border-neutral-200 bg-white pr-5 pl-6">
        <div className="w-full max-w-xl">
          <GlobalSearch inputRef={input} />
        </div>
        <p className="ml-auto min-w-0 truncate text-sm text-neutral-500">{user.clinicName}</p>
        <Link to="/app/appointments/new" className={`${buttonOnLight} h-9 shrink-0 px-4 text-sm`}>
          <PlusIcon className="size-4" /> Book appointment
        </Link>
      </header>
    )
  }

  return (
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-1 border-b border-neutral-200 bg-white px-2">
      {searching ? (
        <>
          <button type="button" onClick={() => setSearching(false)} aria-label="Close search" className={iconButton}>
            <ArrowLeftIcon />
          </button>
          <div className="min-w-0 flex-1 pr-1">
            <GlobalSearch autoFocus onClose={() => setSearching(false)} />
          </div>
        </>
      ) : (
        <>
          <PhoneMenu />
          <p className="min-w-0 flex-1 truncate px-1 text-sm font-semibold">{user.clinicName}</p>
          <button type="button" onClick={() => setSearching(true)} aria-label="Search patients" className={iconButton}>
            <SearchIcon />
          </button>
          <Link to="/app/appointments/new" aria-label="Book appointment" className={`${iconButton} bg-neutral-950 text-white hover:bg-neutral-800 hover:text-white`}>
            <PlusIcon />
          </Link>
        </>
      )}
    </header>
  )
}

/** The phone menu: the rail's places with their names, in a drawer from the left. */
function PhoneMenu() {
  const dialog = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const requestCount = useRequestCount().data?.count ?? 0

  // Moving to another page closes the menu.
  useEffect(() => {
    dialog.current?.close()
  }, [location.pathname, location.search])

  return (
    <>
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={requestCount > 0 ? `Open menu, ${requestCount} requests waiting` : 'Open menu'}
        className={iconButton}
      >
        <MenuIcon />
        {requestCount > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-neutral-950 ring-2 ring-white" aria-hidden="true" />}
      </button>

      {/* A <dialog> keeps keyboard focus inside the open menu and closes on Escape. */}
      <dialog
        ref={dialog}
        aria-label="Menu"
        onClick={(event) => event.target === dialog.current && dialog.current.close()}
        className="m-0 h-dvh max-h-none w-72 max-w-[85vw] bg-transparent p-0 backdrop:bg-black/60 open:animate-[slide-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="relative h-full">
          <Sidebar onNavigate={() => dialog.current?.close()} />
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            aria-label="Close menu"
            className="absolute top-4 right-3 grid size-10 place-items-center rounded-md text-white outline-white hover:bg-white/10 focus-visible:outline-2"
          >
            <CloseIcon />
          </button>
        </div>
      </dialog>
    </>
  )
}
