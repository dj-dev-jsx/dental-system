import { useState } from 'react'
import { addDays, mondayOf, todayInManila } from '../lib/format'
import { ChevronLeftIcon, ChevronRightIcon } from './icons'

const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`
function shiftMonth(month: string, by: number) {
  const day = new Date(`${month}T00:00:00Z`)
  day.setUTCMonth(day.getUTCMonth() + by)
  return day.toISOString().slice(0, 10)
}

type Props = {
  /** The day the schedule is showing. */
  selected: string
  onPick: (date: string) => void
}

/** A small month for jumping to a day, like the one in the corner of a desktop calendar. Drawn for the dark sidebar. */
export function MiniMonth({ selected, onPick }: Props) {
  const today = todayInManila()
  const [month, setMonth] = useState(() => firstOfMonth(selected))
  // Follow the schedule when it moves to another month.
  const [lastSelected, setLastSelected] = useState(selected)
  if (selected !== lastSelected) {
    setLastSelected(selected)
    setMonth(firstOfMonth(selected))
  }

  const start = mondayOf(month)
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i))

  return (
    <div className="px-3 text-white">
      <div className="flex items-center justify-between pl-1">
        <p className="text-sm font-semibold" aria-live="polite">{MONTH.format(new Date(`${month}T00:00:00Z`))}</p>
        <div className="flex">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month" className="grid size-7 place-items-center rounded text-neutral-400 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2">
            <ChevronLeftIcon className="size-4" />
          </button>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Next month" className="grid size-7 place-items-center rounded text-neutral-400 outline-white hover:bg-white/10 hover:text-white focus-visible:outline-2">
            <ChevronRightIcon className="size-4" />
          </button>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-7 text-center text-[0.6875rem] text-neutral-500" aria-hidden="true">
        {WEEKDAYS.map((day, i) => (
          <span key={i} className="py-1">
            {day}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 text-center text-xs">
        {days.map((day) => {
          const inMonth = day.slice(0, 7) === month.slice(0, 7)
          const isToday = day === today
          const isSelected = day === selected
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPick(day)}
              aria-label={`${DAY_LABEL.format(new Date(`${day}T00:00:00Z`))}${isToday ? ', today' : ''}`}
              aria-current={isSelected ? 'date' : undefined}
              className={`mx-auto grid size-7 place-items-center rounded-full tabular-nums outline-white transition-colors duration-150 focus-visible:outline-2 ${
                isToday
                  ? 'bg-white font-semibold text-neutral-950'
                  : isSelected
                    ? 'font-semibold text-white ring-1 ring-white/70'
                    : inMonth
                      ? 'text-neutral-200 hover:bg-white/10'
                      : 'text-neutral-600 hover:bg-white/10'
              }`}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
