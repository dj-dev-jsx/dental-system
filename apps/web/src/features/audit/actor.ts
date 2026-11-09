// Who did something, as the audit log records it: a staff member, or a patient using their
// online booking account. Shared by the activity log, a patient's history and an
// appointment's timeline.
import { ROLE_LABELS, type StaffRole } from '../auth/authStore'

export type Actor =
  | { kind: 'staff'; id: string; firstName: string; lastName: string; role: StaffRole }
  | { kind: 'patient'; id: string; firstName: string; lastName: string; role: 'PATIENT' }

/** "Receptionist", or "Patient, online" for someone using the clinic's booking page. */
export function actorRole(actor: Actor) {
  return actor.kind === 'patient' ? 'Patient, online' : ROLE_LABELS[actor.role]
}

/** "Rosa Villanueva" */
export function actorName(actor: Actor) {
  return `${actor.firstName} ${actor.lastName}`
}
