// Dates and names, written the same way everywhere in the app.

const DATE = new Intl.DateTimeFormat('en-PH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const DATE_TIME = new Intl.DateTimeFormat('en-PH', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
})

/** 'YYYY-MM-DD' as a readable date. Read as UTC, so the day never shifts with the time zone. */
export function formatDate(date: string) {
  return DATE.format(new Date(`${date}T00:00:00Z`))
}

/** A moment in time, as Philippine time. */
export function formatDateTime(iso: string) {
  return DATE_TIME.format(new Date(iso))
}

/** Today's date in the Philippines, as 'YYYY-MM-DD'. */
export function todayInManila() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date())
}

/** Age in whole years on today's date in the Philippines. */
export function ageLabel(birthDate: string) {
  const [by, bm, bd] = birthDate.split('-').map(Number)
  const [ty, tm, td] = todayInManila().split('-').map(Number)
  let age = ty - by
  if (tm < bm || (tm === bm && td < bd)) age -= 1
  if (age < 1) return 'Under 1 year'
  return age === 1 ? '1 year' : `${age} years`
}

type Named = { firstName: string; middleName: string | null; lastName: string; suffix: string | null }

/** "Maria Santos Dela Cruz Jr." */
export function fullName(person: Named) {
  return [person.firstName, person.middleName, person.lastName, person.suffix].filter(Boolean).join(' ')
}

/** "Dela Cruz, Maria Santos Jr.", for lists sorted by last name. */
export function listName(person: Named) {
  return `${person.lastName}, ${[person.firstName, person.middleName, person.suffix].filter(Boolean).join(' ')}`
}

export const SEX_LABELS = { FEMALE: 'Female', MALE: 'Male' } as const

// Appointments. Times are exact moments from the API, shown as Philippine time. Days are
// Philippine dates as 'YYYY-MM-DD'. The Philippines has no daylight saving time, so it is
// always UTC+8.

const MANILA = 'Asia/Manila'
const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: MANILA })
const DAY_LONG = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_SHORT = new Intl.DateTimeFormat('en-PH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
const MANILA_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA })
const MANILA_CLOCK = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: MANILA })

const utcDay = (date: string) => new Date(`${date}T00:00:00Z`)

/** "9:00 – 9:30 AM" */
export function formatTimeRange(startsAt: string, endsAt: string) {
  return TIME.formatRange(new Date(startsAt), new Date(endsAt))
}

/** "Tuesday, November 10, 2026" */
export function formatDayLong(date: string) {
  return DAY_LONG.format(utcDay(date))
}

/** "Tue, Nov 10" */
export function formatDayShort(date: string) {
  return DAY_SHORT.format(utcDay(date))
}

/** "Nov 9 – 15, 2026" */
export function formatDateRange(from: string, to: string) {
  return DATE.formatRange(utcDay(from), utcDay(to))
}

/** The Philippine date of a moment, as 'YYYY-MM-DD'. */
export function manilaDate(iso: string) {
  return MANILA_DATE.format(new Date(iso))
}

/** The Philippine clock time of a moment, as 'HH:MM' (24-hour), the way a time box holds it. */
export function manilaClock(iso: string) {
  return MANILA_CLOCK.format(new Date(iso))
}

/** A Philippine date and clock time, plus some minutes, as an exact moment for the API. */
export function manilaMoment(date: string, clock: string, plusMinutes = 0) {
  const moment = new Date(`${date}T${clock}:00+08:00`)
  return new Date(moment.getTime() + plusMinutes * 60_000).toISOString()
}

export function minutesBetween(startsAt: string, endsAt: string) {
  return Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60_000)
}

export function addDays(date: string, days: number) {
  const day = utcDay(date)
  day.setUTCDate(day.getUTCDate() + days)
  return day.toISOString().slice(0, 10)
}

/** The Monday of the week a date is in. Clinic weeks run Monday to Sunday. */
export function mondayOf(date: string) {
  return addDays(date, -((utcDay(date).getUTCDay() + 6) % 7))
}

/** True for a real 'YYYY-MM-DD' date, such as one typed into the address bar. */
export function isDate(text: string | null): text is string {
  return Boolean(text && /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)))
}

/** "Dr. Jose Santos" */
export function dentistName(dentist: { firstName: string; lastName: string }) {
  return `Dr. ${dentist.firstName} ${dentist.lastName}`
}
