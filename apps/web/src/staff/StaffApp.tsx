import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router'
import { CloseIcon, MenuIcon, PlusIcon } from '../components/icons'
import { LoadErrorBoundary } from '../components/LoadErrorBoundary'
import AppointmentPage from '../features/appointments/AppointmentPage'
import CalendarPage from '../features/appointments/calendar/CalendarPage'
import EditAppointmentPage from '../features/appointments/EditAppointmentPage'
import NewAppointmentPage from '../features/appointments/NewAppointmentPage'
import RequestsPage from '../features/appointments/RequestsPage'
import ActivityPage from '../features/audit/ActivityPage'
import { useRequestCount } from '../features/appointments/queries'
import { useStaffUser } from '../features/auth/authStore'
import EditPatientPage from '../features/patients/EditPatientPage'
import NewPatientPage from '../features/patients/NewPatientPage'
import PatientPage from '../features/patients/PatientPage'
import PatientsPage from '../features/patients/PatientsPage'
import { ApiError } from '../lib/api'
import { Sidebar } from './Sidebar'

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
      <div className="flex h-full bg-white text-neutral-950">
        <aside className="hidden w-60 shrink-0 lg:block" aria-label="Sidebar">
          <Sidebar />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <PhoneBar />
          <main className="min-h-0 flex-1 overflow-y-auto">
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
    // Paths here are inside /app, set in App.tsx.
    <Routes>
      {/* The front desk's day starts with the schedule. */}
      <Route index element={<Navigate to="appointments" replace />} />
      <Route path="appointments" element={<CalendarPage />} />
      <Route path="appointments/new" element={<NewAppointmentPage />} />
      <Route path="appointments/:id" element={<AppointmentPage />} />
      <Route path="appointments/:id/edit" element={<EditAppointmentPage />} />
      <Route path="requests" element={<RequestsPage />} />
      <Route path="patients" element={<PatientsPage />} />
      <Route path="patients/new" element={<NewPatientPage />} />
      <Route path="patients/:id" element={<PatientPage />} />
      <Route path="patients/:id/edit" element={<EditPatientPage />} />
      <Route path="patients/:id/chart" element={<ChartPage />} />
      {user.role === 'ADMIN' && <Route path="activity" element={<ActivityPage />} />}
      <Route path="*" element={<Navigate to="appointments" replace />} />
    </Routes>
  )
}

/** Below 1024px the sidebar folds away behind a menu button in a black bar. */
function PhoneBar() {
  const user = useStaffUser()
  const dialog = useRef<HTMLDialogElement>(null)
  const location = useLocation()
  const requestCount = useRequestCount().data?.count ?? 0

  // Moving to another page closes the menu.
  useEffect(() => {
    dialog.current?.close()
  }, [location.pathname, location.search])

  return (
    <div className="flex h-14 shrink-0 items-center gap-2 bg-neutral-950 px-2 text-white lg:hidden">
      <button
        type="button"
        onClick={() => dialog.current?.showModal()}
        aria-label={requestCount > 0 ? `Open menu, ${requestCount} requests waiting` : 'Open menu'}
        className="relative grid size-10 place-items-center rounded-md outline-white hover:bg-white/10 focus-visible:outline-2"
      >
        <MenuIcon />
        {requestCount > 0 && <span className="absolute top-2 right-2 size-2 rounded-full bg-white ring-2 ring-neutral-950" aria-hidden="true" />}
      </button>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{user.clinicName}</p>
      <Link to="/app/appointments/new" aria-label="Book appointment" className="grid size-10 place-items-center rounded-md outline-white hover:bg-white/10 focus-visible:outline-2">
        <PlusIcon />
      </Link>

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
            className="absolute top-2 right-2 grid size-9 place-items-center rounded-md text-white outline-white hover:bg-white/10 focus-visible:outline-2"
          >
            <CloseIcon />
          </button>
        </div>
      </dialog>
    </div>
  )
}
