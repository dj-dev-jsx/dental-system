import { type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dentistName, formatTimeRange, fullName, todayInManila } from '../../../lib/format'
import type { Appointment } from '../types'
import {
  clockOf,
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_PX,
  layoutLanes,
  minutesOfDay,
  placement,
  SLOT_MINUTES,
} from './calendarMath'

export type Column = {
  key: string
  date: string
  /** In the day view each dentist has a column; a booking made there is with them. */
  dentistId?: string
  heading: ReactNode
  /** Read out for the column, like "Monday, November 9" or "Dr. Jose Santos". */
  label: string
}

export type Draft = { columnKey: string; minutes: number; length: number }

type Props = {
  columns: Column[]
  appointmentsFor: (column: Column) => Appointment[]
  /** Label each appointment with its dentist, when columns aren't already one per dentist. */
  showDentist: boolean
  selectedId?: string
  draft: Draft | null
  /** Changes when the visible days change, to scroll back to the working day. */
  scrollKey: string
  minColumnWidth: string
  /** False for days that have passed: no booking cursor or slot preview there. */
  canBook: (column: Column) => boolean
  onSlot: (column: Column, minutes: number) => void
  onSelect: (appointment: Appointment) => void
  /** Whether an appointment can be dragged at all, such as not once its day has passed. */
  canDrag: (appointment: Appointment) => boolean
  /** Whether an appointment may be dropped in this column. */
  canDrop: (appointment: Appointment, column: Column) => boolean
  /** Saves a drag. The block stays where it was dropped until this settles. */
  onMove: (appointment: Appointment, column: Column, start: number, end: number) => Promise<void>
}

/** Where a drag would put the appointment, in minutes since midnight. */
type Spot = { columnKey: string; start: number; end: number }

type Drag = {
  appointment: Appointment
  /** Moving the whole block, or stretching its end. */
  mode: 'move' | 'resize'
  startX: number
  startY: number
  /** How far below the block's start it was picked up, so it doesn't jump to the pointer. */
  grabOffset: number
  origin: Spot
  target: Spot
  moved: boolean
  saving: boolean
}

/** Pointer travel, in pixels, before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4
const snap = (minutes: number) => Math.round(minutes / SLOT_MINUTES) * SLOT_MINUTES

const HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, i) => DAY_START_HOUR + i)
const GRID_HEIGHT = HOURS.length * HOUR_PX
const HOUR_LABEL = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`

/** The minute-by-minute clock, ticking once a minute, for the line that marks "now". */
function useNowMinutes() {
  const read = () => ({ date: todayInManila(), minutes: minutesOfDay(new Date().toISOString()) })
  const [now, setNow] = useState(read)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(read()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** The day and week views: a column per day or per dentist, hours down the side. */
export function TimeGrid({
  columns,
  appointmentsFor,
  showDentist,
  selectedId,
  draft,
  scrollKey,
  minColumnWidth,
  canBook,
  onSlot,
  onSelect,
  canDrag,
  canDrop,
  onMove,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const now = useNowMinutes()
  const [hover, setHover] = useState<{ columnKey: string; minutes: number } | null>(null)
  const showsToday = columns.some((column) => column.date === now.date)
  const columnEls = useRef(new Map<string, HTMLDivElement>())
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  useEffect(() => {
    dragRef.current = drag
  }, [drag])
  // A drag ends with a click event; this stops that click opening or booking something.
  const swallowClick = useRef(false)

  /** Minutes since midnight at a height on the page, inside one column. */
  function minutesAt(clientY: number, columnKey: string) {
    const el = columnEls.current.get(columnKey)
    if (!el) return DAY_START_HOUR * 60
    return DAY_START_HOUR * 60 + ((clientY - el.getBoundingClientRect().top) / HOUR_PX) * 60
  }

  function startDrag(event: ReactPointerEvent, appointment: Appointment, columnKey: string, mode: Drag['mode']) {
    // Touch screens scroll with a finger, so on them a press stays a tap.
    if (event.pointerType === 'touch' || event.button !== 0 || !canDrag(appointment)) return
    event.preventDefault() // no text selection while dragging
    const start = minutesOfDay(appointment.startsAt)
    const end = minutesOfDay(appointment.endsAt)
    const origin = { columnKey, start, end }
    const next: Drag = {
      appointment,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      grabOffset: minutesAt(event.clientY, columnKey) - start,
      origin,
      target: origin,
      moved: false,
      saving: false,
    }
    dragRef.current = next
    setDrag(next)
  }

  // While a drag is on, follow the pointer anywhere on the page.
  const dragging = drag !== null && !drag.saving
  const dragMode = drag?.mode
  useEffect(() => {
    if (!dragging) return

    function update(next: Drag | null) {
      dragRef.current = next
      setDrag(next)
    }

    function move(event: PointerEvent) {
      const current = dragRef.current
      if (!current || current.saving) return
      if (!current.moved && Math.hypot(event.clientX - current.startX, event.clientY - current.startY) < DRAG_THRESHOLD) return

      let columnKey = current.target.columnKey
      if (current.mode === 'move') {
        for (const [key, el] of columnEls.current) {
          const rect = el.getBoundingClientRect()
          if (event.clientX >= rect.left && event.clientX < rect.right) columnKey = key
        }
      }
      const pointer = minutesAt(event.clientY, columnKey)
      const first = DAY_START_HOUR * 60
      const last = DAY_END_HOUR * 60
      let { start, end } = current.origin
      if (current.mode === 'move') {
        const length = end - start
        start = Math.min(Math.max(snap(pointer - current.grabOffset), first), last - length)
        end = start + length
      } else {
        end = Math.min(Math.max(snap(pointer), start + SLOT_MINUTES), last)
      }
      update({ ...current, moved: true, target: { columnKey, start, end } })

      // Near the top or bottom edge, scroll the day along with the pointer.
      const box = scroller.current?.getBoundingClientRect()
      if (box) {
        if (event.clientY < box.top + 96) scroller.current?.scrollBy(0, -12)
        else if (event.clientY > box.bottom - 32) scroller.current?.scrollBy(0, 12)
      }
    }

    function up() {
      const current = dragRef.current
      if (!current) return
      // Not moved far enough: it was a click, which the block's own click handler opens.
      if (!current.moved) return update(null)
      swallowClick.current = true
      window.setTimeout(() => (swallowClick.current = false))
      const { origin, target, appointment } = current
      const column = columns.find((candidate) => candidate.key === target.columnKey)
      const changed = target.columnKey !== origin.columnKey || target.start !== origin.start || target.end !== origin.end
      if (!changed || !column || !canDrop(appointment, column)) return update(null)
      const saving = { ...current, saving: true }
      update(saving)
      // Clear only this drag: a new one may have started while it saved.
      void onMove(appointment, column, target.start, target.end).finally(() => {
        if (dragRef.current === saving) update(null)
      })
    }

    function cancel(event: KeyboardEvent) {
      if (event.key === 'Escape') update(null)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('keydown', cancel)
    document.body.style.cursor = dragMode === 'resize' ? 'ns-resize' : 'grabbing'
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('keydown', cancel)
      document.body.style.cursor = ''
    }
    // The handlers read the latest drag from dragRef, so they're set up once per drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging])

  // Open on the working day: an hour before now when today is in view during clinic hours, otherwise 8 AM.
  useLayoutEffect(() => {
    const open = now.minutes >= DAY_START_HOUR * 60 && now.minutes < DAY_END_HOUR * 60
    const target = showsToday && open ? now.minutes - 60 : 8 * 60
    const top = ((target - DAY_START_HOUR * 60) / 60) * HOUR_PX
    scroller.current?.scrollTo({ top: Math.max(0, top) })
    // Only when the days change, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollKey])

  function slotAt(event: MouseEvent<HTMLDivElement>) {
    const y = event.clientY - event.currentTarget.getBoundingClientRect().top
    const slots = Math.floor((y / HOUR_PX) * (60 / SLOT_MINUTES))
    const minutes = DAY_START_HOUR * 60 + slots * SLOT_MINUTES
    return Math.min(minutes, DAY_END_HOUR * 60 - SLOT_MINUTES)
  }

  const template = `3.5rem repeat(${columns.length}, minmax(${minColumnWidth}, 1fr))`

  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain [scrollbar-color:var(--color-neutral-300)_transparent]">
      <div className="grid min-w-fit" style={{ gridTemplateColumns: template }}>
        {/* Column headings stay in view while the hours scroll under them. */}
        <div className="sticky top-0 left-0 z-30 border-b border-neutral-950 bg-white" />
        {columns.map((column) => (
          <div key={column.key} className="sticky top-0 z-20 border-b border-l border-neutral-950 border-l-neutral-200 bg-white">
            {column.heading}
          </div>
        ))}

        {/* The hours, down the left. */}
        <div className="sticky left-0 z-10 bg-white" style={{ height: GRID_HEIGHT }} aria-hidden="true">
          {HOURS.map((hour, i) =>
            i === 0 ? null : (
              <span key={hour} className="absolute right-2 -translate-y-1/2 text-[0.6875rem] text-neutral-500" style={{ top: i * HOUR_PX }}>
                {HOUR_LABEL(hour)}
              </span>
            ),
          )}
        </div>

        {columns.map((column) => {
          const placed = layoutLanes(appointmentsFor(column))
          const isToday = column.date === now.date
          const nowTop = ((now.minutes - DAY_START_HOUR * 60) / 60) * HOUR_PX
          const bookable = canBook(column)
          const hovered = !drag && bookable && hover?.columnKey === column.key && draft?.columnKey !== column.key ? hover : null
          const ghost = drag?.moved && drag.target.columnKey === column.key ? drag : null
          return (
            <div
              key={column.key}
              ref={(el) => {
                if (el) columnEls.current.set(column.key, el)
                else columnEls.current.delete(column.key)
              }}
              role="group"
              aria-label={column.label}
              className={`relative border-l border-neutral-200 ${bookable ? 'cursor-cell' : ''} ${isToday ? 'bg-neutral-50' : ''}`}
              style={{ height: GRID_HEIGHT }}
              onClick={(event) => {
                if (!swallowClick.current) onSlot(column, slotAt(event))
              }}
              onMouseMove={(event) => {
                const minutes = slotAt(event)
                if (hover?.columnKey !== column.key || hover.minutes !== minutes) setHover({ columnKey: column.key, minutes })
              }}
              onMouseLeave={() => setHover(null)}
            >
              {/* Hour lines, with a fainter half-hour between. */}
              {HOURS.map((hour, i) => (
                <div key={hour} aria-hidden="true">
                  {i > 0 && <div className="absolute inset-x-0 border-t border-neutral-200" style={{ top: i * HOUR_PX }} />}
                  <div className="absolute inset-x-0 border-t border-dotted border-neutral-200" style={{ top: i * HOUR_PX + HOUR_PX / 2 }} />
                </div>
              ))}

              {/* Where a click would book: shown under the pointer, so the grid explains itself. */}
              {hovered && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-1 rounded-md bg-neutral-950/6 px-2 text-[0.6875rem]/[1rem] font-medium text-neutral-600"
                  style={{ top: ((hovered.minutes - DAY_START_HOUR * 60) / 60) * HOUR_PX + 1, height: HOUR_PX / 2 - 2 }}
                >
                  <span className="block pt-0.5">+ {formatClock(hovered.minutes)}</span>
                </div>
              )}

              {draft?.columnKey === column.key && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-neutral-950 bg-white px-2 py-1 text-xs font-semibold"
                  style={{ top: ((draft.minutes - DAY_START_HOUR * 60) / 60) * HOUR_PX, height: Math.max((draft.length / 60) * HOUR_PX, 24) }}
                >
                  New appointment, {formatClock(draft.minutes)}
                </div>
              )}

              {placed.map(({ appointment, lane, lanes }) => (
                <Event
                  key={appointment.id}
                  appointment={appointment}
                  lane={lane}
                  lanes={lanes}
                  showDentist={showDentist}
                  selected={appointment.id === selectedId}
                  draggable={canDrag(appointment)}
                  lifted={drag?.moved === true && drag.appointment.id === appointment.id}
                  onSelect={(picked) => {
                    if (!swallowClick.current) onSelect(picked)
                  }}
                  onGrab={(event, mode) => startDrag(event, appointment, column.key, mode)}
                />
              ))}

              {ghost && <Ghost drag={ghost} allowed={canDrop(ghost.appointment, column)} />}

              {isToday && nowTop >= 0 && nowTop <= GRID_HEIGHT && (
                <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20" style={{ top: nowTop }}>
                  <div className="absolute -top-[5px] -left-[5px] size-2.5 rounded-full bg-neutral-950 ring-2 ring-white" />
                  <div className="h-0.5 bg-neutral-950" />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function formatClock(minutes: number) {
  const [hours, mins] = clockOf(minutes).split(':').map(Number)
  return `${hours % 12 || 12}:${String(mins).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`
}

type EventProps = {
  appointment: Appointment
  lane: number
  lanes: number
  showDentist: boolean
  selected: boolean
  draggable: boolean
  /** Being dragged: the block stays behind, faded, until it's dropped. */
  lifted: boolean
  onSelect: (appointment: Appointment) => void
  onGrab: (event: ReactPointerEvent, mode: Drag['mode']) => void
}

/**
 * One appointment on the grid. Confirmed appointments are solid ink, like exposed film;
 * requests are only outlined, because they don't hold the time yet.
 */
function Event({ appointment, lane, lanes, showDentist, selected, draggable, lifted, onSelect, onGrab }: EventProps) {
  const { top, height } = placement(appointment.startsAt, appointment.endsAt)
  const request = appointment.status === 'REQUESTED'
  const time = formatTimeRange(appointment.startsAt, appointment.endsAt)
  const name = fullName(appointment.patient)
  const who = appointment.dentist ? dentistName(appointment.dentist) : 'Any dentist'
  const short = height < 40

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onSelect(appointment)
      }}
      onPointerDown={(event) => onGrab(event, 'move')}
      aria-label={`${request ? 'Request: ' : ''}${name}, ${time}, ${who}`}
      title={draggable ? 'Drag to move. Drag the bottom edge to change the length.' : undefined}
      aria-pressed={selected}
      className={`absolute z-10 overflow-hidden rounded-md px-2 text-left outline-neutral-950 transition-shadow duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 ${
        short ? 'py-0.5' : 'py-1'
      } ${
        request
          ? 'border border-dashed border-neutral-950 bg-white text-neutral-950 hover:bg-neutral-50'
          : 'bg-neutral-950 text-white hover:bg-neutral-800'
      } ${selected ? 'ring-2 ring-neutral-950 ring-offset-2 ring-offset-white' : ''} ${draggable ? 'cursor-grab' : ''} ${lifted ? 'opacity-30' : ''}`}
      style={{
        top: top + 1,
        height: height - 2,
        left: `calc(${(lane / lanes) * 100}% + 3px)`,
        width: `calc(${100 / lanes}% - 6px)`,
      }}
    >
      {short ? (
        <span className="block truncate text-xs/4">
          <span className="font-semibold">{name}</span>
          <span className={request ? 'text-neutral-600' : 'text-neutral-300'}> {time}</span>
        </span>
      ) : (
        <>
          <span className="block truncate text-xs/4 font-semibold">{name}</span>
          <span className={`block truncate text-xs/4 ${request ? 'text-neutral-600' : 'text-neutral-300'}`}>
            {request ? `Request · ${time}` : time}
          </span>
          {height >= 60 && (showDentist || appointment.reason) && (
            <span className={`mt-0.5 block truncate text-xs/4 ${request ? 'text-neutral-600' : 'text-neutral-400'}`}>
              {showDentist ? who : appointment.reason}
            </span>
          )}
        </>
      )}
      {draggable && (
        <span
          aria-hidden="true"
          onPointerDown={(event) => {
            event.stopPropagation()
            onGrab(event, 'resize')
          }}
          className="absolute inset-x-0 bottom-0 h-2 cursor-ns-resize"
        />
      )}
    </button>
  )
}

/** Where a dragged appointment would land, with its new time. */
function Ghost({ drag, allowed }: { drag: Drag; allowed: boolean }) {
  const { start, end } = drag.target
  const request = drag.appointment.status === 'REQUESTED'
  const top = ((start - DAY_START_HOUR * 60) / 60) * HOUR_PX
  const height = ((end - start) / 60) * HOUR_PX
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-x-1 z-30 overflow-hidden rounded-md px-2 text-xs/4 ${
        !allowed
          ? 'border border-dashed border-neutral-400 bg-neutral-100 text-neutral-500'
          : request
            ? 'border-2 border-dashed border-neutral-950 bg-white text-neutral-950'
            : 'bg-neutral-950 text-white ring-2 ring-neutral-950 ring-offset-2 ring-offset-white'
      } ${height < 40 ? 'py-0.5' : 'py-1'} ${drag.saving ? 'animate-pulse' : ''}`}
      style={{ top: top + 1, height: Math.max(height - 2, 18) }}
    >
      {allowed && height < 40 ? (
        <span className="block truncate">
          <span className="font-semibold">{fullName(drag.appointment.patient)}</span> {formatClock(start)} – {formatClock(end)}
        </span>
      ) : allowed ? (
        <>
          <span className="block truncate font-semibold">{fullName(drag.appointment.patient)}</span>
          <span className="block truncate">
            {formatClock(start)} – {formatClock(end)}
          </span>
        </>
      ) : (
        <span className="block truncate font-medium">Can’t move here</span>
      )}
    </div>
  )
}
