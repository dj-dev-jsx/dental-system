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
