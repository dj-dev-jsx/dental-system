import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

/**
 * Stops staff losing unsaved work. The app uses a plain <BrowserRouter>, which has no
 * navigation blocker (useBlocker needs a data router), so this catches the two ways out
 * instead: closing or reloading the tab (the browser's own prompt), and clicking any link
 * inside the app (an inline question the page shows, never a pop-up).
 */
export function useLeaveGuard(dirty: boolean) {
  const navigate = useNavigate()
  const [leaveTo, setLeaveTo] = useState<string | null>(null)

  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]')
      if (!(link instanceof HTMLAnchorElement) || link.target === '_blank' || link.origin !== window.location.origin) return
      const to = link.pathname + link.search + link.hash
      if (to === window.location.pathname + window.location.search + window.location.hash) return
      event.preventDefault()
      event.stopPropagation()
      setLeaveTo(to)
    }
    window.addEventListener('beforeunload', beforeUnload)
    // Capture phase, so it runs before the router's own link handler.
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      document.removeEventListener('click', onClick, true)
    }
  }, [dirty])

  return {
    /** Where the person tried to go, while the page is asking whether to leave. */
    leaveTo: dirty ? leaveTo : null,
    stay: () => setLeaveTo(null),
    leave: () => {
      const to = leaveTo
      setLeaveTo(null)
      if (to) void navigate(to)
    },
  }
}
