import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { ApiError } from '../lib/api'
import { ClinicGate } from './clinic'
import AppointmentsPage from './pages/AppointmentsPage'
import BookPage from './pages/BookPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import VerifyPage from './pages/VerifyPage'

// Try again only when the server couldn't be reached or failed; a 404 or 401 won't change.
function shouldRetry(failureCount: number, error: Error) {
  return error instanceof ApiError && (error.status === 0 || error.status >= 500) && failureCount < 2
}

// One cache for the patient pages, kept for the whole visit and never shared with the staff side.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: shouldRetry, refetchOnWindowFocus: false },
    mutations: { retry: false },
  },
})

/**
 * The clinic's pages for patients: /book, /verify, /forgot-password, /reset-password and
 * /appointments. Downloaded separately from the staff app and the home page.
 */
export default function PortalApp() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes>
        <Route
          element={
            <ClinicGate>
              <Outlet />
            </ClinicGate>
          }
        >
          <Route path="book" element={<BookPage />} />
          <Route path="verify" element={<VerifyPage />} />
          <Route path="forgot-password" element={<ForgotPasswordPage />} />
          <Route path="reset-password" element={<ResetPasswordPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
        </Route>
        {/* An address we don't have: the home page. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </QueryClientProvider>
  )
}
