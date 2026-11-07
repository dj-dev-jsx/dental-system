import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, textareaClass, textareaErrorClass } from '../../components/forms'
import { errorMessage } from '../../lib/api'
import { fullName, manilaClock, manilaDate, minutesBetween, todayInManila } from '../../lib/format'
import { DentistField, WhenFields } from './AppointmentFields'
import { type ChosenPatient, PatientPicker } from './PatientPicker'
import { type FieldErrors, fieldErrorsFrom, readWhen } from './appointmentInput'
import { useDentists } from './queries'
import type { Appointment } from './types'

export type AppointmentValues = {
  patientId: string
  dentistId: string
  startsAt: string
  endsAt: string
  reason: string | null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-neutral-950 pt-5">
      <legend className="float-left w-full text-lg font-semibold">{title}</legend>
      <div className="clear-both grid gap-5 pt-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

type Props = {
  /** The appointment being changed. Leave it out to book a new one. */
  appointment?: Appointment
  /** For a new booking opened from a patient's record. */
  initialPatient?: ChosenPatient | null
  initialDate?: string
  submitLabel: string
  submittingLabel: string
  cancelTo: string
  onSubmit: (values: AppointmentValues) => Promise<unknown>
}

export function AppointmentForm({ appointment, initialPatient = null, initialDate, submitLabel, submittingLabel, cancelTo, onSubmit }: Props) {
  const dentists = useDentists()
  const [patient, setPatient] = useState<ChosenPatient | null>(
    appointment ? { id: appointment.patient.id, name: fullName(appointment.patient), detail: '' } : initialPatient,
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const { values, errors: missing } = readWhen(form)
    if (!patient) missing.patientId = 'Choose a patient.'
    setFormError(null)
    if (!values || !patient) {
      setErrors(missing)
      setFormError('Some details are missing. They’re marked below.')
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const reason = String(form.get('reason') ?? '').trim()
      await onSubmit({ ...values, patientId: patient.id, reason: reason || null })
      // On success the page moves on.
    } catch (error) {
      setSubmitting(false)
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
        setFormError('Some details need fixing. They’re marked below.')
      } else {
        setFormError(errorMessage(error))
      }
    }
  }

  const when = appointment
    ? {
        date: manilaDate(appointment.startsAt),
        time: manilaClock(appointment.startsAt),
        duration: minutesBetween(appointment.startsAt, appointment.endsAt),
      }
    : { date: initialDate ?? todayInManila(), time: '09:00', duration: 30 }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-10">
      {formError && <ErrorBox>{formError}</ErrorBox>}

      <fieldset className="border-t border-neutral-950 pt-5">
        <legend className="float-left w-full text-lg font-semibold">Patient</legend>
        <div className="clear-both pt-4">
          {appointment ? (
            <p className="font-semibold">{fullName(appointment.patient)}</p>
          ) : (
            <PatientPicker chosen={patient} onChoose={setPatient} error={errors.patientId} />
          )}
        </div>
      </fieldset>

      <Section title="Dentist and time">
        {dentists.isPending ? (
          <div className="h-[4.75rem] rounded bg-neutral-100 sm:col-span-2" aria-busy="true" />
        ) : dentists.isError ? (
          <ErrorBox className="sm:col-span-2">{errorMessage(dentists.error)}</ErrorBox>
        ) : dentists.data.items.length === 0 && !appointment ? (
          <p className="text-neutral-600 sm:col-span-2">
            There are no dentists set up for this clinic yet. Ask your clinic admin to add one.
          </p>
        ) : (
          <>
            <DentistField
              dentists={dentists.data.items}
              defaultValue={appointment?.dentist?.id ?? (dentists.data.items.length === 1 ? dentists.data.items[0].id : '')}
              current={appointment?.dentist}
              error={errors.dentistId}
            />
            <WhenFields defaults={when} errors={errors} />
          </>
        )}
      </Section>

      <fieldset className="border-t border-neutral-950 pt-5">
        <legend className="float-left w-full text-lg font-semibold">Reason for the visit</legend>
        <FormField id="reason" label="Reason" hint="Optional. For example: Cleaning, or Tooth ache, lower left." error={errors.reason} className="clear-both pt-4">
          <textarea
            id="reason"
            name="reason"
            maxLength={500}
            defaultValue={appointment?.reason ?? ''}
            className={errors.reason ? textareaErrorClass : textareaClass}
            {...fieldAria('reason', errors.reason, 'hint')}
          />
        </FormField>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-6">
        <button type="submit" disabled={submitting || !dentists.data} className={`${buttonOnLight} h-11 px-6`}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link to={cancelTo} className={`${buttonOutline} h-11 px-5`}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
