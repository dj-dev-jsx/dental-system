import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/icons'
import { addDays, mondayOf } from '../../lib/format'

const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_LABEL = new Intl.DateTimeFormat('en-PH', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const WEEKDAYS = [
  ['M', 'Monday'],
  ['T', 'Tuesday'],
  ['W', 'Wednesday'],
  ['T', 'Thursday'],
  ['F', 'Friday'],
  ['S', 'Saturday'],
  ['S', 'Sunday'],
] as const

const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const monthOf = (date: string) => `${date.slice(0, 7)}-01`
function shiftMonth(month: string, by: number) {
  const day = utc(month)
  day.setUTCMonth(day.getUTCMonth() + by)
  return day.toISOString().slice(0, 10)
}
const clamp = (date: string, first: string, last: string) => (date < first ? first : date > last ? last : date)

type Props = {
  /** The bookable window, Philippine dates. */
  first: string
  last: string
  selected?: string
  onPick: (date: string) => void
}

/**
 * A month of days to pick from, Monday first. Only days in the bookable window can be picked.
 * One day is in the Tab order at a time; the arrow keys move by day and week, Home and End
 * to the week's ends, Page Up and Down by month, like the date grids people already know.
 */
export function DayPicker({ first, last, selected, onPick }: Props) {
  const [focused, setFocused] = useState(() => clamp(selected ?? first, first, last))
  const [month, setMonth] = useState(() => monthOf(focused))
  const moved = useRef(false)
  const grid = useRef<HTMLDivElement>(null)

  // After a key moves the focus, put the browser's focus on the new day.
  useEffect(() => {
    if (!moved.current) return
    moved.current = false
    grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focused}"]`)?.focus()
  }, [focused, month])

  function moveTo(date: string) {
    const next = clamp(date, first, last)
    moved.current = true
    setFocused(next)
    setMonth(monthOf(next))
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const weekday = (utc(focused).getUTCDay() + 6) % 7
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
      PageUp: () => shiftMonth(focused, -1),
      PageDown: () => shiftMonth(focused, 1),
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    moveTo(move())
  }

  const canGoBack = month > monthOf(first)
  const canGoOn = month < monthOf(last)
  function showMonth(by: number) {
    const next = shiftMonth(month, by)
    setMonth(next)
    // Keep a day of the shown month in the Tab order.
    setFocused(clamp(next.slice(0, 7) === focused.slice(0, 7) ? focused : next, first, last))
  }

  const start = mondayOf(month)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
    // Drop a sixth row that is entirely next month.
    .filter((week) => week[0].slice(0, 7) <= month.slice(0, 7))

  const navButton =
    'grid size-11 place-items-center rounded-full border border-neutral-200 text-neutral-800 outline-neutral-950 transition-colors hover:border-neutral-950 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:border-neutral-100 disabled:text-neutral-300 disabled:hover:border-neutral-100'

  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        <h2 className="pl-1 text-lg font-bold tracking-[-0.01em]" aria-live="polite">
          {MONTH.format(utc(month))}
        </h2>
        <div className="flex gap-2">
          <button type="button" className={navButton} onClick={() => showMonth(-1)} disabled={!canGoBack} aria-label="Previous month">
            <ChevronLeftIcon />
          </button>
          <button type="button" className={navButton} onClick={() => showMonth(1)} disabled={!canGoOn} aria-label="Next month">
            <ChevronRightIcon />
          </button>
        </div>
      </div>

      <div ref={grid} role="grid" aria-label={MONTH.format(utc(month))} onKeyDown={onKeyDown} className="mt-3">
        <div role="row" className="grid grid-cols-7">
          {WEEKDAYS.map(([letter, name], i) => (
            <span key={i} role="columnheader" aria-label={name} className="pb-2 text-center text-xs font-semibold text-neutral-500">
              {letter}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div role="row" key={week[0]} className="grid grid-cols-7">
            {week.map((day) => {
              const inMonth = day.slice(0, 7) === month.slice(0, 7)
              if (!inMonth) return <span role="gridcell" key={day} />
              const open = day >= first && day <= last
              const isSelected = day === selected
              return (
                <span role="gridcell" key={day} className="flex justify-center py-1">
                  {open ? (
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={day === focused ? 0 : -1}
                      onClick={() => onPick(day)}
                      onFocus={() => setFocused(day)}
                      aria-label={DAY_LABEL.format(utc(day))}
                      aria-pressed={isSelected}
                      className={`grid size-11 place-items-center rounded-full text-[0.9375rem] tabular-nums outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                        isSelected ? 'bg-neutral-950 font-bold text-white' : 'bg-neutral-100 font-semibold text-neutral-950 hover:bg-neutral-50 hover:ring-1 hover:ring-neutral-950'
                      }`}
                    >
                      {Number(day.slice(8))}
                    </button>
                  ) : (
                    <span className="grid size-11 place-items-center text-[0.9375rem] text-neutral-300 tabular-nums" aria-hidden="true">
                      {Number(day.slice(8))}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
