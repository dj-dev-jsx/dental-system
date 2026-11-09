import { api, ApiError } from '../lib/api'

// What the clinic's booking pages read and send: /api/v1/portal/...
// Patient answers carry personal details, so the API marks them no-store.

export type Dentist = { id: string; firstName: string; lastName: string }

export type ClinicInfo = {
  name: string
  address: string | null
  phone: string | null
  email: string | null
  /** Minutes after midnight, Philippine time (420 = 7:00 AM). */
  opensAt: number
  closesAt: number
  defaultVisitMinutes: number
  slotMinutes: number
  /** 'YYYY-MM-DD', Philippine dates: tomorrow to about 60 days ahead. */
  firstBookableDate: string
  lastBookableDate: string
  dentists: Dentist[]
}

export type Slot = { startsAt: string; endsAt: string }

export type Me = { id: string; firstName: string; lastName: string; email: string; phone: string; birthDate: string }

export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'

export type PortalAppointment = {
  id: string
  startsAt: string
  endsAt: string
  status: AppointmentStatus
  reason: string
  statusNote: string | null
  dentist: { firstName: string; lastName: string } | null
  canCancel: boolean
}

export type BookingRequest = { startsAt: string; dentistId: string | null; reason: string }

export type Registration = {
  firstName: string
  lastName: string
  birthDate: string
  phone: string
  email: string
  password: string
  privacyConsent: true
  request?: BookingRequest
}

const base = '/portal'
const post = (json?: unknown) => ({ method: 'POST', json: json ?? {} }) as const

export const portalApi = {
  info: () => api<ClinicInfo>(base),
  slots: (date: string, dentistId: string | null) => {
    const query = new URLSearchParams({ date })
    if (dentistId) query.set('dentistId', dentistId)
    return api<{ date: string; slots: Slot[] }>(`${base}/slots?${query}`)
  },
  register: (body: Registration) => api<object>(`${base}/register`, post(body)),
  verify: (token: string) =>
    api<{ account: Me; request: PortalAppointment | null }>(`${base}/verify`, post({ token })),
  resendVerification: (email: string) => api<object>(`${base}/resend-verification`, post({ email })),
  login: (email: string, password: string) => api(`${base}/login`, post({ email, password })),
  forgotPassword: (email: string) => api<object>(`${base}/forgot-password`, post({ email })),
  resetPassword: (token: string, newPassword: string) =>
    api(`${base}/reset-password`, post({ token, newPassword })),
  me: () => api<Me>(`${base}/me`),
  logout: () => api(`${base}/logout`, post()),
  appointments: () =>
    api<{ upcoming: PortalAppointment[]; past: PortalAppointment[] }>(`${base}/appointments`),
  book: (body: BookingRequest) => api<PortalAppointment>(`${base}/appointments`, post(body)),
  cancel: (id: string, reason?: string) =>
    api<PortalAppointment>(`${base}/appointments/${encodeURIComponent(id)}/cancel`, post(reason ? { reason } : {})),
}

/** The code the API put in its error, like 'SLOT_TAKEN', or null. */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null
  const message = (error.details as { message?: unknown } | undefined)?.message
  return typeof message === 'string' ? message : null
}

/** Validation messages from a 400, as { field: message }. The API sends "field: message". */
export function fieldMessages(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.status !== 400) return {}
  const message = (error.details as { message?: unknown } | undefined)?.message
  if (!Array.isArray(message)) return {}
  const fields: Record<string, string> = {}
  for (const line of message) {
    if (typeof line !== 'string') continue
    const at = line.indexOf(':')
    if (at > 0) fields[line.slice(0, at).trim()] ??= line.slice(at + 1).trim()
  }
  return fields
}

export const isOffline = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 502)
export const isRateLimited = (error: unknown) => error instanceof ApiError && error.status === 429
export const isNotAvailable = (error: unknown) => error instanceof ApiError && error.status === 404 && errorCode(error) === 'BOOKING_NOT_AVAILABLE'
export const isSignedOut = (error: unknown) => error instanceof ApiError && error.status === 401

export const OFFLINE_MESSAGE = 'We couldn’t reach the clinic’s booking system. Check your internet connection, then try again.'
export const GENERIC_MESSAGE = 'Something went wrong on our side. Try again in a moment.'

/** A sentence for the errors every patient screen shares. */
export function commonMessage(error: unknown, rateLimited = 'You’ve tried this a few times in a row. Wait a few minutes, then try again.') {
  if (isOffline(error)) return OFFLINE_MESSAGE
  if (isRateLimited(error)) return rateLimited
  return GENERIC_MESSAGE
}
