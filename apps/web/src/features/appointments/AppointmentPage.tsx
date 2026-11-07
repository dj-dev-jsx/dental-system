import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { Detail, Details } from '../../components/Details'
import { ArrowLeftIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { dentistName, formatDateTime, formatDayLong, formatTimeRange, fullName, manilaDate } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ClosePanel, ConfirmPanel, StatusTag } from './AppointmentActions'
import { hasPassed } from './appointmentInput'
import { useAppointment } from './queries'

const CLOSED_TEXT = {
  DECLINED: 'This request was declined.',
  CANCELLED: 'This appointment was cancelled.',
} as const

export default function AppointmentPage() {
  const { id = '' } = useParams()
  const { data: appointment, isPending, isError, error } = useAppointment(id)
  const [panel, setPanel] = useState<'confirm' | 'decline' | 'cancel' | null>(null)
  useDocumentTitle(appointment ? `Appointment: ${fullName(appointment.patient)}` : 'Appointment')

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8" aria-busy="true" aria-label="Loading the appointment">
        <div className="h-4 w-24 rounded bg-neutral-100" />
        <div className="mt-6 h-9 w-80 max-w-full rounded bg-neutral-100" />
        <div className="mt-10 h-48 rounded bg-neutral-100" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link to="/app/appointments" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeftIcon className="size-4" /> Schedule
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Appointment not found</h1>
        <p className="mt-2 text-neutral-600">{errorMessage(error)}</p>
      </div>
    )
  }

  const day = manilaDate(appointment.startsAt)
  const { status } = appointment

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to={`/app/appointments?date=${day}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> Schedule
      </Link>

      {(status === 'DECLINED' || status === 'CANCELLED') && (
        <div className="mt-5 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
          <p className="font-semibold">{CLOSED_TEXT[status]}</p>
          {appointment.statusNote && <p className="whitespace-pre-line">{appointment.statusNote}</p>}
        </div>
      )}
      {status === 'REQUESTED' && (
        <div className="mt-5 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
          <p>
            <span className="font-semibold">This is a request, waiting for an answer.</span> It doesn’t hold the dentist’s time until it’s confirmed.
            {hasPassed(appointment) && ' Its day has passed, so confirm it at a new time or decline it.'}
          </p>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex flex-wrap items-center gap-x-3 text-3xl font-bold tracking-[-0.02em] text-balance">
            {fullName(appointment.patient)}
            <StatusTag status={status} />
          </h1>
          <p className="mt-1 text-neutral-600">
            {formatDayLong(day)}, {formatTimeRange(appointment.startsAt, appointment.endsAt)}
          </p>
        </div>
        {panel === null && (
          <div className="flex flex-wrap gap-3">
            {status === 'REQUESTED' && (
              <>
                <button type="button" onClick={() => setPanel('confirm')} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  Confirm…
                </button>
                <button type="button" onClick={() => setPanel('decline')} className={`${buttonOutline} h-9 px-4 text-sm`}>
                  Decline…
                </button>
              </>
            )}
            {status === 'CONFIRMED' && (
              <>
                <Link to={`/app/appointments/${id}/edit`} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  Change
                </Link>
                <button type="button" onClick={() => setPanel('cancel')} className={`${buttonOutline} h-9 px-4 text-sm`}>
                  Cancel appointment…
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {panel === 'confirm' && <ConfirmPanel appointment={appointment} onBack={() => setPanel(null)} onConfirmed={() => setPanel(null)} />}
      {(panel === 'decline' || panel === 'cancel') && (
        <ClosePanel appointment={appointment} action={panel} onBack={() => setPanel(null)} onClosed={() => setPanel(null)} />
      )}

      <div className="mt-10 grid gap-10">
        <Details title="Appointment">
          <Detail label="Date">{formatDayLong(day)}</Detail>
          <Detail label="Time">
            {formatTimeRange(appointment.startsAt, appointment.endsAt)}
          </Detail>
          <Detail label="Dentist">{appointment.dentist ? dentistName(appointment.dentist) : status === 'REQUESTED' && 'Any dentist'}</Detail>
          <Detail label="Reason">{appointment.reason && <span className="whitespace-pre-line">{appointment.reason}</span>}</Detail>
        </Details>

        <Details title="Patient">
          <Detail label="Name">
            <Link to={`/app/patients/${appointment.patient.id}`} className="font-semibold underline underline-offset-3 hover:no-underline">
              {fullName(appointment.patient)}
            </Link>
            {appointment.patient.archivedAt && <span className="text-neutral-500"> (archived)</span>}
          </Detail>
          <Detail label="Mobile or phone">{appointment.patient.phone}</Detail>
        </Details>

        <Details title="Record">
          <Detail label="Booked">{formatDateTime(appointment.createdAt)}</Detail>
          <Detail label="Last changed">{formatDateTime(appointment.updatedAt)}</Detail>
        </Details>
      </div>
    </div>
  )
}
