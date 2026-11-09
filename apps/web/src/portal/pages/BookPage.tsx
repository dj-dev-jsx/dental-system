import { type ComponentType, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { ArrowLeftIcon, ChevronDownIcon } from '../../components/icons'
import { dentistName, formatDayLong } from '../../lib/format'
import { DetailsStep } from '../booking/DetailsStep'
import { type Draft, firstMissing, type FormStep, STEP_TITLES, STEPS, useBooking } from '../booking/draft'
import { CheckEmail, RequestSent } from '../booking/outcomes'
import { DayStep, DentistStep, ReasonStep } from '../booking/steps'
import { timeLabel } from '../format'
import { useSession } from '../session'
import { NarrowColumn, PortalPage, ScreenHeading } from '../ui'
import { useClinic, usePortalTitle } from '../clinic-context'

// /book — one question per screen, phones first. The choices so far sit in a
// card beside the steps on wide screens; on phones they ride in a bar along the bottom that
// opens to the same rows, each with Change.

const STEP_COMPONENTS: Record<FormStep, ComponentType> = {
  reason: ReasonStep,
  dentist: DentistStep,
  day: DayStep,
  details: DetailsStep,
}

/** Short names for the progress bar. */
const STEP_NAMES: Record<FormStep, string> = {
  reason: 'Reason',
  dentist: 'Dentist',
  day: 'Day and time',
  details: 'Your details',
}

function useSummaryRows(draft: Draft) {
  const { clinic } = useClinic()
  const dentist =
    draft.dentist === 'any'
      ? 'Any dentist'
      : clinic.dentists.find((d) => d.id === draft.dentist)
        ? dentistName(clinic.dentists.find((d) => d.id === draft.dentist)!)
        : undefined
  const rows: { step: FormStep; label: string; value: string | undefined; short?: string }[] = [
    { step: 'reason', label: 'For', value: draft.reason === 'Something else' ? draft.note : draft.reason },
    { step: 'dentist', label: 'Dentist', value: dentist },
    {
      step: 'day',
      label: 'Day',
      value: draft.date ? formatDayLong(draft.date).replace(/, \d{4}$/, '') : undefined,
      short: draft.date ? formatDayLong(draft.date).replace(/, \d{4}$/, '').replace(/^(\w{3})\w*, (\w{3})\w*/, '$1, $2') : undefined,
    },
    {
      step: 'day',
      label: 'Time',
      value: draft.slot ? `${timeLabel(draft.slot.startsAt)} to ${timeLabel(draft.slot.endsAt)}` : undefined,
      short: draft.slot ? timeLabel(draft.slot.startsAt) : undefined,
    },
  ]
  return rows
}

function Summary({ step }: { step: FormStep }) {
  const { draft, go } = useBooking()
  const rows = useSummaryRows(draft)
  return (
    <dl>
      {rows.map((row) => (
        <div key={row.label} className="flex items-start justify-between gap-4 border-b border-neutral-200 py-3 last:border-b-0">
          <div className="min-w-0">
            <dt className="text-sm text-neutral-600">{row.label}</dt>
            <dd className={`mt-0.5 break-words ${row.value ? 'font-semibold' : 'text-neutral-400'}`}>{row.value ?? 'Not chosen yet'}</dd>
          </div>
          {row.value && row.step !== step && (
            <button
              type="button"
              onClick={() => go(row.step)}
              className="-my-1 inline-flex min-h-11 shrink-0 items-center rounded-lg px-1 text-sm font-semibold underline decoration-neutral-400 decoration-[1.5px] underline-offset-4 outline-neutral-950 hover:decoration-neutral-950 focus-visible:outline-2"
            >
              Change<span className="sr-only"> {row.label.toLowerCase()}</span>
            </button>
          )}
        </div>
      ))}
    </dl>
  )
}

/** On phones: the choices so far in a bar along the bottom, opening upwards to the same rows. */
function PhoneSummary({ step }: { step: FormStep }) {
  const { draft } = useBooking()
  const [open, setOpen] = useState(false)
  const values = useSummaryRows(draft)
    .map((row) => row.short ?? row.value)
    .filter(Boolean)
  // The first step has its own bar (Continue), and nothing to sum up yet.
  if (values.length === 0 || step === 'reason') return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 backdrop-blur-sm lg:hidden">
      {open && (
        <div id="phone-visit" className="max-h-[60svh] overflow-y-auto border-b border-neutral-200 px-5 pt-2">
          <Summary step={step} />
        </div>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="phone-visit"
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-16 w-full items-center gap-3 px-5 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-left outline-neutral-950 focus-visible:outline-2 focus-visible:-outline-offset-4"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-neutral-500">Your visit</span>
          <span className="block truncate text-[0.9375rem] font-semibold">{values.join(' · ')}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-sm font-semibold">
          {open ? 'Hide' : 'Show'}
          <ChevronDownIcon className={`size-4 transition-transform duration-200 ${open ? '' : 'rotate-180'}`} />
        </span>
      </button>
    </div>
  )
}

function StepMeter({ step }: { step: FormStep }) {
  const { go } = useBooking()
  const index = STEPS.indexOf(step)
  const back =
    'inline-flex min-h-11 items-center gap-1.5 rounded-lg pr-2 font-semibold outline-neutral-950 underline-offset-4 hover:underline focus-visible:outline-2'
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between gap-4">
        {index === 0 ? (
          <Link to="/" className={back}>
            <ArrowLeftIcon className="size-[1.125rem]" /> Back
          </Link>
        ) : (
          <button type="button" onClick={() => go(STEPS[index - 1])} className={back}>
            <ArrowLeftIcon className="size-[1.125rem]" /> Back
          </button>
        )}
        <p className="text-sm text-neutral-600">
          Step {index + 1} of {STEPS.length}
          {index < STEPS.length - 1 && <span className="sm:hidden"> · Next: {STEP_NAMES[STEPS[index + 1]].toLowerCase()}</span>}
        </p>
      </div>
      <ol className="mt-3 grid grid-cols-4 gap-1.5" aria-hidden="true">
        {STEPS.map((s, i) => (
          <li key={s}>
            <span
              className={`block h-1.5 rounded-full transition-colors duration-300 ${
                i < index ? 'bg-neutral-950' : i === index ? 'bg-neutral-950' : 'bg-neutral-200'
              }`}
            />
            <span className={`mt-2 hidden text-xs sm:block ${i === index ? 'font-semibold text-neutral-950' : 'text-neutral-500'}`}>
              {STEP_NAMES[s]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

const STEP_LEADS: Partial<Record<FormStep, string>> = {
  reason: 'Choose the closest one. You can add a note for the clinic.',
  dentist: 'Choose Any dentist for the most free times.',
  day: 'Pick a day, then one of its free times.',
  details: 'The clinic needs these to know who is coming.',
}

export default function BookPage() {
  const { clinic } = useClinic()
  const { step, state, draft, go } = useBooking()
  const session = useSession()

  const title = step === 'email' ? 'Check your email' : step === 'sent' ? 'Request sent' : STEP_TITLES[step]
  usePortalTitle(title)

  if (step === 'email') {
    if (!state.email) return <Navigate to={{ search: `?step=${firstMissing(draft)}` }} state={state} replace />
    return (
      <PortalPage>
        <NarrowColumn>
          <CheckEmail email={state.email} onChangeEmail={() => go('details', {}, { email: undefined })} />
        </NarrowColumn>
      </PortalPage>
    )
  }
  if (step === 'sent') {
    if (!state.sent) return <Navigate to="/appointments" replace />
    return (
      <PortalPage>
        <NarrowColumn>
          <RequestSent appointment={state.sent} email={session.data?.email} />
        </NarrowColumn>
      </PortalPage>
    )
  }

  // A step can't come before what it needs, such as a time before a day (an old link, a reload).
  const missing = firstMissing(draft)
  if (STEPS.indexOf(step) > STEPS.indexOf(missing)) {
    return <Navigate to={{ search: `?step=${missing}` }} state={state} replace />
  }

  const Step = STEP_COMPONENTS[step]
  const lead = STEP_LEADS[step]

  return (
    <PortalPage bottomBar={step !== 'reason'}>
      <div className="mx-auto grid max-w-6xl gap-12 px-5 pt-6 pb-10 sm:px-10 sm:pt-10 lg:grid-cols-[minmax(0,40rem)_20rem] lg:justify-between lg:gap-16 lg:pb-20">
        <div className="min-w-0">
          <StepMeter step={step} />
          {/* The key gives each step a fresh heading, which takes focus when it appears. */}
          <div key={step} className="rise-in">
            <ScreenHeading>{STEP_TITLES[step]}</ScreenHeading>
            {lead && <p className="mt-3 text-[1.0625rem]/7 text-pretty text-neutral-600">{lead}</p>}
            <Step />
          </div>
        </div>
        <aside className="hidden lg:block" aria-label="Your visit">
          <div className="sticky top-8 rounded-2xl border border-neutral-200 bg-neutral-50 p-6">
            <h2 className="text-lg font-bold tracking-[-0.01em]">Your visit</h2>
            <p className="mt-0.5 text-sm text-neutral-600">at {clinic.name}</p>
            <div className="mt-4 border-t border-neutral-950">
              <Summary step={step} />
            </div>
            <p className="mt-4 rounded-xl bg-white px-3.5 py-3 text-sm/6 text-pretty text-neutral-700 ring-1 ring-neutral-200">
              A request until {clinic.name} confirms it. We email you when they do.
            </p>
          </div>
        </aside>
      </div>
      <PhoneSummary step={step} />
    </PortalPage>
  )
}
