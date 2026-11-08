import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { LoadErrorBoundary } from '../components/LoadErrorBoundary'
import AppointmentPage from '../features/appointments/AppointmentPage'
import CalendarPage from '../features/appointments/calendar/CalendarPage'
import EditAppointmentPage from '../features/appointments/EditAppointmentPage'
import NewAppointmentPage from '../features/appointments/NewAppointmentPage'
import RequestDetail from '../features/appointments/RequestDetail'
import RequestsWorkspace from '../features/appointments/RequestsWorkspace'
import ActivityPage from '../features/audit/ActivityPage'
import AccountPage from '../features/auth/AccountPage'
import { useStaffUser } from '../features/auth/authStore'
import SettingsPage from '../features/clinic/SettingsPage'
import EditPatientPage from '../features/patients/EditPatientPage'
import NewPatientPage from '../features/patients/NewPatientPage'
import PatientPage from '../features/patients/PatientPage'
import NoPatientSelected from '../features/patients/NoPatientSelected'
import PatientsWorkspace from '../features/patients/PatientsWorkspace'
import StaffDetail from '../features/staff/StaffDetail'
import StaffWorkspace from '../features/staff/StaffWorkspace'
import TodayPage from '../features/today/TodayPage'
import { ApiError } from '../lib/api'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

// The dental chart (and its 3D model) is most of the app's download, so it only loads when opened.
const ChartPage = lazy(() => import('../features/dental-chart/ChartPage'))

// Try again only when the server couldn't be reached or failed. A 404 or 403 won't change.
function shouldRetry(failureCount: number, error: Error) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500) && failureCount < 2
}

function PageLoading() {
  return (
    <div className="flex h-full items-center justify-center" aria-busy="true">
      <p className="appear-late text-sm text-neutral-500">Loading…</p>
    </div>
  )
}

/**
 * Everything staff see after signing in. Downloaded separately from the public pages.
 * The data cache lives inside this component, so it's thrown away when staff leave.
 */
export default function StaffApp() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Opening a patient's record is logged, so don't refetch just because the
            // browser tab got focus again.
            refetchOnWindowFocus: false,
            retry: shouldRetry,
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      {/* The black sidebar of places on the left (from 1024px), and the work area beside it:
          a search-and-book bar over the scrolling page. */}
      <div className="flex h-full bg-white text-neutral-950">
        <aside className="relative z-40 hidden w-60 shrink-0 lg:block" aria-label="Sidebar">
          <Sidebar />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" className="min-h-0 flex-1 overflow-y-auto">
            <LoadErrorBoundary>
              <Suspense fallback={<PageLoading />}>
                <StaffRoutes />
              </Suspense>
            </LoadErrorBoundary>
          </main>
        </div>
      </div>
    </QueryClientProvider>
  )
}

function StaffRoutes() {
  const user = useStaffUser()
  return (
    // Paths here are inside /app, set in App.tsx. Lists with a detail beside them (patients,
    // requests, staff) are "workspaces": the list stays on the left while the child route
    // fills the right side.
    <Routes>
      <Route index element={<TodayPage />} />
      <Route path="appointments" element={<CalendarPage />} />
      <Route path="appointments/new" element={<NewAppointmentPage />} />
      <Route path="appointments/:id" element={<AppointmentPage />} />
      <Route path="appointments/:id/edit" element={<EditAppointmentPage />} />
      <Route path="requests" element={<RequestsWorkspace />}>
        <Route index element={null} />
        <Route path=":id" element={<RequestDetail />} />
      </Route>
      <Route path="patients" element={<PatientsWorkspace />}>
        <Route index element={<NoPatientSelected />} />
        <Route path="new" element={<NewPatientPage />} />
        <Route path=":id" element={<PatientPage />} />
        <Route path=":id/edit" element={<EditPatientPage />} />
      </Route>
      {/* The chart needs the whole screen, so it stays outside the workspace. */}
      <Route path="patients/:id/chart" element={<ChartPage />} />
      <Route path="account" element={<AccountPage />} />
      {/* Admin-only screens: for everyone else these paths fall through to Today. */}
      {user.role === 'ADMIN' && (
        <Route path="staff" element={<StaffWorkspace />}>
          <Route index element={null} />
          <Route path=":id" element={<StaffDetail />} />
        </Route>
      )}
      {user.role === 'ADMIN' && <Route path="settings" element={<SettingsPage />} />}
      {user.role === 'ADMIN' && <Route path="activity" element={<ActivityPage />} />}
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
