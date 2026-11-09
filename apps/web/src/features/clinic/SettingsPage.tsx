import { type InputHTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, inputClass, inputErrorClass } from '../../components/forms'
import { CheckIcon, CopyIcon, ExternalIcon } from '../../components/icons'
import { Page, PageHeader } from '../../components/Page'
import { ApiError, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { clockOf } from '../appointments/calendar/calendarMath'
import { useClinic, useUpdateClinic } from './queries'
import type { Clinic, ClinicInput } from './types'
import { useLeaveGuard } from './useLeaveGuard'

type Field = 'name' | 'address' | 'phone' | 'email' | 'opensAt' | 'closesAt' | 'defaultVisitMinutes' | 'onlineBookingEnabled'
type FieldErrors = Partial<Record<Field, string>>

// What to say under a field the server refused (its own wording is technical).
const FIELD_MESSAGES: Record<Field, string> = {
  name: 'Enter the clinic’s name, up to 200 characters.',
  address: 'Use up to 500 characters.',
  phone: 'Enter a phone number, like 0917 123 4567.',
  email: 'Enter an email address, like name@example.com.',
  opensAt: 'Choose an opening time on a quarter hour, like 8:00 AM.',
  closesAt: 'Choose a closing time on a quarter hour, after the opening time.',
  defaultVisitMinutes: 'Choose a length between 5 minutes and 8 hours.',
  onlineBookingEnabled: 'Choose whether online booking is on.',
}

/** The patients' booking page. */
const bookingUrl = () => `${window.location.origin}/book`

/** The API answers a bad form with messages like "opensAt: must be a multiple of 15". */
function fieldErrorsFrom(error: unknown): FieldErrors {
  if (!(error instanceof ApiError) || error.status !== 400) return {}
  const messages = (error.details as { message?: unknown } | undefined)?.message
  const errors: FieldErrors = {}
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message !== 'string') continue
    const field = message.split(': ')[0] as Field
    if (field in FIELD_MESSAGES && !errors[field]) errors[field] = FIELD_MESSAGES[field]
  }
  return errors
}

/** 'HH:MM' from a time box to minutes after midnight, or null when empty. */
function toMinutes(clock: string) {
  const match = /^(\d{2}):(\d{2})/.exec(clock)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/** 420 becomes "7:00 AM". */
function timeLabel(minutes: number) {
  const hour = Math.floor(minutes / 60) % 24
  return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

/** 540 becomes "9 AM": the whole hours the calendar shows. */
function hourLabel(hour: number) {
  const h = hour % 24
  return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`
}

function durationLabel(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  const parts = []
  if (hours) parts.push(hours === 1 ? '1 hour' : `${hours} hours`)
  if (rest) parts.push(`${rest} minutes`)
  return parts.join(' ')
}

const VISIT_LENGTHS = [15, 30, 45, 60, 90, 120]

function shortLength(minutes: number) {
  if (minutes < 60) return `${minutes} min`
  if (minutes % 60 === 0) return `${minutes / 60} hr`
  return `${Math.floor(minutes / 60)} hr ${minutes % 60} min`
}

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-neutral-950 pt-5">
      <legend className="float-left w-full text-lg font-semibold">{title}</legend>
      {description && <p className="clear-both pt-1 text-sm text-neutral-600">{description}</p>}
      <div className="clear-both grid gap-5 pt-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

function TextField({
  name,
  label,
  error,
  hint,
  className,
  ...input
}: { name: Field; label: string; error?: string; hint?: string; className?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'className'>) {
  return (
    <FormField id={name} label={label} error={error} hint={hint} className={className}>
      <input id={name} name={name} {...input} className={error ? inputErrorClass : inputClass} {...fieldAria(name, error, hint)} />
    </FormField>
  )
}

/** The clinic's name, contact details, opening hours and usual visit length. Admins only. */
export default function SettingsPage() {
  useDocumentTitle('Clinic settings')
  const { data: clinic, isPending, isError, error, refetch } = useClinic()

  return (
    <Page narrow>
      <PageHeader title="Clinic settings" description="Shown to staff and patients. The schedule uses the opening hours and the visit length." />

      {isError ? (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ErrorBox className="flex-1">{errorMessage(error)}</ErrorBox>
          <button type="button" onClick={() => void refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Try again
          </button>
        </div>
      ) : isPending ? (
        <div className="mt-8 flex flex-col gap-10" aria-busy="true" aria-label="Loading settings">
          {[2, 2, 1].map((rows, i) => (
            <div key={i} className="border-t border-neutral-950 pt-5">
              <div className="h-5 w-32 rounded bg-neutral-100" />
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                {Array.from({ length: rows * 2 }, (_, j) => (
                  <div key={j} className="h-11 rounded-md bg-neutral-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <SettingsForm clinic={clinic} />
      )}
    </Page>
  )
}

/** What the boxes hold right now, all as text, so they can be compared with what is saved. */
type Draft = { name: string; address: string; phone: string; email: string; opensAt: string; closesAt: string; visit: number; online: boolean }

const draftOf = (clinic: Clinic): Draft => ({
  name: clinic.name,
  address: clinic.address ?? '',
  phone: clinic.phone ?? '',
  email: clinic.email ?? '',
  opensAt: clockOf(clinic.opensAt),
  closesAt: clockOf(clinic.closesAt),
  visit: clinic.defaultVisitMinutes,
  online: clinic.onlineBookingEnabled,
})

function SettingsForm({ clinic }: { clinic: Clinic }) {
  const update = useUpdateClinic()
  const [draft, setDraft] = useState<Draft>(() => draftOf(clinic))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const form = useRef<HTMLFormElement>(null)

  const saved0 = draftOf(clinic)
  const dirty = (Object.keys(saved0) as (keyof Draft)[]).some((key) => draft[key] !== saved0[key])
  const guard = useLeaveGuard(dirty)

  // After a refused save, put the cursor in the first box that needs fixing.
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
    setSaved(false)
    const field = key === 'visit' ? 'defaultVisitMinutes' : key === 'online' ? 'onlineBookingEnabled' : key
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  const bind = (key: Exclude<keyof Draft, 'visit' | 'online'>) => ({
    value: draft[key],
    onChange: (event: { target: { value: string } }) => set(key, event.target.value),
  })

  const lengths = VISIT_LENGTHS.includes(clinic.defaultVisitMinutes) ? VISIT_LENGTHS : [...VISIT_LENGTHS, clinic.defaultVisitMinutes].sort((a, b) => a - b)

  const opensAt = toMinutes(draft.opensAt)
  const closesAt = toMinutes(draft.closesAt)

  function discard() {
    setDraft(draftOf(clinic))
    setErrors({})
    setFormError(null)
  }

  async function save() {
    const found: FieldErrors = {}
    if (!draft.name.trim()) found.name = 'Enter the clinic’s name.'
    if (opensAt === null) found.opensAt = 'Enter the opening time.'
    else if (opensAt % 15 !== 0) found.opensAt = FIELD_MESSAGES.opensAt
    if (closesAt === null) found.closesAt = 'Enter the closing time.'
    else if (closesAt % 15 !== 0) found.closesAt = FIELD_MESSAGES.closesAt
    else if (opensAt !== null && closesAt <= opensAt) found.closesAt = 'The closing time must be after the opening time.'
    setSaved(false)
    setFormError(null)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFormError('Some details need fixing. They’re marked below.')
      return
    }

    // Only what changed is sent. An emptied optional box clears the saved value (null).
    const changes: ClinicInput = {}
    if (draft.name.trim() !== clinic.name) changes.name = draft.name.trim()
    for (const field of ['address', 'phone', 'email'] as const) {
      if (draft[field].trim() !== (clinic[field] ?? '')) changes[field] = draft[field].trim() || null
    }
    if (opensAt !== clinic.opensAt) changes.opensAt = opensAt!
    if (closesAt !== clinic.closesAt) changes.closesAt = closesAt!
    if (draft.visit !== clinic.defaultVisitMinutes) changes.defaultVisitMinutes = draft.visit
    if (draft.online !== clinic.onlineBookingEnabled) changes.onlineBookingEnabled = draft.online
    if (Object.keys(changes).length === 0) return

    try {
      const result = await update.mutateAsync(changes)
      setDraft(draftOf(result))
      setSaved(true)
    } catch (caught) {
      const fields = fieldErrorsFrom(caught)
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
        setFormError('Some details need fixing. They’re marked below.')
      } else {
        setFormError(errorMessage(caught))
      }
    }
  }

  const hoursOk = opensAt !== null && closesAt !== null && closesAt > opensAt
  const showFrom = hoursOk ? Math.floor(opensAt / 60) : 0
  const showTo = hoursOk ? Math.ceil(closesAt / 60) : 0

  return (
    <form
      ref={form}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
      className="mt-8 flex flex-col gap-10"
    >
      {formError && <ErrorBox>{formError}</ErrorBox>}

      <Section title="Clinic" description="Shown on the sign-in screen, patient messages and printouts.">
        <TextField name="name" label="Clinic name" autoComplete="off" required {...bind('name')} error={errors.name} className="sm:col-span-2" />
        <TextField name="address" label="Address" autoComplete="off" {...bind('address')} error={errors.address} className="sm:col-span-2" />
        <TextField name="phone" label="Phone" type="tel" inputMode="tel" autoComplete="off" {...bind('phone')} error={errors.phone} />
        <TextField name="email" label="Email" type="email" autoComplete="off" spellCheck={false} {...bind('email')} error={errors.email} />
      </Section>

      <Section title="Opening hours" description="Philippine time. The schedule shows these hours.">
        <TextField name="opensAt" label="Opens at" type="time" step={900} required {...bind('opensAt')} error={errors.opensAt} />
        <TextField name="closesAt" label="Closes at" type="time" step={900} required {...bind('closesAt')} error={errors.closesAt} />
        <p className="text-sm text-neutral-700 sm:col-span-2" aria-live="polite">
          {hoursOk
            ? `Open ${timeLabel(opensAt)} to ${timeLabel(closesAt)}, ${durationLabel(closesAt - opensAt)}. The calendar shows ${hourLabel(showFrom)} to ${hourLabel(showTo)}.`
            : 'Choose an opening time and a later closing time to see how the calendar will look.'}
        </p>
      </Section>

      <Section title="Appointments">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span id="visit-label" className="text-sm font-semibold">
            Usual visit length
          </span>
          <div role="radiogroup" aria-labelledby="visit-label" aria-describedby="visit-hint" className="flex flex-wrap gap-2">
            {lengths.map((minutes) => (
              <button
                key={minutes}
                type="button"
                role="radio"
                aria-checked={draft.visit === minutes}
                onClick={() => set('visit', minutes)}
                className="h-10 min-w-16 rounded-md border border-neutral-300 px-3.5 text-sm font-semibold text-neutral-800 outline-neutral-950 hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 aria-checked:border-neutral-950 aria-checked:bg-neutral-950 aria-checked:text-white"
              >
                {shortLength(minutes)}
              </button>
            ))}
          </div>
          <p id="visit-hint" className="text-sm text-neutral-600">
            New bookings start with this length. It can be changed for each one.
          </p>
          {errors.defaultVisitMinutes && <p className="text-sm font-medium">{errors.defaultVisitMinutes}</p>}
        </div>
      </Section>

      <OnlineBookingSection clinic={clinic} draft={draft} error={errors.onlineBookingEnabled} onOnline={(value) => set('online', value)} />

      <div className="-mt-4 flex min-h-5 items-center gap-x-6 text-sm text-neutral-600">
        <p role="status" aria-live="polite" className="flex items-center gap-2 font-medium text-neutral-950">
          {saved && !dirty && (
            <>
              <CheckIcon className="size-4 shrink-0" /> Saved. The schedule now uses these settings.
            </>
          )}
        </p>
        <p className="ml-auto">Last changed {formatDateTime(clinic.updatedAt)}</p>
      </div>

      {/* Appears only when there is something to save, and stays in view at the bottom. */}
      {(dirty || guard.leaveTo) && (
        <div className="sticky bottom-0 z-10 -mx-5 -mb-8 border-t border-neutral-950 bg-white px-5 py-3 sm:-mx-8 sm:-mb-10 sm:px-8" role="region" aria-label="Unsaved changes">
          {guard.leaveTo ? (
            // Keys, so the two sets of buttons are never the same DOM elements: a "Save" submit button
            // reused as "Leave" would submit the form as the click finishes.
            <div key="leave" className="flex flex-wrap items-center gap-3">
              <p className="mr-auto font-semibold">Leave without saving? Your changes will be lost.</p>
              <button type="button" onClick={guard.stay} autoFocus className={`${buttonOnLight} h-10 px-5 text-sm`}>
                Keep editing
              </button>
              <button type="button" onClick={guard.leave} className={`${buttonOutline} h-10 px-4 text-sm`}>
                Leave and discard
              </button>
            </div>
          ) : (
            <div key="save" className="flex flex-wrap items-center gap-3">
              <p className="mr-auto font-semibold">Unsaved changes</p>
              <button type="button" onClick={discard} disabled={update.isPending} className={`${buttonOutline} h-10 px-4 text-sm`}>
                Discard
              </button>
              <button type="submit" disabled={update.isPending} className={`${buttonOnLight} h-10 px-6 text-sm`}>
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          )}
        </div>
      )}
    </form>
  )
}

type OnlineProps = {
  clinic: Clinic
  draft: Draft
  error?: string
  onOnline: (value: boolean) => void
}

/**
 * Whether patients can book online, and the link to the booking page to share with them.
 */
function OnlineBookingSection({ clinic, draft, error, onOnline }: OnlineProps) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const statusId = useId()
  const url = bookingUrl()

  async function handleCopy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopy('copied')
    } catch {
      // Clipboard access can be blocked (for example on an unsecured address).
      setCopy('failed')
    }
  }

  return (
    <Section title="Online booking" description="Patients ask for appointments on the clinic’s own booking page, and make an account as they book. Every request waits in Requests until staff confirm it.">
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <span id="online-label" className="text-sm font-semibold">
          Booking page
        </span>
        <div role="radiogroup" aria-labelledby="online-label" aria-describedby="online-hint" className="flex flex-wrap gap-2">
          {[
            { value: false, label: 'Off' },
            { value: true, label: 'On' },
          ].map((option) => (
            <button
              key={option.label}
              type="button"
              role="radio"
              aria-checked={draft.online === option.value}
              onClick={() => onOnline(option.value)}
              className="h-10 min-w-16 rounded-md border border-neutral-300 px-3.5 text-sm font-semibold text-neutral-800 outline-neutral-950 hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 aria-checked:border-neutral-950 aria-checked:bg-neutral-950 aria-checked:text-white"
            >
              {option.label}
            </button>
          ))}
        </div>
        <p id="online-hint" className="text-sm text-neutral-600">
          {draft.online ? 'Patients can ask for appointments online. Staff still confirm, move or decline each one.' : 'Nobody can book online. The booking page isn’t available.'}
        </p>
      </div>

      <div className="border-t border-neutral-200 pt-4 sm:col-span-2" aria-live="polite">
        <p className="text-sm font-semibold">
          {clinic.onlineBookingEnabled ? 'The clinic’s booking page' : 'The clinic’s booking page, switched off'}
        </p>
        <p className="mt-1 font-medium break-all">{url}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => void handleCopy(url)} aria-describedby={statusId} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
            {copy === 'copied' ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
            {copy === 'copied' ? 'Copied' : 'Copy link'}
          </button>
          <a href={url} target="_blank" rel="noopener" className={`${buttonOutline} h-9 px-3.5 text-sm`}>
            <ExternalIcon className="size-4" /> Open page
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </div>
        <p id={statusId} role="status" className="mt-2 min-h-5 text-sm text-neutral-600">
          {copy === 'copied' && 'Copied. Put it on the clinic’s social media page or in messages to patients.'}
          {copy === 'failed' && 'Couldn’t copy. Select the address and copy it yourself.'}
          {copy === 'idle' && !clinic.onlineBookingEnabled && 'Switch booking on and save before sharing it.'}
        </p>
        {error && <p className="mt-1 text-sm font-medium">{error}</p>}
      </div>
    </Section>
  )
}
