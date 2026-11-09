import { useMutation, useQueryClient } from '@tanstack/react-query'
import { type FormEvent, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon } from '../../components/icons'
import { ApiError } from '../../lib/api'
import { todayInManila } from '../../lib/format'
import { type BookingRequest, commonMessage, errorCode, fieldMessages, isSignedOut, type Me, portalApi, type Registration } from '../api'
import { ForgotPasswordLink, UnverifiedProblemBody } from '../auth'
import { appointmentsKey, meKey, signOut, useForgetSession, useSession } from '../session'
import { Field, PasswordField, primaryButton, Problem, problemLink, Skeleton, textLink } from '../ui'
import { type Draft, reasonText, useBooking } from './draft'
import { useClinic } from '../clinic-context'
import { isUnverified, signInMessage } from '../auth-messages'

// The last step: who is booking. Signed in: one button. New: create an account (the request
// waits until the email is confirmed). Has an account: sign in here and send it.

function requestOf(draft: Draft): BookingRequest {
  return {
    startsAt: draft.slot!.startsAt,
    dentistId: draft.dentist && draft.dentist !== 'any' ? draft.dentist : null,
    reason: reasonText(draft),
  }
}

/**
 * What to do with a refused booking. A time someone else just took sends the patient back to
 * the times, freshly loaded. Returns the sentence to show for everything else.
 */
function useBookingRefusal() {
  const { clinic } = useClinic()
  const { go } = useBooking()
  const queryClient = useQueryClient()
  const call = clinic.phone ? ` or call the clinic at ${clinic.phone}` : ''

  return (error: unknown): string | null => {
    const code = errorCode(error)
    if (code === 'SLOT_TAKEN' || code === 'SLOT_NOT_AVAILABLE') {
      void queryClient.invalidateQueries({ queryKey: ['portal', 'slots'] })
      go('day', { slot: undefined }, {
        notice: 'Sorry, that time was just taken. Here are the times that are still free.',
      })
      return null
    }
    if ('dentistId' in fieldMessages(error) || 'request.dentistId' in fieldMessages(error)) {
      go('dentist', { dentist: undefined, slot: undefined }, { notice: undefined })
      return null
    }
    if (code === 'TOO_MANY_REQUESTS') return 'TOO_MANY_REQUESTS'
    if (error instanceof ApiError && error.status === 429) {
      return `You’ve sent several requests in the last hour. Try again later${call}.`
    }
    return commonMessage(error)
  }
}

function RefusalBox({ message }: { message: string }) {
  if (message === 'TOO_MANY_REQUESTS') {
    return (
      <Problem>
        You already have 3 requests waiting for the clinic. Wait for an answer, or cancel one in{' '}
        <Link to="/appointments" className={problemLink}>
          My appointments
        </Link>
        , then book this one.
      </Problem>
    )
  }
  return <Problem>{message}</Problem>
}

export function DetailsStep() {
  const session = useSession()
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'new' | 'account'>('new')
  // A refusal that came back right after signing in here, shown on the signed-in view.
  const [carried, setCarried] = useState<string | null>(null)

  if (session.isPending) {
    return (
      <div className="mt-8 flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-11" />
        <Skeleton className="h-11" />
      </div>
    )
  }
  if (session.data) return <SignedInSend me={session.data} initialMessage={carried} />

  return (
    <div className="mt-6">
      <div role="group" aria-label="Do you have an account?" className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1">
        {(
          [
            ['new', 'I’m new here'],
            ['account', 'I have an account'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => setMode(value)}
            className={`h-11 rounded-xl text-[0.9375rem] font-semibold outline-neutral-950 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 ${
              mode === value ? 'bg-white text-neutral-950 shadow-[0_1px_2px_rgb(10_10_10/0.08),0_1px_6px_rgb(10_10_10/0.06)] ring-1 ring-neutral-950/5' : 'text-neutral-600 hover:text-neutral-950'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'new' ? (
        <RegisterForm />
      ) : (
        <SignInAndSend
          onSignedIn={(message) => {
            setCarried(message)
            void queryClient.invalidateQueries({ queryKey: meKey() })
          }}
        />
      )}
    </div>
  )
}

function SignedInSend({ me, initialMessage }: { me: Me; initialMessage: string | null }) {
  const { draft, go } = useBooking()
  const queryClient = useQueryClient()
  const forget = useForgetSession()
  const refusal = useBookingRefusal()
  const [message, setMessage] = useState<string | null>(initialMessage)
  const [signingOut, setSigningOut] = useState(false)

  const book = useMutation({
    mutationFn: () => portalApi.book(requestOf(draft)),
    onSuccess: (sent) => {
      void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
      go('sent', {}, { sent, replace: true })
    },
    onError: (error) => {
      if (isSignedOut(error)) return forget() // the session ended: the sign-in forms appear
      setMessage(refusal(error))
    },
  })

  return (
    <div className="mt-8">
      <dl className="flex items-center gap-4 rounded-2xl border border-neutral-200 p-4">
        <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-full bg-neutral-950 font-bold text-white">
          {(me.firstName[0] ?? '').toUpperCase()}
          {(me.lastName[0] ?? '').toUpperCase()}
        </span>
        <div className="min-w-0">
          <dt className="text-sm text-neutral-600">Booking as</dt>
          <dd className="text-[1.0625rem] font-semibold">
            {me.firstName} {me.lastName}
          </dd>
          <dd className="text-[0.9375rem] [overflow-wrap:anywhere] text-neutral-600">{me.email}</dd>
        </div>
      </dl>
      <p className="mt-6 text-pretty text-neutral-600">
        The clinic will see your request and confirm it, or get in touch about another time. We’ll email you either way.
      </p>
      {message && (
        <div className="mt-6">
          <RefusalBox message={message} />
        </div>
      )}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
        <button type="button" onClick={() => book.mutate()} disabled={book.isPending} className={primaryButton}>
          {book.isPending ? 'Sending…' : 'Send request'}
        </button>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => {
            setSigningOut(true)
            signOut().catch(() => {
              setSigningOut(false)
              setMessage(commonMessage(new ApiError(0, '')))
            })
          }}
          className={`${textLink} inline-flex min-h-11 items-center justify-center`}
        >
          Not you? Sign out
        </button>
      </div>
    </div>
  )
}

const FIELD_ORDER = ['firstName', 'lastName', 'birthDate', 'phone', 'email', 'password', 'privacyConsent'] as const
type FieldName = (typeof FIELD_ORDER)[number]
type Errors = Partial<Record<FieldName, string>>

const PHONE = /^\+?[0-9][0-9 ()-]{5,28}$/

function validate(values: Record<FieldName, string>, consent: boolean): Errors {
  const errors: Errors = {}
  if (!values.firstName.trim()) errors.firstName = 'Enter your first name.'
  if (!values.lastName.trim()) errors.lastName = 'Enter your last name.'
  if (!values.birthDate) errors.birthDate = 'Enter your birth date.'
  else if (values.birthDate > todayInManila() || values.birthDate < '1900-01-01') errors.birthDate = 'Check the birth date.'
  if (!values.phone.trim()) errors.phone = 'Enter a mobile number the clinic can call.'
  else if (!PHONE.test(values.phone.trim())) errors.phone = 'Enter a number like 0917 123 4567.'
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter an email address like name@example.com.'
  if (values.password.length < 10) errors.password = 'Use at least 10 characters.'
  if (!consent) errors.privacyConsent = 'Tick the box to agree, so the clinic can keep your details.'
  return errors
}

const SERVER_FIELD_WORDS: Partial<Record<FieldName, string>> = {
  firstName: 'Check your first name.',
  lastName: 'Check your last name.',
  birthDate: 'Check the birth date.',
  phone: 'Enter a number like 0917 123 4567.',
  email: 'Enter an email address like name@example.com.',
  password: 'Use 10 to 128 characters.',
}

function RegisterForm() {
  const { clinic } = useClinic()
  const { draft, go } = useBooking()
  const refusal = useBookingRefusal()
  const formRef = useRef<HTMLFormElement>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<string | null>(null)

  const register = useMutation({
    mutationFn: (body: Registration) => portalApi.register(body),
    onSuccess: (_, body) => go('email', {}, { email: body.email, replace: true }),
    onError: (error) => {
      const fields = fieldMessages(error)
      const known = FIELD_ORDER.filter((name) => name in fields)
      if (known.length > 0) {
        setErrors(Object.fromEntries(known.map((name) => [name, SERVER_FIELD_WORDS[name] ?? fields[name]])))
        setMessage('Some details need fixing. Check the boxes marked below.')
        focusField(known[0])
        return
      }
      setMessage(refusal(error))
    },
  })

  function focusField(name: FieldName) {
    formRef.current?.querySelector<HTMLInputElement>(`[name="${name}"]`)?.focus()
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(FIELD_ORDER.map((name) => [name, String(form.get(name) ?? '')])) as Record<FieldName, string>
    const consent = form.get('privacyConsent') === 'on'
    const found = validate(values, consent)
    setErrors(found)
    const first = FIELD_ORDER.find((name) => found[name])
    if (first) {
      setMessage(null)
      focusField(first)
      return
    }
    setMessage(null)
    register.mutate({
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      birthDate: values.birthDate,
      phone: values.phone.trim(),
      email: values.email.trim(),
      password: values.password,
      privacyConsent: true,
      request: requestOf(draft),
    })
  }

  const clear = (name: FieldName) => () => errors[name] && setErrors(({ [name]: _gone, ...rest }) => rest)
  const [good, setGood] = useState<Partial<Record<FieldName, boolean>>>({})

  /** Leaving a box: check just that box. An empty box isn't an error until the form is sent. */
  const check = (name: FieldName) => () => {
    const form = formRef.current
    if (!form) return
    const data = new FormData(form)
    const values = Object.fromEntries(FIELD_ORDER.map((field) => [field, String(data.get(field) ?? '')])) as Record<FieldName, string>
    const filled = values[name].trim() !== ''
    const problem = validate(values, true)[name]
    setGood((now) => ({ ...now, [name]: filled && !problem }))
    if (filled && problem) setErrors((now) => ({ ...now, [name]: problem }))
  }
  const count = Object.keys(errors).length

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
      <p className="text-pretty text-neutral-600">
        Create an account to send your request. You’ll use it to see and cancel your appointments.
      </p>
      {count > 0 && !message && <Problem>{count === 1 ? 'One detail needs fixing.' : `${count} details need fixing.`} Check the boxes marked below.</Problem>}
      {message && <RefusalBox message={message} />}

      <h2 className="mt-2 text-lg font-bold tracking-[-0.01em]">About you</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="First name" error={errors.firstName} valid={good.firstName}>
          {(props) => <input {...props} name="firstName" autoComplete="given-name" maxLength={100} onInput={clear('firstName')} onBlur={check('firstName')} />}
        </Field>
        <Field label="Last name" error={errors.lastName} valid={good.lastName}>
          {(props) => <input {...props} name="lastName" autoComplete="family-name" maxLength={100} onInput={clear('lastName')} onBlur={check('lastName')} />}
        </Field>
      </div>
      <Field label="Birth date" error={errors.birthDate} hint="The clinic uses it to tell patients with the same name apart.">
        {(props) => (
          <input {...props} name="birthDate" type="date" min="1900-01-01" max={todayInManila()} autoComplete="bday" onInput={clear('birthDate')} onBlur={check('birthDate')} />
        )}
      </Field>
      <h2 className="mt-4 border-t border-neutral-200 pt-6 text-lg font-bold tracking-[-0.01em]">How to reach you</h2>
      <Field label="Mobile number" error={errors.phone} valid={good.phone} hint="For the clinic to call or text you about this visit.">
        {(props) => <input {...props} name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="0917 123 4567" maxLength={30} onInput={clear('phone')} onBlur={check('phone')} />}
      </Field>
      <Field label="Email" error={errors.email} valid={good.email} hint="We’ll send a link here to confirm it’s you.">
        {(props) => (
          <input {...props} name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={254} onInput={clear('email')} onBlur={check('email')} />
        )}
      </Field>
      <h2 className="mt-4 border-t border-neutral-200 pt-6 text-lg font-bold tracking-[-0.01em]">Your account</h2>
      <PasswordField label="Choose a password" name="password" autoComplete="new-password" error={errors.password} hint="At least 10 characters. A few words together is easy to remember." />

      <div className="flex flex-col gap-1.5">
        <label className="flex cursor-pointer gap-3 rounded-2xl border border-neutral-200 p-4 text-[0.9375rem]/6 outline-neutral-950 has-checked:border-neutral-950 has-checked:bg-neutral-50 has-focus-visible:outline-2 has-focus-visible:outline-offset-2">
          <input
            type="checkbox"
            name="privacyConsent"
            onChange={clear('privacyConsent')}
            aria-invalid={errors.privacyConsent ? true : undefined}
            aria-describedby={errors.privacyConsent ? 'consent-error' : undefined}
            className="mt-0.5 size-5 shrink-0 cursor-pointer accent-neutral-950 focus:outline-none"
          />
          <span>
            I agree that {clinic.name} may keep the details I give here, and what I say the visit is for, to manage my
            appointments, as the Data Privacy Act of 2012 (Republic Act 10173) allows. They aren’t shared with anyone else.
          </span>
        </label>
        {errors.privacyConsent && (
          <p id="consent-error" className="flex items-center gap-1.5 text-sm font-medium">
            <AlertIcon className="size-4 shrink-0" />
            {errors.privacyConsent}
          </p>
        )}
      </div>

      <button type="submit" disabled={register.isPending} className={`${primaryButton} mt-2 sm:w-full`}>
        {register.isPending ? 'Sending…' : 'Create account and send request'}
      </button>
    </form>
  )
}

function SignInAndSend({ onSignedIn }: { onSignedIn: (message: string | null) => void }) {
  const { draft, go } = useBooking()
  const queryClient = useQueryClient()
  const refusal = useBookingRefusal()
  const passwordRef = useRef<HTMLInputElement>(null)
  const [problem, setProblem] = useState<{ kind: 'signIn' | 'unverified'; text: string; email?: string } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') ?? '').trim()
    const password = String(form.get('password') ?? '')
    if (!email || !password) return setProblem({ kind: 'signIn', text: 'Enter your email address and your password.' })
    setSubmitting(true)
    setProblem(null)
    try {
      await portalApi.login(email, password)
    } catch (error) {
      setSubmitting(false)
      if (isUnverified(error)) return setProblem({ kind: 'unverified', text: '', email })
      setProblem({ kind: 'signIn', text: signInMessage(error) })
      if (error instanceof ApiError && error.status === 401 && passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
      return
    }
    // Signed in. Send the request before the page learns who is signed in, so this form
    // stays put meanwhile; if it's refused, the signed-in view takes over and says why.
    try {
      const sent = await portalApi.book(requestOf(draft))
      void queryClient.invalidateQueries({ queryKey: appointmentsKey() })
      void queryClient.invalidateQueries({ queryKey: meKey() })
      go('sent', {}, { sent, replace: true })
    } catch (error) {
      onSignedIn(refusal(error))
    }
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 flex flex-col gap-5">
      <Field label="Email">
        {(props) => (
          <input {...props} name="email" type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={254} />
        )}
      </Field>
      <PasswordField label="Password" name="password" autoComplete="current-password" inputRef={passwordRef} />
      {problem?.kind === 'signIn' && (
        <Problem>
          <p>{problem.text}</p>
          <p className="mt-1">
            <ForgotPasswordLink />
          </p>
        </Problem>
      )}
      {problem?.kind === 'unverified' && (
        <Problem>
          <UnverifiedProblemBody email={problem.email ?? ''} />
        </Problem>
      )}
      <button type="submit" disabled={submitting} className={`${primaryButton} mt-2 sm:w-full`}>
        {submitting ? 'Sending…' : 'Sign in and send request'}
      </button>
      <p className="text-[0.9375rem]">
        <ForgotPasswordLink tone="light" />
      </p>
    </form>
  )
}
