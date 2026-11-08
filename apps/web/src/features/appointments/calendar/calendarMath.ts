// The arithmetic behind the calendar: which days a view covers, where an appointment sits on
// the time grid, and how appointments that overlap share a column.
import { addDays, manilaClock, mondayOf } from '../../../lib/format'
import type { Appointment } from '../types'

export type View = 'day' | 'week' | 'month'

/**
 * The hours the grid shows come from the clinic's settings (opening hours), so they are
 * passed around instead of being constants. These are the values used while those load.
 */
export const DEFAULT_START_HOUR = 7
export const DEFAULT_END_HOUR = 20
/** The whole hours that cover the clinic's opening hours, which are in minutes after midnight. */
export function gridHours(opensAt: number, closesAt: number) {
  return { startHour: Math.floor(opensAt / 60), endHour: Math.ceil(closesAt / 60) }
}
/** Height of one hour on the grid, in pixels. A 15-minute slot is a quarter of it. */
export const HOUR_PX = 64
export const SLOT_MINUTES = 15

/** The days a view shows, first to last. */
export function daysOf(view: View, date: string) {
  if (view === 'day') return [date]
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i))
  // A month is shown as six whole weeks, Monday first, like a wall calendar.
  const start = mondayOf(`${date.slice(0, 7)}-01`)
  return Array.from({ length: 42 }, (_, i) => addDays(start, i))
}

/** Where the previous or next button goes from this date. */
export function step(view: View, date: string, direction: 1 | -1) {
  if (view === 'day') return addDays(date, direction)
  if (view === 'week') return addDays(date, 7 * direction)
  const day = new Date(`${date.slice(0, 7)}-01T00:00:00Z`)
  day.setUTCMonth(day.getUTCMonth() + direction)
  return day.toISOString().slice(0, 10)
}

/** Minutes since midnight, Philippine time. */
export function minutesOfDay(iso: string) {
  const [hours, minutes] = manilaClock(iso).split(':').map(Number)
  return hours * 60 + minutes
}

/** 'HH:MM' for a number of minutes since midnight. */
export function clockOf(minutes: number) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/** Top and height on the grid, in pixels, kept inside the visible day. */
export function placement(startsAt: string, endsAt: string, startHour: number, endHour: number) {
  const first = startHour * 60
  const last = endHour * 60
  const start = Math.max(first, Math.min(last - SLOT_MINUTES, minutesOfDay(startsAt)))
  const end = Math.max(start + SLOT_MINUTES, Math.min(last, minutesOfDay(endsAt)))
  return { top: ((start - first) / 60) * HOUR_PX, height: ((end - start) / 60) * HOUR_PX }
}

export type Placed = { appointment: Appointment; lane: number; lanes: number }

/**
 * Splits a column's appointments into side-by-side lanes where they overlap, the way desktop
 * calendars do. Appointments that touch a group share its width; the rest use the full column.
 */
export function layoutLanes(appointments: Appointment[]): Placed[] {
  const sorted = [...appointments].sort(
    (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || Date.parse(b.endsAt) - Date.parse(a.endsAt),
  )
  const placed: Placed[] = []
  let group: Placed[] = []
  let laneEnds: number[] = []
  let groupEnd = -Infinity

  const closeGroup = () => {
    for (const item of group) item.lanes = laneEnds.length
    group = []
    laneEnds = []
  }

  for (const appointment of sorted) {
    const start = Date.parse(appointment.startsAt)
    const end = Date.parse(appointment.endsAt)
    if (start >= groupEnd) closeGroup()
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) lane = laneEnds.push(end) - 1
    else laneEnds[lane] = end
    const item = { appointment, lane, lanes: 1 }
    group.push(item)
    placed.push(item)
    groupEnd = Math.max(groupEnd, end)
  }
  closeGroup()
  return placed
}
