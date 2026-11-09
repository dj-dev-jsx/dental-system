import { formatDayLong, formatTimeRange, manilaClock, todayInManila } from '../../../lib/format'
import type { Appointment } from '../types'
import { whoName } from '../requester'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MAX_SHOWN = 3

type Props = {
  days: string[]
  /** The month being shown, as 'YYYY-MM'. Days from the weeks either side are greyed. */
  month: string
  byDay: Map<string, Appointment[]>
  selectedId?: string
  onOpenDay: (date: string) => void
  onSelect: (appointment: Appointment) => void
}

/** Six weeks of days, each listing its first few appointments, like a wall calendar. */
export function MonthGrid({ days, month, byDay, selectedId, onOpenDay, onSelect }: Props) {
  const today = todayInManila()
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-auto">
      <div className="grid min-w-[42rem] flex-1 grid-cols-7 grid-rows-[auto_repeat(6,minmax(6.5rem,1fr))]">
        {WEEKDAYS.map((day) => (
          <div key={day} className="sticky top-0 z-10 border-b border-neutral-950 bg-white px-2 py-2 text-xs font-semibold text-neutral-600">
            {day}
          </div>
        ))}
        {days.map((day, i) => {
          const items = byDay.get(day) ?? []
          const inMonth = day.slice(0, 7) === month
          const isToday = day === today
          const hidden = items.length - MAX_SHOWN
          return (
            <div
              key={day}
              className={`group relative flex min-w-0 cursor-pointer flex-col gap-0.5 border-b border-neutral-200 p-1.5 ${i % 7 ? 'border-l' : ''} ${
                inMonth ? 'bg-white hover:bg-neutral-50' : 'bg-neutral-50/70 hover:bg-neutral-100/70'
              }`}
              onClick={() => onOpenDay(day)}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onOpenDay(day)
                }}
                aria-label={`${formatDayLong(day)}${isToday ? ', today' : ''}: ${items.length === 0 ? 'no appointments' : `${items.length} appointments`}. Open the day.`}
                className={`mb-0.5 grid size-7 place-items-center self-start rounded-full text-xs tabular-nums outline-neutral-950 focus-visible:outline-2 ${
                  isToday ? 'bg-neutral-950 font-semibold text-white' : inMonth ? 'font-medium text-neutral-950 hover:bg-neutral-200' : 'text-neutral-400 hover:bg-neutral-200'
                }`}
              >
                {Number(day.slice(8))}
              </button>
              {items.slice(0, MAX_SHOWN).map((appointment) => {
                const request = appointment.status === 'REQUESTED'
                const selected = appointment.id === selectedId
                return (
                  <button
                    key={appointment.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect(appointment)
                    }}
                    aria-label={`${request ? 'Request: ' : ''}${whoName(appointment)}${appointment.patient ? '' : ' (not linked to a patient record)'}, ${formatTimeRange(appointment.startsAt, appointment.endsAt)}`}
                    className={`flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 text-left text-xs/4 outline-neutral-950 focus-visible:outline-2 ${
                      selected ? 'bg-neutral-950 text-white' : 'hover:bg-neutral-200'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`size-2 shrink-0 rounded-full ${request ? 'border border-current' : selected ? 'bg-white' : 'bg-neutral-950'}`}
                    />
                    <span className={`shrink-0 tabular-nums ${selected ? 'text-neutral-300' : 'text-neutral-500'}`}>{shortClock(appointment.startsAt)}</span>
                    <span className="truncate font-medium">
                      {whoName(appointment)}
                    </span>
                  </button>
                )
              })}
              {hidden > 0 && <span className="px-1.5 text-xs/4 font-medium text-neutral-600">{hidden} more</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** "9am" or "2:30pm" for a month cell, where space is tight. */
function shortClock(iso: string) {
  const [hours, minutes] = manilaClock(iso).split(':').map(Number)
  return `${hours % 12 || 12}${minutes ? `:${String(minutes).padStart(2, '0')}` : ''}${hours < 12 ? 'am' : 'pm'}`
}
