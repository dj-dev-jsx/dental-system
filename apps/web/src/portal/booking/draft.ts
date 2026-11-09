import { useLocation, useNavigate, useSearchParams } from 'react-router'
import type { PortalAppointment, Slot } from '../api'

// The booking's choices live in the browser history's state, one entry per step: the
// address only says which step (?step=day), so Back and Forward walk the steps with the
// choices made at each, a reload keeps them, and what the visit is for never shows in the
// address bar or in the history list of a shared phone.

// Four steps. The day and the time are one screen: the times appear under the calendar.
export const STEPS = ['reason', 'dentist', 'day', 'details'] as const
export type FormStep = (typeof STEPS)[number]
export type Step = FormStep | 'email' | 'sent'

export const STEP_TITLES: Record<FormStep, string> = {
  reason: 'What is the visit for?',
  dentist: 'Which dentist?',
  day: 'Choose a day and time',
  details: 'Your details',
}

export const REASONS = [
  'Check-up and cleaning',
  'Tooth pain',
  'Filling or a broken tooth',
  'Tooth removal',
  'Braces or straightening',
  'Something else',
] as const

export const NOTE_MAX = 300

export type Draft = {
  reason?: string
  note?: string
  /** A dentist's id, or 'any'. */
  dentist?: string
  date?: string
  slot?: Slot
}

export type BookingState = {
  draft: Draft
  /** Shown once on the step it arrives with, like "that time was just taken". */
  notice?: string
  /** The address the confirmation link went to (the check-your-email step). */
  email?: string
  /** The request that was sent (the last step). */
  sent?: PortalAppointment
}

/** What the clinic reads as the reason: the choice, plus the patient's own words if any. */
export function reasonText(draft: Draft) {
  const note = draft.note?.trim()
  if (!draft.reason) return ''
  if (draft.reason === 'Something else') return note ?? ''
  return note ? `${draft.reason}: ${note}` : draft.reason
}

/** The first step that still needs an answer. */
export function firstMissing(draft: Draft): FormStep {
  if (!reasonText(draft)) return 'reason'
  if (!draft.dentist) return 'dentist'
  if (!draft.date || !draft.slot) return 'day'
  return 'details'
}

function isStep(value: string | null): value is Step {
  return value !== null && ([...STEPS, 'email', 'sent'] as string[]).includes(value)
}

export function useBooking() {
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const raw = params.get('step')
  // ?step=time is from before the day and time shared a screen: it is the day step now.
  const step: Step = raw === 'time' ? 'day' : isStep(raw) ? raw : 'reason'
  const state = (location.state as BookingState | null) ?? { draft: {} }
  const draft = state.draft ?? {}

  /** Goes to a step, with the draft changed by `patch`. A new history entry unless `replace`. */
  function go(to: Step, patch: Partial<Draft> = {}, extra: Omit<BookingState, 'draft'> & { replace?: boolean } = {}) {
    const { replace, ...rest } = extra
    // Keep the choice on the current entry too, so Back returns to this step with it made.
    if (!replace) {
      const current = window.history.state as { usr?: BookingState } | null
      window.history.replaceState({ ...current, usr: { ...state, notice: undefined, draft: { ...draft, ...patch } } }, '')
    }
    navigate({ search: `?step=${to}` }, { state: { draft: { ...draft, ...patch }, ...rest } satisfies BookingState, replace })
  }

  return { step, state, draft, go }
}
