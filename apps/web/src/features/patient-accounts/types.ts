// Online booking accounts, as staff see them. They mirror apps/api/src/patient-accounts.
import type { Sex } from '../patients/types'

/** GET /patient-accounts/:id, and what link and unlink answer with. */
export type PatientAccount = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string
  birthDate: string // 'YYYY-MM-DD'
  emailVerifiedAt: string | null
  createdAt: string
  patientId: string | null
  linkedAt: string | null
}

/** Why the API thinks an existing patient might be the account holder. */
export type MatchReason = 'BIRTH_DATE_AND_NAME' | 'PHONE' | 'EMAIL'

/** GET /patient-accounts/:id/matches: up to five current patients who might be this person. */
export type AccountMatch = {
  id: string
  firstName: string
  middleName: string | null
  lastName: string
  suffix: string | null
  birthDate: string
  sex: Sex | null
  phone: string | null
  email: string | null
  matchedOn: MatchReason[]
  /** Already tied to another online account: a patient can have only one. */
  hasOnlineAccount: boolean
}

/** On a patient record: the online account linked to it, if any. */
export type OnlineAccount = {
  id: string
  email: string
  emailVerifiedAt: string | null
  linkedAt: string | null
}
