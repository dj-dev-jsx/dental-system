import type { StaffRole } from '../auth/authStore'
import type { Actor } from '../audit/actor'
import type { Condition } from '../dental-chart/model/status'
import type { OnlineAccount } from '../patient-accounts/types'

// The shapes the API sends back. They mirror apps/api/src/patients/patients.service.ts.

export type Sex = 'FEMALE' | 'MALE'

/** The soonest appointment still ahead: asked for or confirmed. */
export type NextAppointment = {
  id: string
  startsAt: string
  endsAt: string
  status: 'REQUESTED' | 'CONFIRMED'
  /** Only on the record, not in the list. */
  reason?: string | null
  dentist: { id: string; lastName: string } | null
}

/** One row of the patient list: what a front desk needs to pick the right person. */
export type PatientSummary = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  birthDate: string // 'YYYY-MM-DD'
  sex: Sex | null
  phone: string | null
  email: string | null
  nextAppointment: NextAppointment | null
  /** When the latest confirmed visit that has already happened ended. */
  lastVisitAt: string | null
}

/** The teeth counted by condition, and the newest entry, for the record's summary. */
export type ChartSummary = {
  counts: Partial<Record<Condition, number>>
  latest: {
    tooth: string
    condition: Condition
    recordedAt: string
    recordedBy: { firstName: string; lastName: string; role: StaffRole }
  } | null
}

/** The full record, sent only when someone opens it (and the API logs that). */
export type Patient = PatientSummary & {
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  privacyConsentAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  /** Missing in what a save returns; the record then keeps the summary it already had. */
  chartSummary?: ChartSummary
  /** The online booking account linked to this record, if any. Missing in what a save returns. */
  onlineAccount?: OnlineAccount | null
}

export type Page<T> = { items: T[]; total: number; page: number; limit: number }

export type PatientSort = 'name' | 'nextAppointment' | 'lastVisit'
export type SortDirection = 'asc' | 'desc'

export type PatientListQuery = { search: string; page: number; archived: boolean; sort: PatientSort; dir: SortDirection }

/**
 * What the form sends. On an edit, null clears an optional field and a missing field is
 * left alone, matching the API.
 */
export type PatientInput = {
  firstName: string
  lastName: string
  birthDate: string
  middleName?: string | null
  suffix?: string | null
  sex?: Sex | null
  phone?: string | null
  email?: string | null
  address?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  privacyConsent?: boolean
}

export type AuditEntry = {
  id: string
  action: string
  entityId: string | null
  metadata: unknown
  createdAt: string
  actor: Actor
}
