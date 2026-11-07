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
