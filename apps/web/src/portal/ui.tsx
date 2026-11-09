import { type ReactNode, type Ref, useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon, InfoIcon, SignOutIcon } from '../components/icons'
import { TickIcon } from './icons'
import { RevealButton } from './RevealButton'
import type { AppointmentStatus } from './api'
import { useClinic } from './clinic-context'
import { STATUS_WORDS } from './format'
import { signOut, useSession } from './session'

// The frame and small parts every patient page shares. The Lightbox palette (ink, paper,
// greys only; ink marks the main action, what is chosen and focus. Larger
// tap targets and plainer words: patients use their phones, often once or twice a year.

function HeaderAction({ tone }: { tone: 'light' | 'dark' }) {
  const session = useSession()
  const look =
    tone === 'dark'
      ? 'border-white/30 text-white outline-white hover:border-white hover:bg-white/10'
      : 'border-neutral-300 text-neutral-950 outline-neutral-950 hover:border-neutral-950'
  // While we don't know yet, keep the space so nothing jumps.
  if (session.isPending) return <span className="h-11 w-24" aria-hidden="true" />
  const signedIn = Boolean(session.data)
  if (!signedIn) {
    return (
      <Link
        to="/sign-in"
        className={`inline-flex h-11 shrink-0 items-center rounded-full border px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4 ${look}`}
      >
        Sign in
      </Link>
    )
  }
  return (
    <div className="flex shrink-0 items-center gap-2">
      <Link
        to="/appointments"
        className={`inline-flex h-11 shrink-0 items-center rounded-full border px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-4 ${look}`}
      >
        {/* On phones the shorter word leaves room for the clinic's name. */}
        <span className="sm:hidden">Appointments</span>
        <span className="hidden sm:inline">My appointments</span>
      </Link>
      <SignOutButton tone={tone} />
    </div>
  )
}

/** Sign out from any patient page, one tap, for shared phones and computers. */
function SignOutButton({ tone }: { tone: 'light' | 'dark' }) {
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle')
  const label = state === 'working' ? 'Signing out…' : state === 'failed' ? 'Couldn’t sign out. Try again' : 'Sign out'
  return (
    <button
      type="button"
      disabled={state === 'working'}
      aria-label={label}
      title={label}
      onClick={() => {
        setState('working')
        signOut().catch(() => setState('failed'))
      }}
      className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[0.9375rem] font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait sm:px-3.5 ${
        tone === 'dark' ? 'text-white/85 outline-white hover:bg-white/10 hover:text-white' : 'text-neutral-700 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950'
      }`}
    >
      <SignOutIcon className="size-[1.125rem]" />
      <span className="hidden sm:inline">{state === 'failed' ? 'Try again' : 'Sign out'}</span>
    </button>
  )
}

/** The clinic's initials, standing in for a logo until clinics can upload one. */
export function ClinicMark({ tone = 'light', className = '' }: { tone?: 'light' | 'dark'; className?: string }) {
  const { clinic } = useClinic()
  const initials = clinic.name
    .split(/\s+/)
    .filter((word) => /^[A-Za-z]/.test(word) && !/^(of|the|and|&)$/i.test(word))
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
  return (
    <span
      aria-hidden="true"
      className={`${className || 'grid'} size-9 shrink-0 place-items-center rounded-lg text-[0.8125rem] font-bold tracking-[-0.01em] ${tone === 'dark' ? 'bg-white text-neutral-950' : 'bg-neutral-950 text-white'}`}
    >
      {initials}
    </span>
  )
}

/** The clinic's name on the left (it is the clinic's website), sign in or my appointments right. */
export function PortalHeader({ tone = 'light' }: { tone?: 'light' | 'dark' }) {
  const { clinic } = useClinic()
  const dark = tone === 'dark'
  return (
    <header className={dark ? 'text-white' : 'border-b border-neutral-200 bg-white text-neutral-950'}>
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-[4.5rem] sm:px-10">
        <Link
          to="/"
          className={`flex min-w-0 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 ${dark ? 'outline-white' : 'outline-neutral-950'}`}
        >
          {/* On phones the name alone, so it fits beside the button. */}
          <ClinicMark tone={tone} className="hidden sm:grid" />
          <span className="truncate text-[1.0625rem] font-bold tracking-[-0.02em]">{clinic.name}</span>
        </Link>
        <HeaderAction tone={tone} />
      </div>
    </header>
  )
}

export function PortalFooter() {
  const { clinic } = useClinic()
  return (
    <footer className="mt-auto px-5 pb-10 sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 border-t border-neutral-200 pt-6 text-sm/6 text-neutral-600 md:flex-row md:justify-between">
        <div>
          <p className="font-semibold text-neutral-950">{clinic.name}</p>
          {clinic.address && <p className="whitespace-pre-line">{clinic.address}</p>}
          {clinic.phone && (
            <p>
              <a href={`tel:${clinic.phone.replace(/[^\d+]/g, '')}`} className="underline underline-offset-3 outline-neutral-950 hover:text-neutral-950 focus-visible:outline-2">
                {clinic.phone}
              </a>
            </p>
          )}
        </div>
        <p className="max-w-md text-neutral-500">
          Your details are kept by {clinic.name} and used only for your appointments, under the Data
          Privacy Act of 2012. Sign out when you’re done on a shared phone or computer.
        </p>
      </div>
    </footer>
  )
}

/** A white page with the clinic's header and footer. */
export function PortalPage({ children, bottomBar = false }: { children: ReactNode; bottomBar?: boolean }) {
  return (
    <div className={`flex min-h-full flex-col bg-white text-neutral-950 selection:bg-neutral-950 selection:text-white ${bottomBar ? 'pb-20 lg:pb-0' : ''}`}>
      <PortalHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <PortalFooter />
    </div>
  )
}

/** A centred column for one task at a time: check your email, reset a password. */
export function NarrowColumn({ children }: { children: ReactNode }) {
  return <div className="rise-in mx-auto w-full max-w-md px-5 pt-10 pb-20 sm:px-0 sm:pt-16">{children}</div>
}

/**
 * The screen's heading. It takes focus when it appears, so screen readers announce each new
 * step, and the page starts from the top.
 */
export function ScreenHeading({ children, focus = true, className = '' }: { children: ReactNode; focus?: boolean; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!focus) return
    window.scrollTo({ top: 0 })
    ref.current?.focus({ preventScroll: true })
  }, [focus])
  return (
    <h1 ref={ref} tabIndex={-1} className={`text-[1.875rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance outline-none sm:text-[2.5rem] ${className}`}>
      {children}
    </h1>
  )
}

export function Lead({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mt-3 text-[1.0625rem]/7 text-pretty text-neutral-600 ${className}`}>{children}</p>
}

/** Neutral information in a mist box, read out politely. */
export function Notice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex gap-3 rounded-xl bg-neutral-100 px-4 py-3.5 text-[0.9375rem]/6 text-neutral-900 ${className}`} role="status">
      <InfoIcon className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** An error: an inverted ink box (never red), read out at once. */
export function Problem({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`flex gap-3 rounded-xl bg-neutral-950 px-4 py-3.5 text-[0.9375rem]/6 text-white ${className}`} role="alert">
      <AlertIcon className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  )
}

/** A link inside a Problem box. */
export const problemLink = 'font-semibold underline underline-offset-3 outline-white focus-visible:outline-2'
export const textLink =
  'font-semibold text-neutral-950 underline underline-offset-4 decoration-neutral-400 decoration-[1.5px] outline-neutral-950 hover:decoration-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2 rounded-sm'

const buttonBase =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,border-color,color,transform] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99]'

/** The main button of a patient screen: ink, 48px, full width on phones. */
export const primaryButton = `${buttonBase} h-12 w-full bg-neutral-950 px-6 text-base text-white outline-neutral-950 hover:bg-neutral-800 disabled:cursor-wait disabled:bg-neutral-950/70 sm:w-auto`
export const secondaryButton = `${buttonBase} h-12 w-full border border-neutral-300 bg-white px-6 text-base text-neutral-950 outline-neutral-950 hover:border-neutral-950 disabled:cursor-wait disabled:text-neutral-500 sm:w-auto`

/** Something failed to load: says so, with a way to try again. */
export function LoadFailed({ message, onRetry, retrying }: { message: string; onRetry: () => void; retrying?: boolean }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <Problem>{message}</Problem>
      <button type="button" onClick={onRetry} disabled={retrying} className={secondaryButton}>
        {retrying ? 'Trying again…' : 'Try again'}
      </button>
    </div>
  )
}

/** Text boxes on the patient pages: 48px, softer corners, an ink border and soft ring when focused. */
const inputBase =
  'w-full rounded-xl border bg-white px-3.5 text-base text-neutral-950 transition-[border-color,box-shadow] duration-150 placeholder:text-neutral-500 focus:outline-none'
export const portalInput = `${inputBase} h-12 border-neutral-300 hover:border-neutral-500 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/10`
export const portalInputError = `${inputBase} h-12 border-2 border-neutral-950 focus:ring-4 focus:ring-neutral-950/10`
export const portalTextarea = `${inputBase} min-h-24 border-neutral-300 py-3 hover:border-neutral-500 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/10`
export const portalTextareaError = `${inputBase} min-h-24 border-2 border-neutral-950 py-3 focus:ring-4 focus:ring-neutral-950/10`

export { RevealButton }

type FieldProps = {
  label: string
  error?: string
  hint?: ReactNode
  /** The box holds a value that passed its check: a small tick shows at its right. */
  valid?: boolean
  children: (props: { id: string; className: string; 'aria-invalid'?: true; 'aria-describedby'?: string }) => ReactNode
}

/** A label, the box (from the render prop, which gets its id, look and aria), a hint or error. */
export function Field({ label, error, hint, valid, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[0.9375rem] font-semibold">
        {label}
      </label>
      <div className="relative">
        {children({
          id,
          className: `${error ? portalInputError : portalInput}${valid && !error ? ' pr-11' : ''}`,
          'aria-invalid': error ? true : undefined,
          'aria-describedby': describedBy,
        })}
        {valid && !error && (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 grid place-items-center text-neutral-950" aria-hidden="true">
            <TickIcon className="size-[1.125rem]" strokeWidth={2.25} />
          </span>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-sm/5 text-neutral-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="flex items-start gap-1.5 text-sm/5 font-semibold">
          <AlertIcon className="mt-px size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/** A password box with Show / Hide. */
export function PasswordField({
  label,
  name,
  autoComplete,
  error,
  hint,
  inputRef,
  autoFocus,
}: {
  label: string
  name: string
  autoComplete: 'current-password' | 'new-password'
  error?: string
  hint?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <Field label={label} error={error} hint={hint}>
      {({ className, ...props }) => (
        <>
          <input
            {...props}
            ref={inputRef}
            name={name}
            type={shown ? 'text' : 'password'}
            autoComplete={autoComplete}
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            required
            maxLength={128}
            className={`${className} pr-12`}
          />
          <RevealButton shown={shown} onToggle={() => setShown((value) => !value)} controls={props.id} />
        </>
      )}
    </Field>
  )
}

const STATUS_PILL: Record<AppointmentStatus, string> = {
  // Like the staff calendar: a request is a dashed outline because it doesn't hold the time yet.
  // Confirmed is solid ink: it holds the time.
  REQUESTED: 'border border-dashed border-neutral-950 text-neutral-950',
  CONFIRMED: 'bg-neutral-950 text-white',
  DECLINED: 'border border-neutral-950 text-neutral-950',
  CANCELLED: 'border border-neutral-300 text-neutral-600',
}

export function StatusPill({ status }: { status: AppointmentStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.8125rem]/5 font-semibold whitespace-nowrap ${STATUS_PILL[status]}`}>
      {STATUS_WORDS[status]}
    </span>
  )
}

/** Grey bars where content is coming. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`rounded-xl bg-neutral-100 ${className}`} aria-hidden="true" />
}

export function LoadingLine() {
  return <p className="appear-late text-sm text-neutral-500">Loading…</p>
}
