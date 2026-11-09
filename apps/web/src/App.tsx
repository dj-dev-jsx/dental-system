import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router'
import { LoadErrorBoundary } from './components/LoadErrorBoundary'
import { StaffUserContext, useAuthStore } from './features/auth/authStore'
import { ChangePasswordScreen } from './features/auth/ChangePasswordScreen'
import { LoginScreen } from './features/auth/LoginScreen'
import { UnreachableScreen } from './features/auth/UnreachableScreen'
import HomePage from './pages/HomePage'

// The staff area is only downloaded by people who sign in, so the public pages stay light.
const loadStaffApp = () => import('./staff/StaffApp')
const StaffApp = lazy(loadStaffApp)

// The patient pages (online booking), also downloaded only when visited.
const PortalApp = lazy(() => import('./portal/PortalApp'))

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-white" aria-busy="true">
      <p className="appear-late text-sm text-neutral-500">Loading…</p>
    </div>
  )
}

/** The old /clinic/<name>/... addresses, from emails sent before: the same page at the root. */
function OldClinicAddress() {
  const rest = useParams()['*'] ?? ''
  const { search, state } = useLocation()
  return <Navigate to={`/${rest}${search}`} replace state={state} />
}

/** /sign-in: the form, or straight on to the app if already signed in. */
function SignInRoute() {
  const state = useAuthStore((store) => store.state)
  // A notice passed along by the patient pages, like "Sign in to see your appointments".
  const passed = (useLocation().state as { notice?: string } | null)?.notice

  // While someone types their password, download the staff area in the background, so it's
  // ready by the time they're signed in, even on a slow connection.
  useEffect(() => {
    if (state.status !== 'signedOut') return
    const timer = setTimeout(() => void loadStaffApp(), 1000)
    return () => clearTimeout(timer)
  }, [state.status])

  switch (state.status) {
    case 'checking':
      return <Loading />
    case 'unreachable':
      return <UnreachableScreen />
    case 'signedIn':
      return <Navigate to="/app" replace />
    case 'signedOut':
      return <LoginScreen notice={state.notice ?? passed} />
  }
}

/** /app and everything under it: for signed-in staff only. */
function StaffRoute() {
  const state = useAuthStore((store) => store.state)

  switch (state.status) {
    case 'checking':
      return <Loading />
    case 'unreachable':
      return <UnreachableScreen />
    case 'signedOut':
      return <Navigate to="/sign-in" replace />
    case 'signedIn':
      // A temporary password has to be replaced before anything else: the API refuses all other requests.
      if (state.user.mustChangePassword) return <ChangePasswordScreen />
      return (
        <StaffUserContext value={state.user}>
          <LoadErrorBoundary>
            <Suspense fallback={<Loading />}>
              <StaffApp />
            </Suspense>
          </LoadErrorBoundary>
        </StaffUserContext>
      )
  }
}

export default function App() {
  const checkSession = useAuthStore((store) => store.checkSession)

  useEffect(() => {
    void checkSession()
  }, [checkSession])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/sign-in" element={<SignInRoute />} />
        {/* The * lets the staff area handle /app/patients and the rest itself. */}
        <Route path="/app/*" element={<StaffRoute />} />
        <Route path="/clinic/:old/*" element={<OldClinicAddress />} />
        {/* Patients: /book, /verify, /appointments and the rest, never the staff session. Any other
            address lands on the home page from in there. */}
        <Route
          path="/*"
          element={
            <LoadErrorBoundary>
              <Suspense fallback={<Loading />}>
                <PortalApp />
              </Suspense>
            </LoadErrorBoundary>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
