import { useState } from 'react'
import { usePatientAppointments } from './queries'
import type { Appointment } from './types'

/**
 * A patient's appointments sorted for a record: what's coming up (soonest first), and what's
 * past or closed (latest first). Also the next appointment and the last visit, worked out from
 * the same list so the record stays right after a booking without another request.
 */
export function usePatientAppointmentSummary(patientId: string) {
  const query = usePatientAppointments(patientId)
  // When the record was opened. Fixed, so the lists don't reshuffle on every re-render.
  const [now] = useState(() => Date.now())
  const items = query.data?.items ?? []
  const open = (appointment: Appointment) =>
    (appointment.status === 'CONFIRMED' || appointment.status === 'REQUESTED') && Date.parse(appointment.endsAt) >= now
  // The API sends latest first. Upcoming reads best soonest first.
  const upcoming = items.filter(open).reverse()
  const earlier = items.filter((appointment) => !open(appointment))
  const lastVisit = items.find((appointment) => appointment.status === 'CONFIRMED' && Date.parse(appointment.endsAt) < now) ?? null
  return { query, upcoming, earlier, next: upcoming[0] ?? null, lastVisit }
}
