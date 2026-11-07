import { useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight } from '../../components/buttons'
import { PlusIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { dentistName, formatDate, formatTimeRange, manilaDate } from '../../lib/format'
import { StatusTag } from './AppointmentActions'
import { usePatientAppointments } from './queries'
import type { Appointment } from './types'

/** The appointments on a patient's record: what's coming up, then what's past or closed. */
export function PatientAppointments({ patientId, canBook }: { patientId: string; canBook: boolean }) {
  const { data, isPending, isError, error } = usePatientAppointments(patientId)
  // When the record was opened. Fixed, so the lists don't reshuffle on every re-render.
  const [now] = useState(() => Date.now())
  const items = data?.items ?? []
  const open = (appointment: Appointment) =>
    (appointment.status === 'CONFIRMED' || appointment.status === 'REQUESTED') && Date.parse(appointment.endsAt) >= now
  // The API sends latest first. Upcoming reads best soonest first.
  const upcoming = items.filter(open).reverse()
  const earlier = items.filter((appointment) => !open(appointment))

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">Appointments</h2>
        {canBook && (
          <Link to={`/app/appointments/new?patientId=${patientId}`} className={`${buttonOnLight} h-9 px-4 text-sm`}>
            <PlusIcon className="size-4" /> Book appointment
          </Link>
        )}
      </div>
      {isPending ? (
        <div className="mt-3 h-24 rounded bg-neutral-100" aria-busy="true" />
      ) : isError ? (
        <p className="mt-3 text-sm" role="alert">{errorMessage(error)}</p>
      ) : items.length === 0 ? (
        <p className="mt-3 border-t border-neutral-950 py-4 text-neutral-600">No appointments yet.</p>
      ) : (
        <>
          <Rows title="Coming up" appointments={upcoming} empty="Nothing booked." />
          {earlier.length > 0 && <Rows title="Earlier and cancelled" appointments={earlier} />}
        </>
      )}
    </section>
  )
}

function Rows({ title, appointments, empty }: { title: string; appointments: Appointment[]; empty?: string }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-neutral-600">{title}</h3>
      {appointments.length === 0 ? (
        <p className="mt-2 border-t border-neutral-950 py-3 text-sm text-neutral-500">{empty}</p>
      ) : (
        <ol className="mt-2 border-t border-neutral-950">
          {appointments.map((appointment) => (
            <li key={appointment.id} className="border-b border-neutral-200">
              <Link
                to={`/app/appointments/${appointment.id}`}
                className="grid gap-x-6 gap-y-0.5 px-1 py-3 outline-neutral-950 hover:bg-neutral-50 focus-visible:outline-2 sm:grid-cols-[15.5rem_minmax(0,1fr)_auto]"
              >
                <span className="font-medium">
                  {formatDate(manilaDate(appointment.startsAt))}, {formatTimeRange(appointment.startsAt, appointment.endsAt)}
                </span>
                <span className="min-w-0 text-neutral-700">
                  {appointment.dentist ? dentistName(appointment.dentist) : 'Any dentist'}
                  {appointment.reason && <span className="text-neutral-500"> · {appointment.reason}</span>}
                </span>
                <StatusTag status={appointment.status} />
              </Link>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
