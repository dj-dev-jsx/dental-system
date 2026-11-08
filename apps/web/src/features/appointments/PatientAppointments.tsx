import { useState } from 'react'
import { Link } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { PlusIcon } from '../../components/icons'
import { None, Pill, RowLink, Sub, Table, Td, Tr } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { dentistName, formatDate, formatTimeRange, manilaDate } from '../../lib/format'
import { RecordSection } from '../patients/RecordSection'
import { usePatientAppointmentSummary } from './usePatientAppointmentSummary'
import { type Appointment, type AppointmentStatus, STATUS_LABELS } from './types'

const EARLIER_SHOWN = 5

const TONES: Record<AppointmentStatus, 'solid' | 'outline' | 'muted'> = {
  REQUESTED: 'solid',
  CONFIRMED: 'outline',
  DECLINED: 'muted',
  CANCELLED: 'muted',
}

/** The appointments on a patient's record, as a compact table: upcoming first, then earlier ones. */
export function PatientAppointments({ patientId, canBook }: { patientId: string; canBook: boolean }) {
  const { query, upcoming, earlier } = usePatientAppointmentSummary(patientId)
  const { isPending, isError, error, refetch } = query
  const [showAll, setShowAll] = useState(false)
  const shownEarlier = showAll ? earlier : earlier.slice(0, EARLIER_SHOWN)
  const total = upcoming.length + earlier.length

  return (
    <RecordSection
      title="Appointments"
      action={
        canBook && (
          <Link to={`/app/appointments/new?patientId=${patientId}`} className={`${buttonOutline} h-8 px-3 text-sm`}>
            <PlusIcon className="size-4" /> Book appointment
          </Link>
        )
      }
    >
      {isPending ? (
        <div className="space-y-3 py-4" aria-busy="true" aria-label="Loading appointments">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 w-full max-w-lg rounded bg-neutral-100" />
          ))}
        </div>
      ) : isError ? (
        <p className="flex flex-wrap items-center gap-3 py-4 text-sm" role="alert">
          {errorMessage(error)}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-3">
            Try again
          </button>
        </p>
      ) : total === 0 ? (
        <p className="py-4 text-neutral-600">No appointments yet.</p>
      ) : (
        <Table label="Appointments">
          <thead className="sr-only">
            <tr>
              <th scope="col">When</th>
              <th scope="col">Dentist</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {upcoming.length === 0 && (
              <tr className="border-b border-neutral-200">
                <td colSpan={4} className="py-3 text-neutral-600">
                  Nothing booked.
                </td>
              </tr>
            )}
            {upcoming.map((appointment) => (
              <Row key={appointment.id} appointment={appointment} />
            ))}
            {earlier.length > 0 && (
              <tr className="border-b border-neutral-200">
                <th colSpan={4} scope="colgroup" className="pt-5 pb-2 text-left text-sm font-medium text-neutral-600">
                  Earlier and closed
                </th>
              </tr>
            )}
            {shownEarlier.map((appointment) => (
              <Row key={appointment.id} appointment={appointment} past />
            ))}
          </tbody>
        </Table>
      )}
      {earlier.length > EARLIER_SHOWN && (
        <button
          type="button"
          onClick={() => setShowAll((value) => !value)}
          aria-expanded={showAll}
          className="mt-3 text-sm font-semibold text-neutral-700 underline underline-offset-3 hover:text-neutral-950"
        >
          {showAll ? `Show the latest ${EARLIER_SHOWN}` : `Show all ${earlier.length} earlier`}
        </button>
      )}
    </RecordSection>
  )
}

function Row({ appointment, past = false }: { appointment: Appointment; past?: boolean }) {
  return (
    <Tr muted={past}>
      <Td primary>
        <RowLink to={`/app/appointments/${appointment.id}`}>{formatDate(manilaDate(appointment.startsAt))}</RowLink>
        <Sub>{formatTimeRange(appointment.startsAt, appointment.endsAt)}</Sub>
      </Td>
      <Td>{appointment.dentist ? dentistName(appointment.dentist) : <span className="text-neutral-500">Any dentist</span>}</Td>
      <Td hideBelow="md">{appointment.reason ?? <None />}</Td>
      <Td align="right">
        <Pill tone={TONES[appointment.status]}>{STATUS_LABELS[appointment.status]}</Pill>
      </Td>
    </Tr>
  )
}
