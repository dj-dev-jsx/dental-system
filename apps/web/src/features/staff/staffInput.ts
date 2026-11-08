// Reading the API's answers about staff forms. Kept apart from the components so React's
// fast refresh keeps working (a file of components should export only components).
import { ApiError } from '../../lib/api'
import { addDays, manilaDate } from '../../lib/format'
import type { StaffRole } from '../auth/authStore'
import type { StaffMember } from './types'

export type StaffField = 'firstName' | 'lastName' | 'email' | 'role'
export type StaffFieldErrors = Partial<Record<StaffField, string>>

// What to say under a field the server refused (its own wording is technical).
const FIELD_MESSAGES: Record<StaffField, string> = {
  firstName: 'Enter a first name.',
  lastName: 'Enter a last name.',
  email: 'Enter an email address, like name@example.com.',
  role: 'Choose a role.',
}

/** The API answers a bad form with messages like "email: must be an email". */
export function staffFieldErrors(error: unknown): StaffFieldErrors {
  if (!(error instanceof ApiError) || error.status !== 400) return {}
  const messages = (error.details as { message?: unknown } | undefined)?.message
  const errors: StaffFieldErrors = {}
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message !== 'string') continue
    const field = message.split(': ')[0] as StaffField
    if (field in FIELD_MESSAGES && !errors[field]) errors[field] = FIELD_MESSAGES[field]
  }
  return errors
}

/** True while the account is locked after too many wrong passwords. */
export function isLocked(member: StaffMember) {
  return member.lockedUntil !== null && Date.parse(member.lockedUntil) > Date.now()
}

/** What each role can do, in a sentence, shown beside the role box. */
export const ROLE_ABILITIES: Record<StaffRole, string> = {
  ADMIN: 'Everything, including staff accounts and clinic settings.',
  DENTIST: 'Chart findings and appointments. Appears in the calendar and can be booked.',
  RECEPTIONIST: 'Patients and appointments. Can view charts.',
  ASSISTANT: 'Patients and appointments. Can view charts.',
}

const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const MONTH_DAY = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })
const MONTH_DAY_YEAR = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

/** A clock time in Philippine time, like "9:12 AM". */
export function formatClock(iso: string) {
  return TIME.format(new Date(iso))
}

/** "Today 9:12 AM", "Yesterday", "Oct 28" (with the year if it isn't this year), or "Never". */
export function formatLastSignIn(iso: string | null, now = new Date()) {
  if (!iso) return 'Never'
  const then = manilaDate(iso)
  const today = manilaDate(now.toISOString())
  if (then === today) return `Today ${formatClock(iso)}`
  if (then === addDays(today, -1)) return 'Yesterday'
  return (then.slice(0, 4) === today.slice(0, 4) ? MONTH_DAY : MONTH_DAY_YEAR).format(new Date(iso))
}

/** "AC" for Ana Cruz: the letters in a person's avatar circle. */
export function initials(member: Pick<StaffMember, 'firstName' | 'lastName'>) {
  return `${member.firstName.charAt(0)}${member.lastName.charAt(0)}`.toUpperCase()
}

/** "Signed in today 9:12 AM", "Signed in Oct 28", "Never signed in". */
export function signedInLine(iso: string | null) {
  if (!iso) return 'Never signed in'
  const when = formatLastSignIn(iso)
  return `Signed in ${when.startsWith('Today') || when.startsWith('Yesterday') ? when.charAt(0).toLowerCase() + when.slice(1) : when}`
}
