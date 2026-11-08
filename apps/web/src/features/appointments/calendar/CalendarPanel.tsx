import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../../components/buttons'
import { ErrorBox } from '../../../components/ErrorBox'
import { FormField } from '../../../components/FormField'
import { fieldAria, textareaClass, textareaErrorClass } from '../../../components/forms'
import { CloseIcon } from '../../../components/icons'
import { errorMessage } from '../../../lib/api'
import { dentistName, formatDayLong, formatTimeRange, fullName, manilaDate } from '../../../lib/format'
import { useClinic } from '../../clinic/queries'
import { ClosePanel, ConfirmPanel, StatusTag } from '../AppointmentActions'
import { DentistField, WhenFields } from '../AppointmentFields'
import { type FieldErrors, fieldErrorsFrom, hasPassed, readWhen } from '../appointmentInput'
import { type ChosenPatient, PatientPicker } from '../PatientPicker'
import { useCreateAppointment, useDentists } from '../queries'
import type { Appointment } from '../types'
import { clockOf } from './calendarMath'

export type Selection =
  | { kind: 'new'; date: string; minutes: number; dentistId?: string }
  | { kind: 'appointment'; appointment: Appointment }

type Props = {
  selection: Selection
  onClose: () => void
  /** A booking was made, or an appointment changed: show it. */
  onShow: (appointment: Appointment) => void
}

/**
 * The panel beside the calendar: a quick booking for the slot that was clicked, or the
 * appointment that was clicked. The calendar stays in view, so the day keeps its context.
 */
export function CalendarPanel({ selection, onClose, onShow }: Props) {
  const panel = useRef<HTMLElement>(null)

  // Escape closes it, wherever the cursor is in the panel.
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  // Bring keyboard focus to the panel when it opens with something new.
  const key = selection.kind === 'new' ? `${selection.date}-${selection.minutes}-${selection.dentistId}` : selection.appointment.id
  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
  }, [key])

  return (
    <>
      {/* Below 1280px the panel covers the calendar; tapping beside it closes it. */}
      <div className="fixed inset-0 z-30 bg-black/30 xl:hidden" aria-hidden="true" onClick={onClose} />
      <aside
        ref={panel}
        aria-label={selection.kind === 'new' ? 'New appointment' : 'Appointment'}
        className="panel-in fixed inset-y-0 right-0 z-40 flex w-full max-w-md flex-col border-l border-neutral-950 bg-white xl:static xl:z-auto xl:w-[25rem] xl:max-w-none xl:shrink-0 xl:border-neutral-200"
      >
        {selection.kind === 'new' ? (
          <BookPanel key={key} selection={selection} onClose={onClose} onBooked={onShow} />
        ) : (
          <DetailsPanel key={key} appointment={selection.appointment} onClose={onClose} onChanged={onShow} />
        )}
      </aside>
    </>
  )
}

function PanelHeader({ title, children, onClose }: { title: string; children?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex shrink-0 items-start gap-3 border-b border-neutral-200 px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-xl font-bold tracking-[-0.02em] text-balance" data-autofocus tabIndex={-1}>
          {title}
        </h2>
        {children}
      </div>
      <button type="button" onClick={onClose} aria-label="Close panel" className="-mr-2 grid size-9 shrink-0 place-items-center rounded-md text-neutral-600 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2">
        <CloseIcon />
      </button>
    </div>
  )
}

type BookProps = {
  selection: Extract<Selection, { kind: 'new' }>
  onClose: () => void
  onBooked: (appointment: Appointment) => void
}

/** A booking for the slot that was clicked: the day, time and (in the day view) dentist are already filled in. */
function BookPanel({ selection, onClose, onBooked }: BookProps) {
  // New bookings start with the clinic's usual visit length.
  const defaultVisitMinutes = useClinic().data?.defaultVisitMinutes ?? 30
  const dentists = useDentists()
  const create = useCreateAppointment()
  const [patient, setPatient] = useState<ChosenPatient | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const form = useRef<HTMLFormElement>(null)

  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const { values, errors: missing } = readWhen(data)
    if (!patient) missing.patientId = 'Choose a patient.'
    setFormError(null)
    setErrors(missing)
    if (!values || !patient) return
    const reason = String(data.get('reason') ?? '').trim()
    try {
      onBooked(await create.mutateAsync({ ...values, patientId: patient.id, ...(reason ? { reason } : {}) }))
    } catch (error) {
      const fields = fieldErrorsFrom(error)
      if (Object.keys(fields).length > 0) setErrors(fields)
      else setFormError(errorMessage(error))
    }
  }

  const items = dentists.data?.items ?? []
  const dentistId = selection.dentistId ?? (items.length === 1 ? items[0].id : '')

  return (
    <>
      <PanelHeader title="New appointment" onClose={onClose}>
        <p className="mt-0.5 text-sm text-neutral-600">{formatDayLong(selection.date)}. Booked here, it’s confirmed straight away.</p>
      </PanelHeader>
      <form ref={form} noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {formError && <ErrorBox className="mb-5">{formError}</ErrorBox>}
          <PatientPicker chosen={patient} onChoose={setPatient} error={errors.patientId} />
          {dentists.isPending ? (
            <div className="mt-5 h-40 rounded bg-neutral-100" aria-busy="true" />
          ) : dentists.isError ? (
            <ErrorBox className="mt-5">{errorMessage(dentists.error)}</ErrorBox>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-4 [&>*:nth-child(-n+2)]:col-span-2">
              <DentistField idPrefix="panel-" dentists={items} defaultValue={dentistId} error={errors.dentistId} />
              <WhenFields idPrefix="panel-" errors={errors} defaults={{ date: selection.date, time: clockOf(selection.minutes), duration: defaultVisitMinutes }} />
            </div>
          )}
          <FormField id="panel-reason" label="Reason" hint="Optional. For example: Cleaning." error={errors.reason} className="mt-5">
            <textarea
              id="panel-reason"
              name="reason"
              maxLength={500}
              className={`${errors.reason ? textareaErrorClass : textareaClass} min-h-20`}
              {...fieldAria('panel-reason', errors.reason, 'hint')}
            />
          </FormField>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-neutral-200 px-5 py-4">
          <button type="submit" disabled={create.isPending || !dentists.data} className={`${buttonOnLight} h-10 px-5 text-sm`}>
            {create.isPending ? 'Booking…' : 'Book appointment'}
          </button>
          <button type="button" onClick={onClose} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Cancel
          </button>
        </div>
      </form>
    </>
  )
}

type DetailsProps = {
  appointment: Appointment
  onClose: () => void
  onChanged: (appointment: Appointment) => void
}

const CLOSED_TEXT = {
  DECLINED: 'This request was declined.',
  CANCELLED: 'This appointment was cancelled.',
} as const

/** The appointment that was clicked, with what can be done to it next. */
function DetailsPanel({ appointment, onClose, onChanged }: DetailsProps) {
  const [action, setAction] = useState<'confirm' | 'decline' | 'cancel' | null>(null)
  const { status } = appointment
  const day = manilaDate(appointment.startsAt)
  const done = (updated: Appointment) => {
    setAction(null)
    onChanged(updated)
  }

  return (
    <>
      <PanelHeader title={fullName(appointment.patient)} onClose={onClose}>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutral-600">
          <StatusTag status={status} />
          <span>
            {formatDayLong(day)}, {formatTimeRange(appointment.startsAt, appointment.endsAt)}
          </span>
        </p>
      </PanelHeader>
      <div className="flex-1 overflow-y-auto px-5 py-5">
        {(status === 'DECLINED' || status === 'CANCELLED') && (
          <div className="mb-5 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
            <p className="font-semibold">{CLOSED_TEXT[status]}</p>
            {appointment.statusNote && <p className="whitespace-pre-line">{appointment.statusNote}</p>}
          </div>
        )}
        {status === 'REQUESTED' && (
          <p className="mb-5 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
            A request doesn’t hold the time until it’s confirmed.
            {hasPassed(appointment) && ' Its day has passed: confirm it at a new time, or decline it.'}
          </p>
        )}

        <dl className="border-t border-neutral-950 text-sm">
          <Row label="Dentist">{appointment.dentist ? dentistName(appointment.dentist) : 'Any dentist'}</Row>
          <Row label="Reason">{appointment.reason ?? <span className="text-neutral-500">Not recorded</span>}</Row>
          <Row label="Mobile">{appointment.patient.phone ?? <span className="text-neutral-500">Not recorded</span>}</Row>
        </dl>

        {action === 'confirm' && <ConfirmPanel appointment={appointment} onBack={() => setAction(null)} onConfirmed={done} />}
        {(action === 'decline' || action === 'cancel') && (
          <ClosePanel appointment={appointment} action={action} onBack={() => setAction(null)} onClosed={done} />
        )}

        {action === null && (
          <div className="mt-6 flex flex-wrap gap-3">
            {status === 'REQUESTED' && (
              <>
                <button type="button" onClick={() => setAction('confirm')} className={`${buttonOnLight} h-10 px-5 text-sm`}>
                  Confirm…
                </button>
                <button type="button" onClick={() => setAction('decline')} className={`${buttonOutline} h-10 px-4 text-sm`}>
                  Decline…
                </button>
              </>
            )}
            {status === 'CONFIRMED' && (
              <>
                <Link to={`/app/appointments/${appointment.id}/edit`} className={`${buttonOnLight} h-10 px-5 text-sm`}>
                  Change
                </Link>
                <button type="button" onClick={() => setAction('cancel')} className={`${buttonOutline} h-10 px-4 text-sm`}>
                  Cancel appointment…
                </button>
              </>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-2 border-t border-neutral-200 pt-4 text-sm font-medium">
          <Link to={`/app/patients/${appointment.patient.id}/chart`} className="underline underline-offset-3 hover:no-underline">
            Open the dental chart
          </Link>
          <Link to={`/app/patients/${appointment.patient.id}`} className="underline underline-offset-3 hover:no-underline">
            Open the patient’s record
          </Link>
          <Link to={`/app/appointments/${appointment.id}`} className="underline underline-offset-3 hover:no-underline">
            Open the appointment page
          </Link>
        </div>
      </div>
    </>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-3 border-b border-neutral-200 py-2.5">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}
