import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { LoadErrorBoundary } from './components/LoadErrorBoundary'
import { StaffUserContext, useAuthStore } from './features/auth/authStore'
import { LoginScreen } from './features/auth/LoginScreen'
import { UnreachableScreen } from './features/auth/UnreachableScreen'
import LandingPage from './pages/LandingPage'

// The staff area is only downloaded by people who sign in, so the public pages stay light.
const loadStaffApp = () => import('./staff/StaffApp')
const StaffApp = lazy(loadStaffApp)

function Loading() {
  return (
    <div className="flex h-full items-center justify-center bg-white" aria-busy="true">
      <p className="appear-late text-sm text-neutral-500">Loading…</p>
    </div>
  )
}

/** /sign-in: the form, or straight on to the app if already signed in. */
function SignInRoute() {
  const state = useAuthStore((store) => store.state)

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
      return <LoginScreen notice={state.notice} />
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
        <Route path="/" element={<LandingPage />} />
        <Route path="/sign-in" element={<SignInRoute />} />
        {/* The * lets the staff area handle /app/patients and the rest itself. */}
        <Route path="/app/*" element={<StaffRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
