import { dentistName } from '../lib/format'
import type { AppointmentStatus, PortalAppointment } from './api'

const CLOCK = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const WHEN_DAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Manila' })
const WHEN_DAY_YEAR = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Manila' })
const YEAR = new Intl.DateTimeFormat('en-CA', { year: 'numeric', timeZone: 'Asia/Manila' })

/** Minutes after midnight as a clock time: 420 → "7:00 AM". */
export function clockLabel(minutes: number) {
  return CLOCK.format(new Date(Date.UTC(2000, 0, 1, 0, minutes)))
}

/** "7:00 AM – 8:00 PM" */
export function hoursLabel(opensAt: number, closesAt: number) {
  return `${clockLabel(opensAt)} – ${clockLabel(closesAt)}`
}

/** A moment's Philippine clock time: "9:30 AM". */
export function timeLabel(iso: string) {
  return TIME.format(new Date(iso))
}

/** "Tuesday, November 10", with the year only when it isn't this year. */
export function dayOfMoment(iso: string) {
  const date = new Date(iso)
  return YEAR.format(date) === YEAR.format(new Date()) ? WHEN_DAY.format(date) : WHEN_DAY_YEAR.format(date)
}

/** The status in plain words, for patients. */
export const STATUS_WORDS: Record<AppointmentStatus, string> = {
  REQUESTED: 'Waiting for the clinic to confirm',
  CONFIRMED: 'Confirmed',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
}

export function dentistLabel(dentist: PortalAppointment['dentist']) {
  return dentist ? dentistName(dentist) : 'Any dentist'
}

/** A visit's length in words: "30 minutes", "1 hour". */
export function minutesLabel(minutes: number) {
  if (minutes < 60) return `${minutes} minutes`
  const hours = minutes / 60
  return Number.isInteger(hours) ? `${hours} hour${hours === 1 ? '' : 's'}` : `${minutes} minutes`
}

const LEAF_MONTH = new Intl.DateTimeFormat('en-PH', { month: 'short', timeZone: 'Asia/Manila' })
const LEAF_DAY = new Intl.DateTimeFormat('en-PH', { day: 'numeric', timeZone: 'Asia/Manila' })
const LEAF_WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'Asia/Manila' })

/** A moment's Philippine date as a calendar leaf: { month: "Nov", day: "11", weekday: "Wed" }. */
export function dateLeaf(iso: string) {
  const date = new Date(iso)
  return { month: LEAF_MONTH.format(date), day: LEAF_DAY.format(date), weekday: LEAF_WEEKDAY.format(date) }
}
