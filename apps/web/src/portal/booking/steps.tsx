import { useQuery } from '@tanstack/react-query'
import { type FormEvent, type ReactNode, useRef, useState } from 'react'
import { ArrowRightIcon, PeopleIcon } from '../../components/icons'
import { addDays, dentistName, formatDayLong, manilaClock } from '../../lib/format'
import { commonMessage, fieldMessages, portalApi, type Slot } from '../api'
import { timeLabel } from '../format'
import { TickIcon } from '../icons'
import { LoadFailed, portalTextarea, portalTextareaError, primaryButton, Problem, secondaryButton, Skeleton } from '../ui'
import { DayPicker } from './DayPicker'
import { NOTE_MAX, REASONS, useBooking } from './draft'
import { useClinic } from '../clinic-context'

// The first four steps: what for, which dentist, which day, which time. A tap on a dentist,
// a day or a time moves straight on (the summary and Back let people change it).

/** On phones the step's main button rides along the bottom of the screen; from 640px it sits in the flow. */
export function StickyAction({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-8 border-t border-neutral-200 bg-white/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      {children}
    </div>
  )
}

export function ReasonStep() {
  const { draft, go } = useBooking()
  const [reason, setReason] = useState(draft.reason ?? '')
  const [note, setNote] = useState(draft.note ?? '')
  const [error, setError] = useState<string | null>(null)
  const needsNote = reason === 'Something else'

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!reason) return setError('Choose what the visit is for.')
    if (needsNote && !note.trim()) {
      setError('Say in a few words what the visit is for.')
      document.getElementById('reason-note')?.focus()
      return
    }
    go('dentist', { reason, note: note.trim() || undefined })
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8">
      <fieldset>
        <legend className="sr-only">What is the visit for?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {REASONS.map((option) => (
            <label
              key={option}
              className="flex min-h-16 cursor-pointer items-center gap-3.5 rounded-2xl border border-neutral-200 bg-white px-4 py-3 text-[1.0625rem] leading-snug outline-neutral-950 transition-[border-color,background-color] duration-150 hover:border-neutral-400 has-checked:border-neutral-950 has-checked:bg-neutral-50 has-checked:font-semibold has-checked:ring-1 has-checked:ring-neutral-950 has-focus-visible:outline-2 has-focus-visible:outline-offset-2"
            >
              <input
                type="radio"
                name="reason"
                value={option}
                checked={reason === option}
                onChange={() => {
                  setReason(option)
                  setError(null)
                }}
                className="size-5 shrink-0 cursor-pointer appearance-none rounded-full border-2 border-neutral-300 bg-white transition-[border-width,border-color] duration-150 checked:border-[6px] checked:border-neutral-950 focus:outline-none"
              />
              {option}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-8 flex flex-col gap-2">
        <label htmlFor="reason-note" className="text-[0.9375rem] font-semibold">
          {needsNote ? 'What is it for?' : 'Anything the clinic should know?'}{' '}
          {!needsNote && <span className="font-normal text-neutral-500">Optional</span>}
        </label>
        <textarea
          id="reason-note"
          value={note}
          maxLength={NOTE_MAX}
          onChange={(event) => {
            setNote(event.target.value)
            setError(null)
          }}
          rows={3}
          aria-describedby="reason-note-hint"
          className={error && needsNote && !note.trim() ? portalTextareaError : portalTextarea}
        />
        <p id="reason-note-hint" className="flex justify-between gap-4 text-sm/5 text-neutral-600">
          <span>For example, which tooth hurts and since when. Only the clinic’s staff see this.</span>
          <span className="shrink-0 tabular-nums text-neutral-500" aria-hidden="true">
            {note.length}/{NOTE_MAX}
          </span>
        </p>
      </div>

      {error && <Problem className="mt-6">{error}</Problem>}

      <StickyAction>
        <button type="submit" className={primaryButton}>
          Continue <ArrowRightIcon />
        </button>
      </StickyAction>
    </form>
  )
}

/** A choice card's tick, filled when chosen. */
function ChoiceTick({ chosen }: { chosen: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 transition-colors duration-150 ${
        chosen ? 'border-neutral-950 bg-neutral-950 text-white' : 'border-neutral-300 text-transparent group-hover:border-neutral-500'
      }`}
    >
      <TickIcon className="size-3.5" strokeWidth={2.75} />
    </span>
  )
}

function initialsOf(name: string) {
  return name
    .replace(/^Dr\.\s*/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function DentistStep() {
  const { clinic } = useClinic()
  const { draft, go } = useBooking()
  // A different dentist has different free times, so the chosen time goes.
  const pick = (dentist: string) => go('day', { dentist, slot: dentist === draft.dentist ? draft.slot : undefined })

  const options = [
    { id: 'any', name: 'Any dentist', hint: 'The most free times. The clinic chooses who sees you.' },
    ...clinic.dentists.map((dentist) => ({ id: dentist.id, name: dentistName(dentist), hint: null })),
  ]

  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-2">
      {options.map((option) => {
        const chosen = draft.dentist === option.id
        const any = option.id === 'any'
        return (
          <li key={option.id} className={any ? 'sm:col-span-2' : undefined}>
            <button
              type="button"
              onClick={() => pick(option.id)}
              aria-pressed={chosen}
              className={`group flex min-h-[4.5rem] w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3.5 text-left outline-neutral-950 transition-[border-color,background-color] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
                chosen ? 'border-neutral-950 bg-neutral-50 ring-1 ring-neutral-950' : 'border-neutral-200 hover:border-neutral-400'
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-11 shrink-0 place-items-center rounded-full text-[0.9375rem] font-bold ${
                  any ? 'bg-neutral-950 text-white' : 'bg-neutral-100 text-neutral-950'
                }`}
              >
                {any ? <PeopleIcon /> : initialsOf(option.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[1.0625rem] font-semibold">{option.name}</span>
                {option.hint && <span className="mt-0.5 block text-[0.9375rem]/5 text-pretty text-neutral-600">{option.hint}</span>}
              </span>
              <ChoiceTick chosen={chosen} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Day and time on one screen: the calendar, and under it the chosen day's free times. */
export function DayStep() {
  const { clinic } = useClinic()
  const { draft, go } = useBooking()
  const timesRef = useRef<HTMLDivElement>(null)

  function pick(date: string) {
    go('day', { date, slot: date === draft.date ? draft.slot : undefined }, { replace: true })
    // On a phone the times are below the fold: bring them up.
    requestAnimationFrame(() => timesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  return (
    <div className="mt-8">
      <div className="rounded-2xl border border-neutral-200 p-3 sm:max-w-[27rem] sm:p-5">
        <DayPicker
          key={draft.date?.slice(0, 7) ?? ''}
          first={clinic.firstBookableDate}
          last={clinic.lastBookableDate}
          selected={draft.date}
          onPick={pick}
        />
      </div>
      <p className="mt-4 text-[0.9375rem] text-pretty text-neutral-600">
        You can book from tomorrow up to {formatDayLong(clinic.lastBookableDate).replace(/^\w+, /, '')}.
      </p>
      <div ref={timesRef} className="scroll-mt-6 mt-10 border-t border-neutral-200 pt-8">
        {draft.date ? (
          <>
            <h2 className="text-xl font-bold tracking-[-0.01em]" aria-live="polite">
              Free times on {formatDayLong(draft.date).replace(/, \d{4}$/, '')}
            </h2>
            <TimeSlots key={draft.date} date={draft.date} />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-300 px-5 py-6 text-neutral-600">
            Pick a day above to see its free times.
          </p>
        )}
      </div>
    </div>
  )
}

const PARTS = [
  { label: 'Morning', until: '12:00' },
  { label: 'Afternoon', until: '17:00' },
  { label: 'Evening', until: '24:00' },
] as const

function groupSlots(slots: Slot[]) {
  return PARTS.map((part, i) => ({
    label: part.label,
    slots: slots.filter((slot) => {
      const clock = manilaClock(slot.startsAt)
      return clock < part.until && (i === 0 || clock >= PARTS[i - 1].until)
    }),
  })).filter((part) => part.slots.length > 0)
}

function TimeSlots({ date }: { date: string }) {
  const { clinic } = useClinic()
  const { draft, state, go } = useBooking()
  const dentistId = draft.dentist && draft.dentist !== 'any' ? draft.dentist : null
  const slots = useQuery({
    queryKey: ['portal', 'slots', date, dentistId],
    queryFn: () => portalApi.slots(date, dentistId),
    staleTime: 0,
  })

  if (slots.isPending) {
    return (
      <div className="mt-8 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    )
  }
  if (slots.isError) {
    const badDentist = 'dentistId' in fieldMessages(slots.error)
    if (badDentist) {
      return (
        <div className="mt-8 flex flex-col items-start gap-4">
          <Problem>That dentist isn’t taking online bookings at the moment.</Problem>
          <button type="button" className={primaryButton} onClick={() => go('dentist', { dentist: undefined, slot: undefined })}>
            Choose another dentist
          </button>
        </div>
      )
    }
    return (
      <div className="mt-8">
        <LoadFailed message={commonMessage(slots.error)} onRetry={() => void slots.refetch()} retrying={slots.isFetching} />
      </div>
    )
  }

  const groups = groupSlots(slots.data.slots)
  const nextDay = addDays(date, 1)
  const hasNextDay = nextDay <= clinic.lastBookableDate

  return (
    <div className="mt-5">
      {state.notice && <Problem className="mb-6">{state.notice}</Problem>}
      {groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 px-5 py-6 sm:px-6">
          <p className="text-[1.0625rem] font-semibold">No free times on this day.</p>
          <p className="mt-1 text-pretty text-neutral-600">
            {dentistId ? 'This dentist is fully booked or not in. ' : 'The clinic is fully booked or closed. '}
            Try another day{dentistId ? ', or choose Any dentist' : ''}.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {hasNextDay && (
              <button type="button" className={primaryButton} onClick={() => go('day', { date: nextDay, slot: undefined }, { replace: true })}>
                Try {formatDayLong(nextDay).split(',')[0]} <ArrowRightIcon />
              </button>
            )}
            <button type="button" className={secondaryButton} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
              Pick another day
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-7">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="flex items-baseline gap-2 text-[0.9375rem] font-semibold">
                {group.label}
                <span className="text-sm font-normal text-neutral-500">
                  {group.slots.length} free
                </span>
              </h2>
              <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {group.slots.map((slot) => {
                  const chosen = draft.slot?.startsAt === slot.startsAt
                  return (
                    <button
                      key={slot.startsAt}
                      type="button"
                      onClick={() => go('details', { slot })}
                      aria-pressed={chosen}
                      className={`h-12 rounded-xl border text-[0.9375rem] font-semibold whitespace-nowrap outline-neutral-950 transition-[border-color,background-color,color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] ${
                        chosen
                          ? 'border-neutral-950 bg-neutral-950 text-white'
                          : 'border-neutral-300 bg-white hover:border-neutral-950 hover:bg-neutral-50'
                      }`}
                    >
                      {timeLabel(slot.startsAt)}
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
          <p className="text-[0.9375rem] text-pretty text-neutral-600">
            Times are Philippine time. Each visit is booked for {clinic.defaultVisitMinutes} minutes; the clinic may change
            that when it confirms.
          </p>
        </div>
      )}
    </div>
  )
}
