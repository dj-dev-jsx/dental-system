import { Link, useNavigate, useSearchParams } from 'react-router'
import { ArrowLeftIcon } from '../../components/icons'
import { formatDate, fullName, isDate, todayInManila } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { usePatient } from '../patients/queries'
import { AppointmentForm, type AppointmentValues } from './AppointmentForm'
import type { ChosenPatient } from './PatientPicker'
import { useCreateAppointment } from './queries'

/**
 * Staff booking an appointment, for a phone call or a walk-in. Opened from a patient's record
 * (?patientId=) the patient is already chosen; from the schedule (?date=) the day is.
 */
export default function NewAppointmentPage() {
  useDocumentTitle('Book appointment')
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const patientId = params.get('patientId') ?? ''
  const requestedDate = params.get('date')
  const date = isDate(requestedDate) && requestedDate >= todayInManila() ? requestedDate : undefined
  const createAppointment = useCreateAppointment()
  const back = patientId ? `/app/patients/${patientId}` : `/app/appointments${date ? `?date=${date}` : ''}`

  async function book({ reason, ...values }: AppointmentValues) {
    const appointment = await createAppointment.mutateAsync({ ...values, ...(reason ? { reason } : {}) })
    navigate(`/app/appointments/${appointment.id}`, { replace: true })
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to={back} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> {patientId ? 'Patient' : 'Schedule'}
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Book appointment</h1>
      <p className="mt-1 text-neutral-600">A booking made here is confirmed straight away.</p>
      {patientId ? (
        <ForPatient patientId={patientId} back={back} onSubmit={book} />
      ) : (
        <AppointmentForm initialDate={date} submitLabel="Book appointment" submittingLabel="Booking…" cancelTo={back} onSubmit={book} />
      )}
    </div>
  )
}

type ForPatientProps = { patientId: string; back: string; onSubmit: (values: AppointmentValues) => Promise<void> }

/** The form with the patient already chosen. An archived or unknown patient has to be picked again. */
function ForPatient({ patientId, back, onSubmit }: ForPatientProps) {
  const patient = usePatient(patientId)
  if (patient.isPending) return <div className="mt-8 h-64 rounded bg-neutral-100" aria-busy="true" />
  const record = patient.data
  const chosen: ChosenPatient | null =
    record && !record.archivedAt
      ? {
          id: record.id,
          name: fullName(record),
          detail: [`Born ${formatDate(record.birthDate)}`, record.phone].filter(Boolean).join(' · '),
        }
      : null
  return (
    <AppointmentForm initialPatient={chosen} submitLabel="Book appointment" submittingLabel="Booking…" cancelTo={back} onSubmit={onSubmit} />
  )
}
