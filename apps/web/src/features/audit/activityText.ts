// How the activity log words things: kept apart from the page so it can be read on its own.
import { formatDate, formatDateTime } from '../../lib/format'
import type { StaffRole } from '../auth/authStore'

/** One line of the log, as GET /audit-logs returns it. */
export type ActivityEntry = {
  id: string
  action: string
  entityId: string | null
  metadata: unknown
  createdAt: string
  actor: { id: string; firstName: string; lastName: string; role: StaffRole }
  /** What the line is about, named: null for sign-ins and clinic settings. */
  subject:
    | { kind: 'patient'; id: string; name: string }
    | { kind: 'staff'; id: string; name: string }
    | { kind: 'appointment'; id: string; name: string; startsAt: string }
    | null
}

/** [with a named record, without one]. The record's name follows the first. */
const SENTENCES: Record<string, [string, string]> = {
  LOGIN_SUCCEEDED: ['signed in', 'signed in'],
  LOGIN_FAILED: ['failed to sign in', 'failed to sign in'],
  LOGOUT: ['signed out', 'signed out'],
  PATIENT_CREATED: ['registered', 'registered a patient'],
  PATIENT_LISTED: ['searched the patient list', 'searched the patient list'],
  PATIENT_VIEWED: ['opened the record of', 'opened a patient record'],
  PATIENT_UPDATED: ['changed the record of', 'changed a patient record'],
  PATIENT_ARCHIVED: ['archived', 'archived a patient'],
  PATIENT_RESTORED: ['restored', 'restored a patient'],
  APPOINTMENT_CREATED: ['booked', 'booked an appointment'],
  APPOINTMENT_LISTED: ['looked at the appointments of', 'looked at appointments'],
  APPOINTMENT_VIEWED: ['opened', 'opened an appointment'],
  APPOINTMENT_UPDATED: ['changed', 'changed an appointment'],
  APPOINTMENT_CONFIRMED: ['confirmed', 'confirmed an appointment'],
  APPOINTMENT_DECLINED: ['declined', 'declined a request'],
  APPOINTMENT_CANCELLED: ['cancelled', 'cancelled an appointment'],
  CHART_VIEWED: ['opened the dental chart of', 'opened a dental chart'],
  TOOTH_RECORDED: ['recorded a finding on the chart of', 'recorded a finding on a chart'],
  TOOTH_CORRECTED: ['corrected a chart entry of', 'corrected a chart entry'],
  STAFF_CREATED: ['added the staff account of', 'added a staff account'],
  STAFF_UPDATED: ['changed the staff account of', 'changed a staff account'],
  STAFF_PASSWORD_RESET: ['reset the password of', 'reset a staff password'],
  STAFF_UNLOCKED: ['unlocked the account of', 'unlocked a staff account'],
  PASSWORD_CHANGED: ['changed their password', 'changed their password'],
  CLINIC_UPDATED: ['changed the clinic settings', 'changed the clinic settings'],
}

export function sentence(entry: ActivityEntry) {
  const [named, plain] = SENTENCES[entry.action] ?? [entry.action, entry.action]
  // A staff member changing their own password is not "about" anyone else.
  if (!entry.subject || entry.action === 'PASSWORD_CHANGED') return { text: plain, hasSubject: false }
  return { text: named, hasSubject: true }
}

/** Where a named record lives. */
export function subjectLink(entry: ActivityEntry) {
  const subject = entry.subject
  if (!subject) return null
  if (subject.kind === 'staff') return '/app/staff'
  if (subject.kind === 'appointment') return `/app/appointments/${subject.id}`
  if (entry.action === 'CHART_VIEWED' || entry.action.startsWith('TOOTH_')) return `/app/patients/${subject.id}/chart`
  return `/app/patients/${subject.id}`
}

/** The groups in the "Kind" filter, and the log lines each one covers. */
export const KIND_GROUPS = [
  { value: 'signins', label: 'Sign-ins', actions: ['LOGIN_SUCCEEDED', 'LOGIN_FAILED', 'LOGOUT'] },
  { value: 'failed', label: 'Failed sign-ins', actions: ['LOGIN_FAILED'] },
  {
    value: 'patients',
    label: 'Patients',
    actions: ['PATIENT_CREATED', 'PATIENT_LISTED', 'PATIENT_VIEWED', 'PATIENT_UPDATED', 'PATIENT_ARCHIVED', 'PATIENT_RESTORED'],
  },
  {
    value: 'appointments',
    label: 'Appointments',
    actions: ['APPOINTMENT_CREATED', 'APPOINTMENT_LISTED', 'APPOINTMENT_VIEWED', 'APPOINTMENT_UPDATED', 'APPOINTMENT_CONFIRMED', 'APPOINTMENT_DECLINED', 'APPOINTMENT_CANCELLED'],
  },
  { value: 'charts', label: 'Dental charts', actions: ['CHART_VIEWED', 'TOOTH_RECORDED', 'TOOTH_CORRECTED'] },
  {
    value: 'staff',
    label: 'Staff & settings',
    actions: ['STAFF_CREATED', 'STAFF_UPDATED', 'STAFF_PASSWORD_RESET', 'STAFF_UNLOCKED', 'PASSWORD_CHANGED', 'CLINIC_UPDATED'],
  },
] as const

/** Lines an admin scanning the log should not miss. */
export function emphasis(entry: ActivityEntry): { tone: 'solid' | 'outline'; label: string } | null {
  switch (entry.action) {
    case 'LOGIN_FAILED':
      return { tone: 'solid', label: 'Failed sign-in' }
    case 'PATIENT_ARCHIVED':
      return { tone: 'outline', label: 'Archived' }
    case 'STAFF_PASSWORD_RESET':
      return { tone: 'outline', label: 'Password reset' }
    case 'STAFF_CREATED':
    case 'STAFF_UPDATED':
    case 'STAFF_UNLOCKED':
      return { tone: 'outline', label: 'Staff change' }
    case 'CLINIC_UPDATED':
      return { tone: 'outline', label: 'Settings' }
    default:
      return null
  }
}

const FAILURE_REASONS: Record<string, string> = {
  WRONG_PASSWORD: 'wrong password',
  ACCOUNT_LOCKED: 'account locked',
  ACCOUNT_DEACTIVATED: 'account deactivated',
}

/** Why a sign-in failed, in words. */
export function failureReason(entry: ActivityEntry) {
  const metadata = entry.metadata as { reason?: string; accountLocked?: boolean } | null
  if (entry.action !== 'LOGIN_FAILED' || !metadata?.reason) return null
  const reason = FAILURE_REASONS[metadata.reason] ?? null
  return reason && metadata.accountLocked ? `${reason}, account now locked` : reason
}

const FIELD_LABELS: Record<string, string> = {
  dentistId: 'dentist',
  startsAt: 'starts',
  endsAt: 'ends',
  statusNote: 'note',
  isActive: 'active',
  defaultVisitMinutes: 'default visit length',
  opensAt: 'opening time',
  closesAt: 'closing time',
}

const humanize = (field: string) => FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').toLowerCase()

/** Minutes after midnight, like 540, as "9:00 AM". */
function clock(minutes: number) {
  const hour = Math.floor(minutes / 60)
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

function showValue(field: string, value: string | null) {
  if (value === null || value === '') return 'empty'
  if ((field === 'opensAt' || field === 'closesAt') && /^\d+$/.test(value)) return clock(Number(value))
  if (field === 'defaultVisitMinutes' && /^\d+$/.test(value)) return `${value} minutes`
  if (field === 'dentistId') return 'another dentist'
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDate(value)
  return value.length > 40 ? `${value.slice(0, 40)}…` : value
}

/** The fields an edit changed, like "birth date: Mar 14, 2001 → Mar 15, 2001". */
export function changesOf(entry: ActivityEntry) {
  const changes = (entry.metadata as { changes?: Record<string, { from: unknown; to: unknown }> } | null)?.changes
  if (!changes) return []
  return Object.entries(changes)
    .filter(([field]) => !/password|hash/i.test(field))
    .map(([field, { from, to }]) => {
      const text = (v: unknown) => (v === null || v === undefined ? null : String(v))
      return { field: humanize(field), from: showValue(field, text(from)), to: showValue(field, text(to)) }
    })
}
