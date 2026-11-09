// The shapes the API sends back. They mirror apps/api/src/appointments/appointments.service.ts.
import type { Actor } from '../audit/actor'

export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'

export type AppointmentSource = 'STAFF' | 'ONLINE'

/** The online account that asked for an appointment. `linked`: staff have tied it to a patient record. */
export type Requester = {
  accountId: string
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string // 'YYYY-MM-DD'
  linked: boolean
}

export type Dentist = { id: string; firstName: string; lastName: string }

export type Appointment = {
  id: string
  startsAt: string // an exact moment, ISO 8601
  endsAt: string
  status: AppointmentStatus
  reason: string | null
  statusNote: string | null
  createdAt: string
  updatedAt: string
  /**
   * The patient record. Null for an online request from an account staff haven't linked to a
   * record yet: then `requester` is all the clinic knows (see requester.ts).
   */
  patient: {
    id: string
    firstName: string
    middleName: string | null
    lastName: string
    suffix: string | null
    phone: string | null
    archivedAt: string | null
  } | null
  /** STAFF: booked by the clinic. ONLINE: asked for by a patient on the clinic's booking page. */
  source: AppointmentSource
  /** Who asked, as they typed it when signing up online. Null for staff bookings. */
  requester: Requester | null
  /** Empty for a request where the patient didn't mind which dentist. */
  dentist: Dentist | null
  /** For a request: the first confirmed appointment that clashes with the time and dentist asked for. */
  conflict?: { dentist: { id: string; lastName: string }; startsAt: string; endsAt: string } | null
}

/** One line of an appointment's own history, from GET /appointments/:id/history. */
export type HistoryEntry = {
  id: string
  action:
    | 'APPOINTMENT_CREATED'
    | 'APPOINTMENT_REQUESTED_ONLINE'
    | 'APPOINTMENT_UPDATED'
    | 'APPOINTMENT_CONFIRMED'
    | 'APPOINTMENT_DECLINED'
    | 'APPOINTMENT_CANCELLED'
    | 'APPOINTMENT_CANCELLED_BY_PATIENT'
  createdAt: string
  metadata: {
    dentistId?: string
    startsAt?: string
    endsAt?: string
    changes?: Record<string, { from: string | null; to: string | null }>
  } | null
  actor: Actor
}

export type History = { items: HistoryEntry[]; dentists: Record<string, { firstName: string; lastName: string }> }

/** GET /appointments/availability */
export type Availability = {
  free: boolean
  clash: { startsAt: string; endsAt: string } | null
  suggestions: { startsAt: string; endsAt: string }[]
}

/** Staff booking directly. */
export type NewAppointment = {
  patientId: string
  dentistId: string
  startsAt: string
  endsAt: string
  reason?: string
}

/** A change: missing fields are left alone, null clears one. */
export type AppointmentChanges = {
  dentistId?: string | null
  startsAt?: string
  endsAt?: string
  reason?: string | null
}

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
  REQUESTED: 'Request',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
}
