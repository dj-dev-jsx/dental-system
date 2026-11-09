import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, textareaClass, textareaErrorClass } from '../../components/forms'
import { errorMessage } from '../../lib/api'
import {
  dentistName,
  formatDayShort,
  formatTimeRange,
  fullName,
  manilaClock,
  manilaDate,
  manilaMoment,
  minutesBetween,
  todayInManila,
} from '../../lib/format'
import { useClinic } from '../clinic/queries'
import { DentistField, WhenFields } from './AppointmentFields'
import { type ChosenPatient, PatientPicker } from './PatientPicker'
import { type FieldErrors, fieldErrorsFrom, readWhen } from './appointmentInput'
import { useAvailability, useDentists } from './queries'
import { whoName } from './requester'
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
      <div className="clear-both pt-4">{children}</div>
    </fieldset>
  )
}

type Watched = { dentistId: string; date: string; time: string; duration: number }

/** A value that follows another one a moment later, so a form being typed in isn't asked about on every key. */
function useDebounced<T>(value: T, ms: number) {
  const [later, setLater] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setLater(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return later
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
  // A new booking starts with the clinic's usual visit length (30 minutes until it loads).
  const defaultVisitMinutes = useClinic().data?.defaultVisitMinutes ?? 30
  const [patient, setPatient] = useState<ChosenPatient | null>(
    appointment?.patient ? { id: appointment.patient.id, name: fullName(appointment.patient), detail: '' } : initialPatient,
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  const when = appointment
    ? {
        date: manilaDate(appointment.startsAt),
        time: manilaClock(appointment.startsAt),
        duration: minutesBetween(appointment.startsAt, appointment.endsAt),
      }
    : { date: initialDate ?? todayInManila(), time: '09:00', duration: defaultVisitMinutes }

  // What the boxes hold right now, to show what is being booked and to ask if the dentist is free.
  const [watched, setWatched] = useState<Watched>({
    dentistId: appointment?.dentist?.id ?? '',
    ...when,
  })
  function sync() {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    setWatched({
      dentistId: String(data.get('dentistId') ?? ''),
      date: String(data.get('date') ?? ''),
      time: String(data.get('time') ?? ''),
      duration: Number(data.get('duration')) || when.duration,
    })
  }
  // The boxes appear once the dentists load, and a lone dentist is chosen for you.
  useEffect(sync, [dentists.data, defaultVisitMinutes]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = watched.dentistId !== '' && watched.date >= todayInManila() && /^\d{2}:\d{2}$/.test(watched.time)
  const askKey = ready ? `${watched.dentistId}|${watched.date}|${watched.time}|${watched.duration}` : ''
  const laterKey = useDebounced(askKey, 400)
  const ask = useMemo(() => {
    if (!laterKey) return null
    const [dentistId, date, time, duration] = laterKey.split('|')
    return {
      dentistId,
      startsAt: manilaMoment(date, time),
      endsAt: manilaMoment(date, time, Number(duration)),
      ...(appointment ? { exceptId: appointment.id } : {}),
    }
  }, [laterKey, appointment])
  const availability = useAvailability(ask)

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

  const dentist = dentists.data?.items.find((d) => d.id === watched.dentistId) ?? (appointment?.dentist?.id === watched.dentistId ? appointment.dentist : null)
  const chosenDentist = dentist ? dentistName(dentist) : null
  const dateOk = Boolean(watched.date) && /^\d{2}:\d{2}$/.test(watched.time)
  const summary = (
    <>
      <span className="font-semibold">{patient?.name ?? 'No patient chosen'}</span>
      {' with '}
      <span className="font-semibold">{chosenDentist ?? 'no dentist yet'}</span>
      {dateOk && (
        <>
          {', '}
          {formatDayShort(watched.date)}, {formatTimeRange(manilaMoment(watched.date, watched.time), manilaMoment(watched.date, watched.time, watched.duration))}
        </>
      )}
    </>
  )

  // Is the dentist free? The answer lags a moment behind the boxes, so say so while it catches up.
  const checking = ready && (laterKey !== askKey || availability.isPending || availability.isFetching)
  const answer = availability.data
  function chooseTime(startsAt: string) {
    const input = formRef.current?.elements.namedItem('time')
    if (input instanceof HTMLInputElement) input.value = manilaClock(startsAt)
    sync()
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} onChange={sync} className="mt-8 flex flex-col gap-9">
      {formError && <ErrorBox>{formError}</ErrorBox>}

      <Section title="Patient">
        {appointment ? (
          <p className="font-semibold">{whoName(appointment)}</p>
        ) : (
          <PatientPicker chosen={patient} onChoose={setPatient} error={errors.patientId} />
        )}
      </Section>

      <Section title="Dentist and time">
        {dentists.isPending ? (
          <div className="h-[4.75rem] rounded bg-neutral-100" aria-busy="true" />
        ) : dentists.isError ? (
          <div className="flex flex-wrap items-center gap-4">
            <ErrorBox className="flex-1">{errorMessage(dentists.error)}</ErrorBox>
            <button type="button" onClick={() => void dentists.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : dentists.data.items.length === 0 && !appointment ? (
          <p className="text-neutral-600">There are no dentists set up for this clinic yet. Ask your clinic admin to add one.</p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <DentistField
                dentists={dentists.data.items}
                defaultValue={appointment?.dentist?.id ?? (dentists.data.items.length === 1 ? dentists.data.items[0].id : '')}
                current={appointment?.dentist}
                error={errors.dentistId}
              />
            </div>
            <WhenFields defaults={when} errors={errors} />
          </div>
        )}
      </Section>

      <Section title="Reason for the visit">
        <FormField id="reason" label="Reason" hint="Optional. For example: Cleaning, or Tooth ache, lower left." error={errors.reason}>
          <textarea
            id="reason"
            name="reason"
            maxLength={500}
            defaultValue={appointment?.reason ?? ''}
            className={errors.reason ? textareaErrorClass : textareaClass}
            {...fieldAria('reason', errors.reason, 'hint')}
          />
        </FormField>
      </Section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-neutral-200 bg-white/95 px-5 py-4 backdrop-blur sm:mx-0 sm:px-0">
        <p className="text-sm/6 text-neutral-700">{summary}</p>
        <div className="min-h-6 text-sm/6" aria-live="polite">
          {!ready ? null : checking && !answer ? (
            <span className="text-neutral-500">Checking the schedule…</span>
          ) : answer?.free ? (
            <span className={checking ? 'text-neutral-500' : 'font-semibold'}>{chosenDentist} is free.</span>
          ) : answer?.clash ? (
            <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${checking ? 'opacity-60' : ''}`}>
              <span className="font-semibold">
                {chosenDentist} already has an appointment from {formatTimeRange(answer.clash.startsAt, answer.clash.endsAt)}.
              </span>
              {answer.suggestions.length > 0 ? (
                <>
                  <span>Try</span>
                  {answer.suggestions.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => chooseTime(slot.startsAt)}
                      className="rounded-sm border border-neutral-300 px-2 text-sm/6 font-semibold outline-neutral-950 hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2"
                    >
                      {formatTimeRange(slot.startsAt, slot.endsAt)}
                    </button>
                  ))}
                </>
              ) : (
                <span>No other time is free that day.</span>
              )}
            </span>
          ) : availability.isError ? (
            <span className="text-neutral-500">Could not check the schedule. The booking is checked again when you save.</span>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={submitting || !dentists.data} className={`${buttonOnLight} h-11 px-6`}>
            {submitting ? submittingLabel : submitLabel}
          </button>
          <Link to={cancelTo} className={`${buttonOutline} h-11 px-5`}>
            Cancel
          </Link>
        </div>
      </div>
    </form>
  )
}
