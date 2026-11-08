import { type ReactNode, useState } from 'react'
import { Link, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { Page, PageHeader } from '../../components/Page'
import { None, Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import {
  dentistName,
  formatDateTime,
  formatDayLong,
  formatDayShort,
  formatTimeRange,
  fullName,
  manilaDate,
  minutesBetween,
} from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ROLE_LABELS } from '../auth/authStore'
import { ClosePanel, ConfirmPanel } from './AppointmentActions'
import { hasPassed } from './appointmentInput'
import { useAppointment, useAppointmentHistory } from './queries'
import { type Appointment, type AppointmentStatus, type History, type HistoryEntry, STATUS_LABELS } from './types'
import { waitedFor } from './waiting'

const CLOSED_TEXT = {
  DECLINED: 'This request was declined.',
  CANCELLED: 'This appointment was cancelled.',
} as const

const STATUS_TONE: Record<AppointmentStatus, 'solid' | 'outline' | 'muted'> = {
  REQUESTED: 'solid',
  CONFIRMED: 'outline',
  DECLINED: 'muted',
  CANCELLED: 'muted',
}

function minutesLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours ? `${hours} h` : '', rest ? `${rest} min` : ''].filter(Boolean).join(' ')
}

export default function AppointmentPage() {
  const { id = '' } = useParams()
  const { data: appointment, isPending, isError, error, refetch } = useAppointment(id)
  const [panel, setPanel] = useState<'confirm' | 'decline' | 'cancel' | null>(null)
  useDocumentTitle(appointment ? `Appointment: ${fullName(appointment.patient)}` : 'Appointment')

  if (isPending) {
    return (
      <Page narrow>
        <div aria-busy="true" aria-label="Loading the appointment">
          <div className="h-4 w-24 rounded bg-neutral-100" />
          <div className="mt-6 h-9 w-80 max-w-full rounded bg-neutral-100" />
          <div className="mt-3 h-6 w-64 rounded bg-neutral-100" />
          <div className="mt-10 h-40 rounded bg-neutral-100" />
        </div>
      </Page>
    )
  }
  if (isError) {
    return (
      <Page narrow>
        <PageHeader back={{ to: '/app/appointments', label: 'Schedule' }} title="Appointment not found" />
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <ErrorBox className="flex-1">{errorMessage(error)}</ErrorBox>
          <button type="button" onClick={() => void refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Try again
          </button>
        </div>
      </Page>
    )
  }

  const day = manilaDate(appointment.startsAt)
  const { status } = appointment
  const minutes = minutesBetween(appointment.startsAt, appointment.endsAt)

  return (
    <Page narrow>
      <PageHeader
        back={{ to: `/app/appointments?date=${day}`, label: `Schedule, ${formatDayShort(day)}` }}
        title={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link to={`/app/patients/${appointment.patient.id}`} className="hover:underline hover:underline-offset-4">
              {fullName(appointment.patient)}
            </Link>
            <Pill tone={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Pill>
          </span>
        }
        description={
          <>
            <span className="block text-xl font-semibold text-neutral-950">
              {formatDayLong(day)}, {formatTimeRange(appointment.startsAt, appointment.endsAt)}
            </span>
            <span className="mt-0.5 block">{appointment.dentist ? dentistName(appointment.dentist) : status === 'REQUESTED' ? 'Any dentist' : 'No dentist'}</span>
          </>
        }
      >
        {panel === null && (status === 'REQUESTED' || status === 'CONFIRMED') && (
          <div className="mt-5 flex flex-wrap gap-3">
            {status === 'REQUESTED' ? (
              <>
                <button type="button" onClick={() => setPanel('confirm')} className={`${buttonOnLight} h-10 px-5 text-sm`}>
                  Confirm…
                </button>
                <button type="button" onClick={() => setPanel('decline')} className={`${buttonOutline} h-10 px-4 text-sm`}>
                  Decline…
                </button>
              </>
            ) : (
              <>
                <Link to={`/app/appointments/${id}/edit`} className={`${buttonOnLight} h-10 px-5 text-sm`}>
                  Change
                </Link>
                <button type="button" onClick={() => setPanel('cancel')} className={`${buttonOutline} h-10 px-4 text-sm`}>
                  Cancel appointment…
                </button>
              </>
            )}
          </div>
        )}
      </PageHeader>

      {(status === 'DECLINED' || status === 'CANCELLED') && (
        <div className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
          <p className="font-semibold">{CLOSED_TEXT[status]}</p>
          {appointment.statusNote && <p className="whitespace-pre-line">{appointment.statusNote}</p>}
        </div>
      )}
      {status === 'REQUESTED' && (
        <div className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm/6">
          <p>
            <span className="font-semibold">Requested {waitedFor(appointment.createdAt)}, waiting for an answer.</span> It does not hold the dentist’s time until it is confirmed.
            {hasPassed(appointment) && ' Its day has passed, so confirm it at a new time or decline it.'}
          </p>
          {appointment.conflict && (
            <p className="mt-1 font-semibold">
              Dr. {appointment.conflict.dentist.lastName} is busy then, from {formatTimeRange(appointment.conflict.startsAt, appointment.conflict.endsAt)}. Choose another time when confirming.
            </p>
          )}
        </div>
      )}

      {panel === 'confirm' && <ConfirmPanel appointment={appointment} onBack={() => setPanel(null)} onConfirmed={() => setPanel(null)} />}
      {(panel === 'decline' || panel === 'cancel') && (
        <ClosePanel appointment={appointment} action={panel} onBack={() => setPanel(null)} onClosed={() => setPanel(null)} />
      )}

      <section className="mt-10" aria-labelledby="appt-details">
        <h2 id="appt-details" className="text-lg font-semibold">
          Details
        </h2>
        <dl className="mt-3 grid gap-x-8 border-t border-neutral-950 sm:grid-cols-2">
          <Fact label="Phone">{appointment.patient.phone}</Fact>
          <Fact label="Length">{minutesLabel(minutes)}</Fact>
          <Fact label="Reason" wide>
            {appointment.reason && <span className="whitespace-pre-line">{appointment.reason}</span>}
          </Fact>
          <Fact label="Booked">{formatDateTime(appointment.createdAt)}</Fact>
          <Fact label="Last changed">{formatDateTime(appointment.updatedAt)}</Fact>
          {appointment.patient.archivedAt && <Fact label="Patient">Archived</Fact>}
        </dl>
      </section>

      <Timeline appointment={appointment} />
    </Page>
  )
}

function Fact({ label, children, wide = false }: { label: string; children?: ReactNode; wide?: boolean }) {
  return (
    <div className={`grid gap-0.5 border-b border-neutral-200 py-3 ${wide ? 'sm:col-span-2' : ''}`}>
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="break-words">{children || <None />}</dd>
    </div>
  )
}

// --- Activity -----------------------------------------------------------------------------

type Line = { key: string; title: string; detail?: string; who?: string; at: string }

const person = (actor: HistoryEntry['actor']) => `${actor.firstName} ${actor.lastName} (${ROLE_LABELS[actor.role]})`

function describe(entry: HistoryEntry, dentists: History['dentists']): Pick<Line, 'title' | 'detail'> {
  const meta = entry.metadata
  const changes = meta?.changes ?? {}
  const dentist = (dentistId: string | null | undefined) => {
    const found = dentistId ? dentists[dentistId] : undefined
    return found ? dentistName(found) : 'no dentist'
  }
  const parts: string[] = []
  const start = changes['startsAt']
  const end = changes['endsAt']
  if (start && end && start.from && start.to && end.from && end.to) {
    parts.push(`Moved from ${formatDayShort(manilaDate(start.from))}, ${formatTimeRange(start.from, end.from)} to ${formatDayShort(manilaDate(start.to))}, ${formatTimeRange(start.to, end.to)}`)
  } else {
    if (start?.from && start.to) parts.push(`Start moved from ${formatDateTime(start.from)} to ${formatDateTime(start.to)}`)
    if (end?.from && end.to) parts.push(`End moved from ${formatDateTime(end.from)} to ${formatDateTime(end.to)}`)
  }
  if (changes['dentistId']) parts.push(`Dentist: ${dentist(changes['dentistId'].from)} to ${dentist(changes['dentistId'].to)}`)
  if (changes['reason']) parts.push(`Reason: ${changes['reason'].from ?? 'none'} to ${changes['reason'].to ?? 'none'}`)
  const note = changes['statusNote']?.to
  if (note) parts.push(`Note: ${note}`)

  switch (entry.action) {
    case 'APPOINTMENT_CREATED':
      return {
        title: 'Booked by staff',
        detail: meta?.startsAt && meta.endsAt ? `${formatDayShort(manilaDate(meta.startsAt))}, ${formatTimeRange(meta.startsAt, meta.endsAt)} with ${dentist(meta.dentistId)}` : undefined,
      }
    case 'APPOINTMENT_UPDATED':
      return { title: 'Changed', detail: parts.join('. ') || undefined }
    case 'APPOINTMENT_CONFIRMED':
      return { title: 'Confirmed', detail: parts.join('. ') || undefined }
    case 'APPOINTMENT_DECLINED':
      return { title: 'Declined', detail: note ?? undefined }
    case 'APPOINTMENT_CANCELLED':
      return { title: 'Cancelled', detail: note ?? undefined }
  }
}

/** Everything that happened to this appointment, oldest first, from the audit log. */
function Timeline({ appointment }: { appointment: Appointment }) {
  const history = useAppointmentHistory(appointment.id)
  const lines: Line[] = []
  if (history.data) {
    // Requests made online have no "booked" line of their own, so the first line says it arrived.
    if (history.data.items[0]?.action !== 'APPOINTMENT_CREATED') {
      const asked = appointment.status === 'REQUESTED' || appointment.status === 'DECLINED' || history.data.items.some((e) => e.action === 'APPOINTMENT_CONFIRMED')
      lines.push({ key: 'requested', title: asked ? 'Requested by the patient' : 'Created', at: appointment.createdAt })
    }
    for (const entry of history.data.items) {
      lines.push({ key: entry.id, ...describe(entry, history.data.dentists), who: person(entry.actor), at: entry.createdAt })
    }
  }

  return (
    <section className="mt-10" aria-labelledby="appt-activity">
      <h2 id="appt-activity" className="text-lg font-semibold">
        Activity
      </h2>
      <div className="mt-3 border-t border-neutral-950">
        {history.isError ? (
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <ErrorBox className="flex-1">{errorMessage(history.error)}</ErrorBox>
            <button type="button" onClick={() => void history.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        ) : history.isPending ? (
          <div className="space-y-3 pt-4" aria-busy="true" aria-label="Loading the activity">
            <div className="h-4 w-64 rounded bg-neutral-100" />
            <div className="h-4 w-48 rounded bg-neutral-100" />
          </div>
        ) : (
          <ol className="pt-2">
            {lines.map((line, index) => (
              <li key={line.key} className="relative grid grid-cols-[1rem_1fr] gap-x-4 pb-5 pt-2">
                {index < lines.length - 1 && <span className="absolute top-5 bottom-0 left-[0.4375rem] w-px bg-neutral-300" aria-hidden />}
                <span className={`relative mt-1.5 size-2.5 justify-self-center rounded-full ${index === lines.length - 1 ? 'bg-neutral-950' : 'border-2 border-neutral-400 bg-white'}`} aria-hidden />
                <div>
                  <p className="font-semibold">{line.title}</p>
                  {line.detail && <p className="text-neutral-700">{line.detail}</p>}
                  <p className="text-sm text-neutral-500">
                    {line.who ? `${line.who}, ` : ''}
                    <time dateTime={line.at}>{formatDateTime(line.at)}</time>
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  )
}
