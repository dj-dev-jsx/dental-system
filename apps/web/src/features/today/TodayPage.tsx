import { type ReactNode, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { ArrowRightIcon, PlusIcon } from '../../components/icons'
import { Page } from '../../components/Page'
import { Segmented } from '../../components/Segmented'
import { Pill } from '../../components/Table'
import { errorMessage } from '../../lib/api'
import { addDays, formatDayShort, formatTimeRange, fullName, manilaClock, manilaDate, manilaMoment, todayInManila } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useRequests, useSchedule } from '../appointments/queries'
import type { Appointment } from '../appointments/types'
import { overdueReason, waitedFor } from '../appointments/waiting'
import { useStaffUser } from '../auth/authStore'
import { useClinic } from '../clinic/queries'

const TIME = new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' })
const DAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

const time = (iso: string) => TIME.format(new Date(iso))
const clockLabel = (date: string, minutes: number) =>
  time(manilaMoment(date, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`))
const shortDentist = (appointment: Appointment) => (appointment.dentist ? `Dr. ${appointment.dentist.lastName}` : 'Any dentist')
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** The time now, ticking each half minute so the "now" line and past appointments keep up. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

type Scope = 'mine' | 'everyone'

/**
 * The home page: what the front desk needs at the start of the day and after every patient.
 * Today's appointments in order, with a line at the present minute; the requests waiting for
 * an answer; and a look at tomorrow.
 */
export default function TodayPage() {
  useDocumentTitle('Today')
  const user = useStaffUser()
  const isDentist = user.role === 'DENTIST'
  const [scope, setScope] = useState<Scope>(isDentist ? 'mine' : 'everyone')
  const now = useNow()
  const today = todayInManila()
  const tomorrow = addDays(today, 1)

  const schedule = useSchedule({ from: today, to: tomorrow, dentistId: '' })
  const requests = useRequests()
  const clinic = useClinic().data

  const mine = scope === 'mine'
  const inScope = (appointment: Appointment) => !mine || appointment.dentist?.id === user.id
  const items = [...(schedule.data?.items ?? [])].filter(inScope).sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
  const todays = items.filter((appointment) => manilaDate(appointment.startsAt) === today)
  const tomorrows = items.filter((appointment) => manilaDate(appointment.startsAt) === tomorrow)
  const upcoming = todays.filter((appointment) => Date.parse(appointment.endsAt) > now)

  const waiting = [...(requests.data?.items ?? [])].sort((a, b) => {
    const urgent = Number(Boolean(overdueReason(b, now))) - Number(Boolean(overdueReason(a, now)))
    return urgent || Date.parse(a.createdAt) - Date.parse(b.createdAt)
  })
  const overdue = waiting.filter((request) => overdueReason(request, now)).length

  const hour = Number(manilaClock(new Date(now).toISOString()).slice(0, 2))
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <Page>
      <header>
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">
          {greeting}, {user.firstName}
        </h1>
        <p className="mt-1.5 text-neutral-600">
          {DAY.format(new Date(`${today}T00:00:00Z`))}
          {clinic && <OpenToday today={today} opensAt={clinic.opensAt} closesAt={clinic.closesAt} now={now} />}
        </p>
      </header>

      {/* Three figures, read left to right like a line of a ledger. */}
      <dl className="mt-8 grid grid-cols-3 border-y border-neutral-200">
        <Figure
          label={mine ? 'Your appointments today' : 'Appointments today'}
          value={schedule.isPending ? null : todays.length}
          detail={
            schedule.isPending
              ? null
              : todays.length === 0
                ? 'Nothing booked'
                : upcoming.length === 0
                  ? 'All done for the day'
                  : `${upcoming.length} still to come, next at ${time(upcoming[0].startsAt)}`
          }
        />
        <Figure
          label="Requests waiting"
          to="/app/requests"
          value={requests.isPending ? null : (requests.data?.total ?? waiting.length)}
          detail={
            requests.isPending
              ? null
              : waiting.length === 0
                ? 'All answered'
                : overdue > 0
                  ? `${overdue} overdue: answer these first`
                  : `Oldest asked ${waitedFor(waiting[0].createdAt, now)}`
          }
        />
        <Figure
          label={mine ? 'Yours tomorrow' : 'Booked tomorrow'}
          to={`/app/appointments?date=${tomorrow}`}
          value={schedule.isPending ? null : tomorrows.length}
          detail={schedule.isPending ? null : tomorrows.length === 0 ? formatDayShort(tomorrow) : `${formatDayShort(tomorrow)}, first at ${time(tomorrows[0].startsAt)}`}
        />
      </dl>

      <div className="mt-12 grid gap-x-12 gap-y-14 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_23rem]">
        <section aria-labelledby="today-agenda">
          <SectionHeading
            id="today-agenda"
            title="Today’s appointments"
            aside={
              isDentist && (
                <Segmented
                  label="Whose appointments"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'mine', label: 'Mine' },
                    { value: 'everyone', label: 'Everyone' },
                  ]}
                />
              )
            }
          />
          {schedule.isPending ? (
            <RowsSkeleton rows={5} />
          ) : schedule.isError ? (
            <LoadError error={schedule.error} retry={() => void schedule.refetch()} />
          ) : todays.length === 0 ? (
            <div className="py-10">
              <p className="text-lg font-semibold">{mine ? 'Nothing booked with you today' : 'No appointments today'}</p>
              <p className="mt-1 max-w-md text-neutral-600">
                {mine ? 'Your colleagues may still have patients in. ' : ''}A walk-in or a phone booking can go straight into a free slot.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to="/app/appointments/new" className={`${buttonOnLight} h-10 px-4 text-sm`}>
                  <PlusIcon className="size-4" /> Book appointment
                </Link>
                {mine && (
                  <button type="button" onClick={() => setScope('everyone')} className={`${buttonOutline} h-10 px-4 text-sm`}>
                    Show everyone’s
                  </button>
                )}
              </div>
            </div>
          ) : (
            <Agenda appointments={todays} now={now} showDentist={!mine} />
          )}
          {todays.length > 0 && (
            <Link to="/app/appointments" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-950 underline-offset-3 hover:underline">
              Open the schedule <ArrowRightIcon className="size-4" />
            </Link>
          )}
        </section>

        <div className="flex flex-col gap-14">
          <section aria-labelledby="today-requests">
            <SectionHeading
              id="today-requests"
              title="Waiting requests"
              aside={
                waiting.length > 0 && (
                  <Link to="/app/requests" className="text-sm font-semibold underline-offset-3 hover:underline">
                    See all
                  </Link>
                )
              }
            />
            {requests.isPending ? (
              <RowsSkeleton rows={3} />
            ) : requests.isError ? (
              <LoadError error={requests.error} retry={() => void requests.refetch()} />
            ) : waiting.length === 0 ? (
              <p className="py-6 text-sm text-neutral-600">No requests waiting. Online bookings land here for you to confirm.</p>
            ) : (
              <ul>
                {waiting.slice(0, 5).map((request) => {
                  const urgent = overdueReason(request, now)
                  return (
                    <li key={request.id} className="border-b border-neutral-200">
                      <Link
                        to={`/app/requests/${request.id}`}
                        className="-mx-2 block rounded-md px-2 py-3 outline-neutral-950 transition-colors duration-150 hover:bg-neutral-50 focus-visible:outline-2"
                      >
                        <span className="flex items-start justify-between gap-3">
                          <span className="min-w-0 truncate font-semibold">{fullName(request.patient)}</span>
                          {urgent && <Pill tone="solid">{urgent}</Pill>}
                        </span>
                        <span className="mt-0.5 block text-sm text-neutral-700">
                          {formatDayShort(manilaDate(request.startsAt))}, {formatTimeRange(request.startsAt, request.endsAt)}
                        </span>
                        <span className="block text-sm text-neutral-500">
                          {shortDentist(request)} · asked {waitedFor(request.createdAt, now)}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
            {waiting.length > 5 && (
              <Link to="/app/requests" className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold underline-offset-3 hover:underline">
                {plural(waiting.length - 5, 'more request', 'more requests')} <ArrowRightIcon className="size-4" />
              </Link>
            )}
          </section>

          <section aria-labelledby="today-tomorrow">
            <SectionHeading
              id="today-tomorrow"
              title="Tomorrow"
              aside={
                <Link to={`/app/appointments?date=${tomorrow}`} className="text-sm font-semibold underline-offset-3 hover:underline">
                  Open the day
                </Link>
              }
            />
            {schedule.isPending ? (
              <RowsSkeleton rows={2} />
            ) : schedule.isError ? (
              <p className="py-4 text-sm text-neutral-600">Tomorrow appears here once the schedule loads.</p>
            ) : tomorrows.length === 0 ? (
              <p className="py-6 text-sm text-neutral-600">{mine ? 'Nothing booked with you yet.' : 'Nothing booked yet.'}</p>
            ) : (
              <>
                <ul>
                  {tomorrows.slice(0, 4).map((appointment) => (
                    <li key={appointment.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 border-b border-neutral-200 py-2.5 text-sm">
                      <span className="font-semibold whitespace-nowrap">{time(appointment.startsAt)}</span>
                      <span className="min-w-0">
                        <Link to={`/app/appointments/${appointment.id}`} className="block truncate font-medium underline-offset-3 hover:underline">
                          {fullName(appointment.patient)}
                        </Link>
                        <span className="block truncate text-neutral-500">
                          {shortDentist(appointment)}
                          {appointment.status === 'REQUESTED' && ' · request'}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                {tomorrows.length > 4 && <p className="mt-3 text-sm text-neutral-600">and {plural(tomorrows.length - 4, 'more', 'more')}</p>}
              </>
            )}
          </section>
        </div>
      </div>
    </Page>
  )
}

/** " · Open 8:00 AM – 6:00 PM, closes in 2 hours": the hours from Clinic settings. */
function OpenToday({ today, opensAt, closesAt, now }: { today: string; opensAt: number; closesAt: number; now: number }) {
  const minutes = (() => {
    const [h, m] = manilaClock(new Date(now).toISOString()).split(':').map(Number)
    return h * 60 + m
  })()
  const state = minutes < opensAt ? `opens at ${clockLabel(today, opensAt)}` : minutes < closesAt ? 'open now' : 'closed for the day'
  return (
    <>
      <span aria-hidden="true"> · </span>
      <span>
        Hours {clockLabel(today, opensAt)} – {clockLabel(today, closesAt)}
      </span>
      <span>, {state}</span>
    </>
  )
}

function Figure({ label, value, detail, to }: { label: string; value: number | null; detail: string | null; to?: string }) {
  const body = (
    <>
      <dt className="text-xs font-medium text-neutral-600 sm:text-sm">{label}</dt>
      <dd className="mt-1">
        {value === null ? (
          <span className="block h-8 w-10 rounded-sm bg-neutral-100 sm:h-11 sm:w-14" aria-label="Loading" />
        ) : (
          <span className="block text-[2rem]/[1] font-bold tracking-[-0.03em] tabular-nums sm:text-[2.75rem]/[1]">{value}</span>
        )}
      </dd>
      <dd className="mt-2 hidden min-h-5 text-sm text-neutral-500 sm:block">{detail ?? <span className="block h-4 w-32 rounded-sm bg-neutral-100" />}</dd>
    </>
  )
  const cell = 'border-neutral-200 py-4 pl-3 not-first:border-l first:pl-0 sm:py-5 sm:pl-6'
  return to ? (
    <div className={cell}>
      <Link to={to} className="group -m-2 block rounded-md p-2 outline-neutral-950 focus-visible:outline-2">
        {body}
        <span className="sr-only">, open</span>
      </Link>
    </div>
  ) : (
    <div className={cell}>{body}</div>
  )
}

function SectionHeading({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <div className="flex min-h-11 items-end justify-between gap-4 border-b border-neutral-950 pb-2.5">
      <h2 id={id} className="text-lg font-semibold">
        {title}
      </h2>
      {aside}
    </div>
  )
}

/** Today's appointments in order, with a line at the present minute between past and upcoming. */
function Agenda({ appointments, now, showDentist }: { appointments: Appointment[]; now: number; showDentist: boolean }) {
  // The line goes before the first appointment that hasn't started yet.
  const nextIndex = appointments.findIndex((appointment) => Date.parse(appointment.startsAt) > now)
  const markerAt = nextIndex === -1 ? appointments.length : nextIndex
  const rows = appointments.map((appointment) => {
    const past = Date.parse(appointment.endsAt) <= now
    const current = !past && Date.parse(appointment.startsAt) <= now
    const request = appointment.status === 'REQUESTED'
    return (
      <li key={appointment.id} className={`grid grid-cols-[5.25rem_minmax(0,1fr)_auto] gap-x-4 border-b border-neutral-200 py-3.5 ${past ? 'text-neutral-400' : ''}`}>
        <Link
          to={`/app/appointments/${appointment.id}`}
          aria-label={`${formatTimeRange(appointment.startsAt, appointment.endsAt)}, open the appointment`}
          className="self-start rounded-sm outline-neutral-950 underline-offset-3 hover:underline focus-visible:outline-2"
        >
          <span className={`block font-semibold whitespace-nowrap ${past ? '' : 'text-neutral-950'}`}>{time(appointment.startsAt)}</span>
          <span className={`block text-xs whitespace-nowrap ${past ? '' : 'text-neutral-500'}`}>to {time(appointment.endsAt)}</span>
        </Link>
        <div className="min-w-0">
          <Link
            to={`/app/patients/${appointment.patient.id}`}
            className={`block truncate font-semibold underline-offset-3 outline-neutral-950 hover:underline focus-visible:outline-2 ${past ? '' : 'text-neutral-950'}`}
          >
            {fullName(appointment.patient)}
          </Link>
          <p className={`truncate text-sm ${past ? '' : 'text-neutral-600'}`}>
            {appointment.reason || 'No reason given'}
            {showDentist && <> · {shortDentist(appointment)}</>}
          </p>
        </div>
        <div className="flex items-start gap-2 pt-0.5">
          {current && <Pill tone="outline">In the chair</Pill>}
          {request && <Pill tone={past ? 'muted' : 'solid'}>Request</Pill>}
        </div>
      </li>
    )
  })
  rows.splice(
    markerAt,
    0,
    <li key="now" className="relative flex items-center gap-2 py-1" aria-label={`Now, ${time(new Date(now).toISOString())}`}>
      <span className="w-[5.25rem] shrink-0 text-xs font-semibold whitespace-nowrap" aria-hidden="true">
        Now {time(new Date(now).toISOString())}
      </span>
      <span className="size-2 shrink-0 -translate-x-1 rounded-full bg-neutral-950" aria-hidden="true" />
      <span className="h-0.5 flex-1 -translate-x-1.5 bg-neutral-950" aria-hidden="true" />
    </li>,
  )
  return <ol>{rows}</ol>
}

function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-busy="true">
      <p className="appear-late sr-only">Loading…</p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-4 border-b border-neutral-200 py-4" aria-hidden="true">
          <div className="h-4 w-14 rounded-sm bg-neutral-100" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/5 rounded-sm bg-neutral-100" />
            <div className="h-3.5 w-3/5 rounded-sm bg-neutral-100" />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadError({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-start gap-3 py-5">
      <ErrorBox className="min-w-0 flex-1">{errorMessage(error)}</ErrorBox>
      <button type="button" onClick={retry} className={`${buttonOutline} h-10 px-4 text-sm`}>
        Try again
      </button>
    </div>
  )
}
