import { type FormEvent, useEffect, useRef, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, textareaClass } from '../../components/forms'
import { errorMessage } from '../../lib/api'
import { manilaClock, manilaDate, minutesBetween } from '../../lib/format'
import { DentistField, WhenFields } from './AppointmentFields'
import { type FieldErrors, fieldErrorsFrom, hasPassed, readWhen } from './appointmentInput'
import { useCloseAppointment, useConfirmAppointment, useDentists } from './queries'
import { type Appointment, type AppointmentStatus, STATUS_LABELS } from './types'

/** A small label for anything that isn't a plain confirmed appointment. */
export function StatusTag({ status }: { status: AppointmentStatus }) {
  if (status === 'CONFIRMED') return null
  const strong = status === 'REQUESTED'
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-sm border px-1.5 text-xs/5 font-semibold ${
        strong ? 'border-neutral-950 text-neutral-950' : 'border-neutral-300 text-neutral-600'
      }`}
    >
      {STATUS_LABELS[status]}
    </span>
  )
}

/** Puts the cursor in the first box that needs fixing, after a refused save. */
function useFocusFirstError(errors: FieldErrors) {
  const formRef = useRef<HTMLFormElement>(null)
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])
  return formRef
}

type ConfirmProps = {
  appointment: Appointment
  onConfirmed: (appointment: Appointment) => void
  onBack: () => void
}

/**
 * Confirms a request. The dentist and time start as the patient asked, and can be changed
 * to whatever the clinic agreed with them.
 */
export function ConfirmPanel({ appointment, onConfirmed, onBack }: ConfirmProps) {
  const dentists = useDentists()
  const confirm = useConfirmAppointment()
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const formRef = useFocusFirstError(errors)
  const prefix = `confirm-${appointment.id}-`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { values, errors: missing } = readWhen(new FormData(event.currentTarget))
    setFormError(null)
    setErrors(missing)
    if (!values) return
    try {
      onConfirmed(await confirm.mutateAsync({ id: appointment.id, ...values }))
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else setFormError(errorMessage(error))
    }
  }

  const items = dentists.data?.items ?? []
  // Only one dentist? Then there's nothing to choose.
  const dentistId = appointment.dentist?.id ?? (items.length === 1 ? items[0].id : '')

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="@container mt-4 border-t border-neutral-200 pt-4">
      <h3 className="font-semibold">Confirm this appointment</h3>
      <p className="mt-0.5 text-sm text-neutral-600">
        If you agreed on another time or dentist with the patient, change it here first.
      </p>
      {formError && <ErrorBox className="mt-4">{formError}</ErrorBox>}
      {dentists.isPending ? (
        <div className="mt-4 h-[4.75rem] rounded bg-neutral-100" aria-busy="true" />
      ) : dentists.isError ? (
        <ErrorBox className="mt-4">{errorMessage(dentists.error)}</ErrorBox>
      ) : (
        <div className="mt-4 grid gap-4 @md:grid-cols-2 @4xl:grid-cols-4">
          <DentistField idPrefix={prefix} dentists={items} defaultValue={dentistId} current={appointment.dentist} error={errors.dentistId} />
          <WhenFields
            idPrefix={prefix}
            errors={errors}
            defaults={{
              // A day that has passed is left empty, so a new one has to be chosen.
              date: hasPassed(appointment) ? '' : manilaDate(appointment.startsAt),
              time: manilaClock(appointment.startsAt),
              duration: minutesBetween(appointment.startsAt, appointment.endsAt),
            }}
          />
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={confirm.isPending || !dentists.data} className={`${buttonOnLight} h-10 px-5 text-sm`}>
          {confirm.isPending ? 'Confirming…' : 'Confirm appointment'}
        </button>
        <button type="button" onClick={onBack} className={`${buttonOutline} h-10 px-4 text-sm`}>
          Back
        </button>
      </div>
    </form>
  )
}

const CLOSE_TEXT = {
  decline: {
    title: 'Decline this request?',
    action: 'Decline request',
    busy: 'Declining…',
    keep: 'Keep request',
    hint: 'Optional. For example: The clinic is closed that day.',
  },
  cancel: {
    title: 'Cancel this appointment?',
    action: 'Cancel appointment',
    busy: 'Cancelling…',
    keep: 'Keep appointment',
    hint: 'Optional. For example: The patient called to cancel.',
  },
}

type CloseProps = {
  appointment: Appointment
  action: 'decline' | 'cancel'
  onClosed: (appointment: Appointment) => void
  onBack: () => void
}

/** Declines a request or cancels an appointment, asking first, with an optional reason. */
export function ClosePanel({ appointment, action, onClosed, onBack }: CloseProps) {
  const close = useCloseAppointment()
  const text = CLOSE_TEXT[action]
  const noteId = `${action}-${appointment.id}-note`

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const note = String(new FormData(event.currentTarget).get('note') ?? '').trim()
    try {
      onClosed(await close.mutateAsync({ id: appointment.id, action, note: note || undefined }))
    } catch {
      // The error is shown from close.error below.
    }
  }

  return (
    <form noValidate onSubmit={handleSubmit} className="mt-4 border-t border-neutral-200 pt-4">
      <h3 className="font-semibold">{text.title}</h3>
      {close.isError && <ErrorBox className="mt-3">{errorMessage(close.error)}</ErrorBox>}
      <FormField id={noteId} label="Reason" hint={text.hint} className="mt-3 max-w-xl">
        <textarea id={noteId} name="note" maxLength={500} className={`${textareaClass} min-h-20`} {...fieldAria(noteId, undefined, text.hint)} />
      </FormField>
      <div className="mt-4 flex flex-wrap gap-3">
        <button type="submit" disabled={close.isPending} className={`${buttonOnLight} h-10 px-5 text-sm`}>
          {close.isPending ? text.busy : text.action}
        </button>
        <button type="button" onClick={onBack} className={`${buttonOutline} h-10 px-4 text-sm`}>
          {text.keep}
        </button>
      </div>
    </form>
  )
}
