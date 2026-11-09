// The online booking routes answer refusals with codes (409 { message: 'ALREADY_LINKED' }).
// These are the sentences staff see instead.
import { ApiError, errorMessage } from '../../lib/api'

const MESSAGES: Record<string, string> = {
  PATIENT_NOT_LINKED: 'This online request isn’t linked to a patient record yet. Under “Who is this?”, link it to their record or register them, then confirm.',
  ALREADY_LINKED: 'This online account is already linked to a patient record, perhaps by someone else just now. The request has been refreshed.',
  PATIENT_HAS_ACCOUNT: 'That patient already has a different online account. Check you have the right person, or register this person as a new patient.',
  PATIENT_ARCHIVED: 'That patient’s record is archived. Restore the record first, or choose another one.',
  NOT_LINKED: 'This online account is no longer linked to the record. The record has been refreshed.',
  SLUG_TAKEN: 'Another clinic already uses this web address. Choose another one.',
}

/** The API's code for a refusal, like 'ALREADY_LINKED', if it sent one. */
export function errorCode(error: unknown) {
  if (!(error instanceof ApiError)) return null
  const message = (error.details as { message?: unknown } | undefined)?.message
  return typeof message === 'string' && message in MESSAGES ? message : null
}

/** A sentence for the person, for online booking codes and everything errorMessage covers. */
export function onlineErrorMessage(error: unknown) {
  const code = errorCode(error)
  if (code) return MESSAGES[code]
  if (error instanceof ApiError && error.status === 400) {
    const messages = (error.details as { message?: unknown } | undefined)?.message
    if (Array.isArray(messages) && messages.some((m) => typeof m === 'string' && m.startsWith('patientId:'))) {
      return 'That patient record wasn’t found. It may have been removed. Choose another one.'
    }
  }
  return errorMessage(error)
}
