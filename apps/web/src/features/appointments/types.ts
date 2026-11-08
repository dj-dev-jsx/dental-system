// The shapes the API sends back. They mirror apps/api/src/appointments/appointments.service.ts.

export type AppointmentStatus = 'REQUESTED' | 'CONFIRMED' | 'DECLINED' | 'CANCELLED'

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
  patient: {
    id: string
    firstName: string
    middleName: string | null
    lastName: string
    suffix: string | null
    phone: string | null
    archivedAt: string | null
  }
  /** Empty for a request where the patient didn't mind which dentist. */
  dentist: Dentist | null
  /** For a request: the first confirmed appointment that clashes with the time and dentist asked for. */
  conflict?: { dentist: { id: string; lastName: string }; startsAt: string; endsAt: string } | null
}

/** One line of an appointment's own history, from GET /appointments/:id/history. */
export type HistoryEntry = {
  id: string
  action: 'APPOINTMENT_CREATED' | 'APPOINTMENT_UPDATED' | 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_DECLINED' | 'APPOINTMENT_CANCELLED'
  createdAt: string
  metadata: {
    dentistId?: string
    startsAt?: string
    endsAt?: string
    changes?: Record<string, { from: string | null; to: string | null }>
  } | null
  actor: { firstName: string; lastName: string; role: 'ADMIN' | 'DENTIST' | 'RECEPTIONIST' | 'ASSISTANT' }
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
