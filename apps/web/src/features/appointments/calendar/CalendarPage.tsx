import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { buttonOutline } from '../../../components/buttons'
import { ErrorBox } from '../../../components/ErrorBox'
import { compactInputClass } from '../../../components/forms'
import { AlertIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from '../../../components/icons'
import { ApiError, errorMessage } from '../../../lib/api'
import { dentistName, formatDayLong, formatDayShort, formatTimeRange, isDate, manilaDate, manilaMoment, todayInManila } from '../../../lib/format'
import { useDocumentTitle } from '../../../lib/useDocumentTitle'
import { useStaffUser } from '../../auth/authStore'
import { useClinic } from '../../clinic/queries'
import { useDentists, useSchedule, useUpdateAppointment } from '../queries'
import { whoName } from '../requester'
import type { Appointment, AppointmentChanges, Dentist } from '../types'
import { CalendarPanel, type Selection } from './CalendarPanel'
import { clockOf, DEFAULT_END_HOUR, DEFAULT_START_HOUR, daysOf, gridHours, step, type View } from './calendarMath'
import { MonthGrid } from './MonthGrid'
import { type Column, type Draft, TimeGrid } from './TimeGrid'
import { TitlePicker } from './TitlePicker'

const MONTH_YEAR = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'short', timeZone: 'UTC' })
const DAY_NAME = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })
const utc = (date: string) => new Date(`${date}T00:00:00Z`)

const VIEWS: { value: View; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

/** The bar along the bottom after a drag: what happened, and a way back. */
type Notice = { text: string; error?: boolean; undo?: () => void }

/** Words for a refused move. The API's own reasons ("That day has already passed") are written for people. */
function moveError(error: unknown) {
  const messages = error instanceof ApiError ? (error.details as { message?: unknown } | undefined)?.message : undefined
  if (error instanceof ApiError && error.status === 400 && Array.isArray(messages) && typeof messages[0] === 'string') {
    const text = messages[0].split(': ').slice(1).join(': ')
    if (text) return `Couldn’t move it: ${text}.`
  }
  return errorMessage(error)
}

function titleOf(view: View, date: string, days: string[]) {
  if (view === 'day') return formatDayLong(date)
  if (view === 'month') return MONTH_YEAR.format(utc(date))
  const first = MONTH_YEAR.format(utc(days[0]))
  const last = MONTH_YEAR.format(utc(days[6]))
  return first === last ? first : `${first.split(' ')[0]} – ${last}`
}

/**
 * The clinic's calendar. Day shows a column per dentist, so a gap in a column is that
 * dentist's free time; week and month show everyone, or one dentist. Click an empty slot to
 * book it, or an appointment to see it, in the panel beside the calendar.
 */
export default function CalendarPage() {
  const [params, setParams] = useSearchParams()
  const today = todayInManila()
  const requested = params.get('date')
  const date = isDate(requested) ? requested : today
  const requestedView = params.get('view')
  const view: View = requestedView === 'week' || requestedView === 'month' ? requestedView : 'day'
  // A dentist starts on their own appointments; "All dentists" is then remembered as dentist=all.
  // Everyone else starts on all dentists.
  const user = useStaffUser()
  const isDentist = user.role === 'DENTIST'
  const dentistParam = params.get('dentist')
  const dentistFilter = dentistParam === 'all' ? '' : (dentistParam ?? (isDentist ? user.id : ''))
  const days = daysOf(view, date)
  const title = titleOf(view, date, days)
  useDocumentTitle(`Schedule: ${title}`)

  // The day view always fetches every dentist and filters on screen, so its columns stay complete.
  const schedule = useSchedule({ from: days[0], to: days[days.length - 1], dentistId: view === 'day' ? '' : dentistFilter })
  const dentists = useDentists()
  // The grid shows the clinic's opening hours; until they load it uses 7 AM to 8 PM, so nothing jumps.
  const clinic = useClinic().data
  const { startHour, endHour } = clinic ? gridHours(clinic.opensAt, clinic.closesAt) : { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR }
  const [selection, setSelection] = useState<Selection | null>(null)
  const close = useCallback(() => setSelection(null), [setSelection])
  const updateAppointment = useUpdateAppointment()
  const [notice, setNotice] = useState<Notice | null>(null)

  // The bar goes by itself after a while; an error stays a little longer.
  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), notice.error ? 12_000 : 8_000)
    return () => window.clearTimeout(timer)
  }, [notice])

  function update(changes: Record<string, string | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })
  }

  const byDay = new Map<string, Appointment[]>()
  for (const appointment of schedule.data?.items ?? []) {
    const day = manilaDate(appointment.startsAt)
    byDay.set(day, [...(byDay.get(day) ?? []), appointment])
  }

  const columns = view === 'day' ? dentistColumns(date, dentists.data?.items ?? [], byDay.get(date) ?? [], dentistFilter) : weekColumns(days, today, (day) => update({ view: null, date: day }))
  const appointmentsFor = (column: Column) => {
    const items = byDay.get(column.date) ?? []
    if (view !== 'day') return items
    return items.filter((appointment) => (appointment.dentist?.id ?? 'any') === column.key)
  }

  const draft: Draft | null =
    selection?.kind === 'new' ? { columnKey: view === 'day' ? (selection.dentistId ?? 'any') : selection.date, minutes: selection.minutes, length: 30 } : null
  const selectedId = selection?.kind === 'appointment' ? selection.appointment.id : undefined

  function bookAt(column: Column, minutes: number) {
    // Days that have passed can't be booked; earlier today can, for a walk-in.
    if (column.date < today) return
    setSelection({ kind: 'new', date: column.date, minutes, dentistId: column.dentistId })
  }

  /** Only open appointments move, and not once their day has passed: that's history. */
  const canDrag = (appointment: Appointment) =>
    (appointment.status === 'CONFIRMED' || appointment.status === 'REQUESTED') && manilaDate(appointment.startsAt) >= today

  /** Not onto a past day, and a confirmed appointment always keeps a dentist. */
  const canDrop = (appointment: Appointment, column: Column) =>
    column.date >= today && (view !== 'day' || Boolean(column.dentistId) || appointment.status === 'REQUESTED')

  /** Keeps the panel in step when the appointment it shows has changed. */
  function refreshSelection(appointment: Appointment) {
    setSelection((current) => (current?.kind === 'appointment' && current.appointment.id === appointment.id ? { kind: 'appointment', appointment } : current))
  }

  /** Saves a drag. It's saved at once, the way desktop calendars do it, with Undo in the bar. */
  async function move(appointment: Appointment, column: Column, start: number, end: number) {
    const startsAt = manilaMoment(column.date, clockOf(start))
    const endsAt = manilaMoment(column.date, clockOf(end))
    const changes: AppointmentChanges = {}
    const before: AppointmentChanges = {}
    if (Date.parse(startsAt) !== Date.parse(appointment.startsAt)) {
      changes.startsAt = startsAt
      before.startsAt = appointment.startsAt
    }
    if (Date.parse(endsAt) !== Date.parse(appointment.endsAt)) {
      changes.endsAt = endsAt
      before.endsAt = appointment.endsAt
    }
    // In the day view, dropping into another dentist's column hands it to them.
    const dentistId = column.dentistId ?? null
    if (view === 'day' && dentistId !== (appointment.dentist?.id ?? null)) {
      changes.dentistId = dentistId
      before.dentistId = appointment.dentist?.id ?? null
    }
    if (Object.keys(changes).length === 0) return

    try {
      const moved = await updateAppointment.mutateAsync({ id: appointment.id, ...changes })
      refreshSelection(moved)
      const withWhom = changes.dentistId !== undefined && moved.dentist ? ` with ${dentistName(moved.dentist)}` : ''
      setNotice({
        text: `Moved ${whoName(moved)} to ${formatDayShort(manilaDate(moved.startsAt))}, ${formatTimeRange(moved.startsAt, moved.endsAt)}${withWhom}.`,
        undo: () => void undo(appointment, before),
      })
    } catch (error) {
      setNotice({ text: moveError(error), error: true })
    }
  }

  async function undo(appointment: Appointment, before: AppointmentChanges) {
    setNotice(null)
    try {
      refreshSelection(await updateAppointment.mutateAsync({ id: appointment.id, ...before }))
      setNotice({ text: `Moved ${whoName(appointment)} back.` })
    } catch (error) {
      setNotice({ text: moveError(error), error: true })
    }
  }

  function show(appointment: Appointment) {
    setSelection({ kind: 'appointment', appointment })
    const day = manilaDate(appointment.startsAt)
    if (!days.includes(day)) update({ date: day })
  }

  return (
    <div className="flex h-full min-h-[34rem]">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
          <TitlePicker title={title} date={date} onPick={(day) => update({ date: day === today ? null : day })} />
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => update({ date: null })} className={`${buttonOutline} h-9 px-3 text-sm`}>
              Today
            </button>
            <button type="button" onClick={() => update({ date: step(view, date, -1) })} aria-label={`Previous ${view}`} className="grid size-9 place-items-center rounded-md text-neutral-700 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2">
              <ChevronLeftIcon />
            </button>
            <button type="button" onClick={() => update({ date: step(view, date, 1) })} aria-label={`Next ${view}`} className="grid size-9 place-items-center rounded-md text-neutral-700 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2">
              <ChevronRightIcon />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
            <Legend />
            <label htmlFor="calendar-dentist" className="sr-only">
              Dentist
            </label>
            <select
              id="calendar-dentist"
              value={dentistFilter}
              onChange={(event) => update({ dentist: event.target.value || (isDentist ? 'all' : null) })}
              className={compactInputClass}
            >
              <option value="">All dentists</option>
              {dentists.data?.items.map((dentist) => (
                <option key={dentist.id} value={dentist.id}>
                  {dentistName(dentist)}
                  {dentist.id === user.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
            <div className="flex rounded-md border border-neutral-300 p-0.5" role="group" aria-label="View">
              {VIEWS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={view === option.value}
                  onClick={() => update({ view: option.value === 'day' ? null : option.value })}
                  className={`h-8 rounded px-3 text-sm font-medium outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                    view === option.value ? 'bg-neutral-950 text-white' : 'text-neutral-600 hover:text-neutral-950'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {schedule.isError && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-neutral-200 px-4 py-3 sm:px-6">
            <ErrorBox className="flex-1">{errorMessage(schedule.error)}</ErrorBox>
            <button type="button" onClick={() => void schedule.refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
              Try again
            </button>
          </div>
        )}

        <div className={`flex min-h-0 flex-1 flex-col transition-opacity duration-150 ${schedule.isPlaceholderData ? 'opacity-60' : ''}`} aria-busy={schedule.isPending || schedule.isPlaceholderData}>
          {view === 'month' ? (
            <MonthGrid
              days={days}
              month={date.slice(0, 7)}
              byDay={byDay}
              selectedId={selectedId}
              onOpenDay={(day) => update({ view: null, date: day })}
              onSelect={show}
            />
          ) : view === 'day' && columns.length === 0 && dentists.isSuccess ? (
            <div className="px-6 py-12">
              <p className="text-lg font-semibold">No dentists to show</p>
              <p className="mt-1 text-neutral-600">Ask your clinic admin to add a dentist, then their day appears here.</p>
            </div>
          ) : (
            <TimeGrid
              columns={columns}
              startHour={startHour}
              endHour={endHour}
              appointmentsFor={appointmentsFor}
              showDentist={view === 'week' && !dentistFilter}
              selectedId={selectedId}
              draft={draft}
              scrollKey={`${view}-${days[0]}`}
              minColumnWidth={view === 'day' ? '10rem' : '5.25rem'}
              canBook={(column) => column.date >= today}
              onSlot={bookAt}
              onSelect={show}
              canDrag={canDrag}
              canDrop={canDrop}
              onMove={move}
            />
          )}
        </div>

        {notice && (
          <div
            role={notice.error ? 'alert' : 'status'}
            className="panel-in absolute bottom-5 left-1/2 z-40 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-4 rounded-md bg-neutral-950 py-2.5 pr-2 pl-4 text-sm text-white"
          >
            {notice.error && <AlertIcon className="shrink-0" />}
            <span className="min-w-0">{notice.text}</span>
            {notice.undo && (
              <button type="button" onClick={notice.undo} className="shrink-0 rounded px-2 py-1 font-semibold underline underline-offset-3 outline-white hover:bg-white/10 focus-visible:outline-2">
                Undo
              </button>
            )}
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="grid size-8 shrink-0 place-items-center rounded text-neutral-400 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2">
              <CloseIcon className="size-4" />
            </button>
          </div>
        )}
      </div>

      {selection && <CalendarPanel selection={selection} onClose={close} onShow={show} />}
    </div>
  )
}

/** What solid and outlined blocks mean. */
function Legend() {
  return (
    <div className="hidden items-center gap-4 text-xs text-neutral-600 2xl:flex" aria-hidden="true">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-sm bg-neutral-950" /> Confirmed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-4 rounded-sm border border-dashed border-neutral-950" /> Request
      </span>
    </div>
  )
}

/** The day view: one column per dentist, plus one for requests that didn't name a dentist. */
function dentistColumns(date: string, dentists: Dentist[], appointments: Appointment[], only: string): Column[] {
  const people = new Map(dentists.map((dentist) => [dentist.id, dentist]))
  // A dentist who has since left still has their booked appointments shown.
  for (const appointment of appointments) {
    if (appointment.dentist && !people.has(appointment.dentist.id)) people.set(appointment.dentist.id, appointment.dentist)
  }
  const columns: Column[] = [...people.values()]
    .filter((dentist) => !only || dentist.id === only)
    .map((dentist) => {
      const count = appointments.filter((appointment) => appointment.dentist?.id === dentist.id).length
      return {
        key: dentist.id,
        date,
        dentistId: dentist.id,
        label: dentistName(dentist),
        heading: (
          <div className="px-3 py-2.5">
            <p className="truncate text-sm font-semibold">{dentistName(dentist)}</p>
            <p className="text-xs text-neutral-500">{count === 0 ? 'Free all day' : count === 1 ? '1 appointment' : `${count} appointments`}</p>
          </div>
        ),
      }
    })
  if (!only && appointments.some((appointment) => !appointment.dentist)) {
    columns.push({
      key: 'any',
      date,
      label: 'Requests for any dentist',
      heading: (
        <div className="px-3 py-2.5">
          <p className="truncate text-sm font-semibold">Any dentist</p>
          <p className="text-xs text-neutral-500">Requests to assign</p>
        </div>
      ),
    })
  }
  return columns
}

/** The week view: a column per day, Monday first. Clicking a day's heading opens that day. */
function weekColumns(days: string[], today: string, openDay: (date: string) => void): Column[] {
  return days.map((day) => {
    const isToday = day === today
    return {
      key: day,
      date: day,
      label: DAY_NAME.format(utc(day)),
      heading: (
        <button
          type="button"
          onClick={() => openDay(day)}
          aria-label={`Open ${DAY_NAME.format(utc(day))}${isToday ? ', today' : ''}`}
          className="flex w-full items-center gap-2 px-3 py-2 text-left outline-neutral-950 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:-outline-offset-2"
        >
          <span className={`text-xs font-medium ${isToday ? 'text-neutral-950' : 'text-neutral-500'}`}>{WEEKDAY.format(utc(day))}</span>
          <span
            className={`grid size-8 place-items-center rounded-full text-lg font-semibold tabular-nums ${
              isToday ? 'bg-neutral-950 text-white' : day < today ? 'text-neutral-400' : 'text-neutral-950'
            }`}
          >
            {Number(day.slice(8))}
          </span>
        </button>
      ),
    }
  })
}
