import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { fullName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { AppointmentForm } from './AppointmentForm'
import { useAppointment, useUpdateAppointment } from './queries'
import type { AppointmentChanges } from './types'

/** Moves a confirmed appointment, or changes its dentist or reason. */
export default function EditAppointmentPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: appointment, isPending, isError, error } = useAppointment(id)
  const updateAppointment = useUpdateAppointment()
  useDocumentTitle('Change appointment')
  const back = `/app/appointments/${id}`

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> Appointment
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Change appointment</h1>
      {isPending ? (
        <div className="mt-8 h-64 rounded bg-neutral-100" aria-busy="true" />
      ) : isError ? (
        <p className="mt-2 text-neutral-600">{errorMessage(error)}</p>
      ) : appointment.status !== 'CONFIRMED' ? (
        <p className="mt-2 text-neutral-600">
          Only a confirmed appointment can be changed here. A request is changed while confirming it.
        </p>
      ) : (
        <>
          <p className="mt-1 text-neutral-600">For {fullName(appointment.patient)}.</p>
          <AppointmentForm
            appointment={appointment}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            cancelTo={back}
            onSubmit={async ({ dentistId, startsAt, endsAt, reason }) => {
              // Only what changed is sent, so the log shows exactly what was moved.
              const changes: AppointmentChanges = {}
              if (dentistId !== appointment.dentist?.id) changes.dentistId = dentistId
              if (Date.parse(startsAt) !== Date.parse(appointment.startsAt)) changes.startsAt = startsAt
              if (Date.parse(endsAt) !== Date.parse(appointment.endsAt)) changes.endsAt = endsAt
              if (reason !== appointment.reason) changes.reason = reason
              if (Object.keys(changes).length > 0) await updateAppointment.mutateAsync({ id, ...changes })
              navigate(back, { replace: true })
            }}
          />
        </>
      )}
    </div>
  )
}
