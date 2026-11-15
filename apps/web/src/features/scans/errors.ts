import { ApiError, errorMessage } from '../../lib/api'

const CODES: Record<string, string> = {
  SCAN_FILE_REQUIRED: 'Choose a scan file to upload.',
  SCAN_FORMAT_UNSUPPORTED: 'This kind of file isn’t supported. Upload an STL, PLY or OBJ file from the scanner.',
  SCAN_FILE_INVALID: 'The file couldn’t be read as a 3D scan. It may be damaged, or it isn’t really an STL, PLY or OBJ file. Export it from the scanner again.',
  SCAN_TOO_LARGE: 'This file is larger than 150 MB, the most the system accepts. Export the scan at a lower resolution and try again.',
  SCAN_WITHDRAWN: 'This scan was withdrawn, so it can’t be opened.',
  ALREADY_WITHDRAWN: 'This scan was already withdrawn.',
  PATIENT_ARCHIVED: 'This patient’s record is archived. Restore the record before adding scans.',
}

/** The API's `message`, as one string: a code, or the validation messages joined. */
function messageOf(error: ApiError): string {
  const message = (error.details as { message?: unknown } | undefined)?.message
  if (typeof message === 'string') return message
  if (Array.isArray(message)) return message.filter((m) => typeof m === 'string').join(' ')
  return ''
}

export function scanErrorCode(error: unknown) {
  if (!(error instanceof ApiError)) return null
  const message = messageOf(error)
  return Object.keys(CODES).find((code) => message.includes(code)) ?? null
}

/** A sentence for staff about a failed scan request. */
export function scanErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    const code = scanErrorCode(error)
    if (code) return CODES[code]
    if (error.status === 413) return CODES.SCAN_TOO_LARGE
    if (error.status === 410) return CODES.SCAN_WITHDRAWN
    if (error.status === 429) return 'Too many uploads in a short time. Wait a minute, then try again.'
    if (error.status === 404) return 'This patient or scan wasn’t found. It may have been removed.'
    if (error.status === 403) return 'Only dentists and admins can upload or withdraw scans.'
    if (error.status === 409) return CODES.PATIENT_ARCHIVED
    if (error.status === 400) {
      const message = messageOf(error)
      if (message) return `The details were refused: ${message}`
    }
  }
  return errorMessage(error)
}
