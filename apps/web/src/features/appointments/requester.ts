// Who an appointment is for. Most have a patient record. An online request from someone the
// clinic hasn't linked to a record yet has only `requester`: the name and details they typed
// when they signed up. Every screen that names the person goes through these helpers, so an
// unlinked request always reads as such and never as an existing patient.
import { fullName } from '../../lib/format'
import type { Appointment } from './types'

type Who = Pick<Appointment, 'patient' | 'requester'>

/** The patient's name, or for an unlinked online request, the name the person gave. */
export function whoName(appointment: Who) {
  if (appointment.patient) return fullName(appointment.patient)
  if (appointment.requester) return `${appointment.requester.firstName} ${appointment.requester.lastName}`
  return 'Unknown patient'
}

/** True for an online request not yet tied to a patient record: it can't be confirmed yet. */
export function isUnlinked(appointment: Who) {
  return appointment.patient === null
}

/** The record's phone number, or the one the person typed online. */
export function whoPhone(appointment: Who) {
  return appointment.patient ? appointment.patient.phone : (appointment.requester?.phone ?? null)
}

/** Where the person's record is, or null while there is no record to open. */
export function patientPath(appointment: Who, rest = '') {
  return appointment.patient ? `/app/patients/${appointment.patient.id}${rest}` : null
}

/** Says why Confirm is off for an unlinked request. */
export const NOT_LINKED_REASON = 'Link this person to a patient record before confirming.'
