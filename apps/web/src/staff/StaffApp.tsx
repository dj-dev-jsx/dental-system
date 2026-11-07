import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { lazy, Suspense, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { LoadErrorBoundary } from '../components/LoadErrorBoundary'
import EditPatientPage from '../features/patients/EditPatientPage'
import NewPatientPage from '../features/patients/NewPatientPage'
import PatientPage from '../features/patients/PatientPage'
import PatientsPage from '../features/patients/PatientsPage'
import { ApiError } from '../lib/api'
import { StaffHeader } from './StaffHeader'

// The 3D chart is most of the app's download, so it only loads when someone opens it.
const Workspace = lazy(() => import('../Workspace'))

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
      <div className="flex h-full flex-col bg-white text-neutral-950">
        <StaffHeader />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <LoadErrorBoundary>
            <Suspense fallback={<PageLoading />}>
              {/* Paths here are inside /app, set in App.tsx. */}
              <Routes>
                <Route index element={<Navigate to="patients" replace />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="patients/new" element={<NewPatientPage />} />
                <Route path="patients/:id" element={<PatientPage />} />
                <Route path="patients/:id/edit" element={<EditPatientPage />} />
                <Route path="chart" element={<Workspace />} />
                <Route path="*" element={<Navigate to="patients" replace />} />
              </Routes>
            </Suspense>
          </LoadErrorBoundary>
        </div>
      </div>
    </QueryClientProvider>
  )
}
