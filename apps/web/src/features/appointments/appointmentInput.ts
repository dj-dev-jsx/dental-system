// Reading the booking boxes and the API's answers. Kept apart from the components so React's
// fast refresh keeps working (a file of components should export only components).
import { ApiError } from '../../lib/api'
import { manilaDate, manilaMoment, todayInManila } from '../../lib/format'
import type { Appointment } from './types'

export type FieldErrors = Partial<Record<'patientId' | 'dentistId' | 'date' | 'time' | 'duration' | 'reason', string>>

/** True when a request's day is already over, so it needs a new time to be confirmed. */
export function hasPassed(appointment: Appointment) {
  return manilaDate(appointment.startsAt) < todayInManila()
}

/** Reads the dentist and times from a form, or says which boxes are empty. */
export function readWhen(form: FormData) {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const errors: FieldErrors = {}
  const dentistId = text('dentistId')
  const date = text('date')
  const time = text('time')
  if (!dentistId) errors.dentistId = 'Choose a dentist.'
  if (!date) errors.date = 'Enter the date.'
  if (!time) errors.time = 'Enter the start time.'
  if (Object.keys(errors).length > 0) return { errors }
  return {
    errors,
    values: {
      dentistId,
      startsAt: manilaMoment(date, time),
      endsAt: manilaMoment(date, time, Number(text('duration'))),
    },
  }
}

// Where each of the API's fields shows up in the form, and what to say if the API's own
// words are technical (like "Invalid UUID").
const FIELDS: Record<string, [keyof FieldErrors, string]> = {
  patientId: ['patientId', 'Choose a patient.'],
  dentistId: ['dentistId', 'Choose a dentist.'],
  startsAt: ['date', 'Check the date and start time.'],
  endsAt: ['duration', 'Check the length.'],
  reason: ['reason', 'Use up to 500 characters.'],
}

/**
 * The API answers a bad booking with messages like "startsAt: That day has already passed".
 * Those rules were written for people, so their words are shown as they are.
 */
export function fieldErrorsFrom(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.status !== 400) return {}
  const messages = (error.details as { message?: unknown } | undefined)?.message
  const errors: FieldErrors = {}
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message !== 'string') continue
    const [field, ...rest] = message.split(': ')
    const text = rest.join(': ')
    const target = FIELDS[field]
    if (!target || errors[target[0]]) continue
    const readable = /^[A-Z]/.test(text) && !text.startsWith('Invalid')
    errors[target[0]] = readable && field !== 'reason' ? `${text}.` : target[1]
  }
  return errors
}
