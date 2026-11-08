// How long a request has waited, in words, and whether that is too long.
import { manilaDate, todayInManila } from '../../lib/format'
import type { Appointment } from './types'

const DAY_MS = 24 * 60 * 60 * 1000
/** A request waiting longer than this is overdue, whatever day it asked for. */
export const OVERDUE_AFTER_DAYS = 2

/** "just now", "3 hours ago", "2 days ago". */
export function waitedFor(createdAt: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60_000))
  if (minutes < 2) return 'just now'
  if (minutes < 60) return `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 day ago' : `${days} days ago`
}

/** Why a request needs answering now, or null when it can wait a little. */
export function overdueReason(request: Appointment, now = Date.now()) {
  if (manilaDate(request.startsAt) < todayInManila()) return 'Day passed'
  if (now - Date.parse(request.createdAt) > OVERDUE_AFTER_DAYS * DAY_MS) return 'Overdue'
  return null
}

/** "Waiting 2 days", "Waiting 3 hours", "Just in": how long a request has gone unanswered. */
export function waitingFor(createdAt: string, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - Date.parse(createdAt)) / 60_000))
  if (minutes < 2) return 'Just in'
  if (minutes < 60) return `Waiting ${minutes} minutes`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return hours === 1 ? 'Waiting 1 hour' : `Waiting ${hours} hours`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Waiting 1 day' : `Waiting ${days} days`
}

/** The waiting queue in the order to answer it: overdue first, then by the day asked for (as the API sorts). */
export function queueOrder(items: Appointment[], now = Date.now()) {
  return [...items].sort((a, b) => Number(!overdueReason(a, now)) - Number(!overdueReason(b, now)))
}
