// The clinic is in the Philippines, so days and clock times mean Philippine time, whatever
// time zone the server runs in (usually UTC). The Philippines has no daylight saving time,
// so it is always 8 hours ahead of UTC.
const MANILA_OFFSET = '+08:00';
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in the Philippines, as 'YYYY-MM-DD'. */
export function todayInManila(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(now);
}

/** The moment a Philippine day ('YYYY-MM-DD') begins. */
export function startOfManilaDay(date: string) {
  return new Date(`${date}T00:00:00${MANILA_OFFSET}`);
}

/** The date `days` after a 'YYYY-MM-DD' date, also as 'YYYY-MM-DD'. */
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from one 'YYYY-MM-DD' date to another. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

const TIME = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Manila',
});

/** "9:30 AM", Philippine time, for messages people read. */
export function manilaTime(moment: Date) {
  return TIME.format(moment);
}

const DATE = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Asia/Manila',
});

/** "Tuesday, 10 November 2026", Philippine time, for messages people read. */
export function manilaDate(moment: Date) {
  return DATE.format(moment);
}

/** Minutes after midnight, Philippine time (9:30 AM is 570). */
export function manilaMinuteOfDay(moment: Date) {
  return Math.round((moment.getTime() - startOfManilaDay(todayInManila(moment)).getTime()) / 60_000);
}
