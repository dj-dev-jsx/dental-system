import type { StaffRole } from '../auth/authStore'

// The shapes the API sends back. They mirror apps/api/src/patients/patients.service.ts.

export type Sex = 'FEMALE' | 'MALE'

/** One row of the patient list: only what's needed to pick the right person. */
export type PatientSummary = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  birthDate: string // 'YYYY-MM-DD'
  sex: Sex | null
  phone: string | null
}

/** The full record, sent only when someone opens it (and the API logs that). */
export type Patient = PatientSummary & {
  clinicId: string
  email: string | null
  address: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  privacyConsentAt: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
}

export type Page<T> = { items: T[]; total: number; page: number; limit: number }

export type PatientListQuery = { search: string; page: number; archived: boolean }

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
  actor: { id: string; firstName: string; lastName: string; role: StaffRole }
}
