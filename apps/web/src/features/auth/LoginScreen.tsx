import { type FormEvent, useRef, useState } from 'react'
import { Link } from 'react-router'
import { AlertIcon, ArrowRightIcon, InfoIcon } from '../../components/icons'
import { LockIcon, MailIcon } from '../../portal/icons'
import { RevealButton } from '../../portal/RevealButton'
import { api, ApiError } from '../../lib/api'
import { useSite } from '../../lib/useSite'
import { AuthLayout } from './AuthLayout'
import { useAuthStore } from './authStore'

// The server answers every failed login the same way, on purpose, so this can't say which
// part was wrong. It can say what the rules are.
function signInErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'The email or password is wrong, or the account is locked. After 5 wrong tries, an account locks for 15 minutes.'
    }
    if (error.status === 429) {
      return 'Too many sign-in attempts from this computer. Wait a minute, then try again.'
    }
    if (error.status === 400) return 'Enter a valid email address and your password.'
    if (error.status === 0 || error.status >= 502) {
      return 'Can’t reach the server. Check this computer’s internet connection, then try again.'
    }
  }
  return 'Something went wrong on our side. Try again in a moment.'
}

// The sign-in boxes: 48px, an icon at the left, an ink border when focused (the patient pages' boxes).
const box =
  'h-12 w-full rounded-xl border border-neutral-300 bg-white px-3.5 text-base text-neutral-950 transition-[border-color,box-shadow] duration-150 placeholder:text-neutral-400 hover:border-neutral-500 focus:border-neutral-950 focus:ring-4 focus:ring-neutral-950/10 focus:outline-none'
const fieldIcon = 'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-neutral-500'
const link =
  'font-semibold text-neutral-950 underline decoration-neutral-400 decoration-[1.5px] underline-offset-4 outline-neutral-950 hover:decoration-neutral-950 focus-visible:outline-2 rounded-sm'

/** The API's error code, like 'EMAIL_NOT_VERIFIED', if it sent one. */
function codeOf(error: unknown) {
  const details = error instanceof ApiError ? error.details : null
  return details && typeof details === 'object' && 'message' in details ? details.message : null
}

// One sign-in page for everyone at this clinic. Staff accounts are tried first; if the email
// and password aren't a staff login, they're tried as a patient's online-booking login, and a
// patient goes on to their appointments. Both kinds of login stay separate on the server.
// The boxes stay editable while signing in (only the button is disabled), so after a failed
// try the cursor can go straight back into the password box.
export function LoginScreen({ notice }: { notice?: string }) {
  const signIn = useAuthStore((store) => store.signIn)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const site = useSite()
  // Patients can sign in only while the clinic has online booking switched on.
  const booking = site?.onlineBookingEnabled === true
  const [unverified, setUnverified] = useState<string | null>(null)
  const [resent, setResent] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  /** Tries the email and password as a patient's login. True if they're signed in. */
  async function patientSignIn(email: string, password: string) {
    if (!booking) return false
    await api('/portal/login', { method: 'POST', json: { email, password } })
    // A full page load, so the patient pages start fresh with their own session.
    window.location.assign('/')
    return true
  }

  async function resend() {
    if (!booking || !unverified) return
    setResent('sending')
    try {
      await api('/portal/resend-verification', { method: 'POST', json: { email: unverified } })
      setResent('sent')
    } catch {
      setResent('failed')
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email')).trim()
    const password = String(form.get('password'))
    setSubmitting(true)
    setError(null)
    setUnverified(null)
    setResent('idle')
    try {
      try {
        await signIn(email, password)
        // Nothing to do on success: the app moves on.
      } catch (staffError) {
        if (!(staffError instanceof ApiError && staffError.status === 401 && booking)) throw staffError
        await patientSignIn(email, password)
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 403 && codeOf(caught) === 'EMAIL_NOT_VERIFIED') {
        setUnverified(email)
        setSubmitting(false)
        return
      }
      setError(signInErrorMessage(caught))
      setSubmitting(false)
      // After a wrong password, start the next try with an empty password box.
      if (caught instanceof ApiError && caught.status === 401 && passwordRef.current) {
        passwordRef.current.value = ''
        passwordRef.current.focus()
      }
    }
  }

  return (
    <AuthLayout>
      <h1 className="text-[2rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance">Sign in</h1>
      <p className="mt-2 text-pretty text-neutral-600">
        {booking ? 'For clinic staff, and for patients who booked online.' : 'Use the email and password your clinic gave you.'}
      </p>

      {notice && (
        <p className="mt-6 flex gap-3 rounded-xl bg-neutral-100 px-4 py-3.5 text-sm/6 text-neutral-900" role="status">
          <InfoIcon className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[0.9375rem] font-semibold">
            Email
          </label>
          <div className="relative">
            <MailIcon className={fieldIcon} />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              autoFocus
              placeholder="name@example.com"
              className={`${box} pl-11`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor="password" className="text-[0.9375rem] font-semibold">
            Password
          </label>
          <div className="relative">
            <LockIcon className={fieldIcon} />
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={200}
              aria-describedby={error ? 'sign-in-error' : undefined}
              className={`${box} pr-12 pl-11`}
            />
            <RevealButton shown={showPassword} onToggle={() => setShowPassword((shown) => !shown)} controls="password" />
          </div>
        </div>

        {error && (
          <p id="sign-in-error" className="flex gap-3 rounded-xl bg-neutral-950 px-4 py-3.5 text-sm/6 text-white" role="alert">
            <AlertIcon className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        {unverified && (
          <div id="sign-in-error" className="flex gap-3 rounded-xl bg-neutral-950 px-4 py-3.5 text-sm/6 text-white" role="alert">
            <AlertIcon className="mt-0.5 shrink-0" />
            <div>
              <p>Confirm your email first: open the link we sent to {unverified}. Then sign in.</p>
              {resent === 'sent' ? (
                <p className="mt-1">Sent again. It can take a minute or two to arrive.</p>
              ) : (
                <button
                  type="button"
                  onClick={() => void resend()}
                  disabled={resent === 'sending'}
                  className="mt-1 rounded-sm font-semibold underline underline-offset-3 outline-white hover:no-underline focus-visible:outline-2"
                >
                  {resent === 'sending' ? 'Sending…' : 'Send the link again'}
                </button>
              )}
              {resent === 'failed' && <p className="mt-1">Couldn’t send it. Wait a few minutes, then try again.</p>}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-neutral-950 px-5 text-base font-semibold text-white outline-neutral-950 transition-[background-color,transform] duration-150 hover:bg-neutral-800 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.99] disabled:cursor-wait disabled:bg-neutral-950/70"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      {booking ? (
        <div className="mt-8 flex flex-col gap-4 text-sm/6 text-neutral-600">
          <p>
            Forgot your password? Patients can{' '}
            <Link to="/forgot-password" className={link}>
              reset it here
            </Link>
            . Staff, ask your clinic admin.
          </p>
          <div className="flex flex-col items-start gap-3 rounded-2xl border border-neutral-200 p-4 min-[420px]:flex-row min-[420px]:items-center min-[420px]:gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-950">New patient?</p>
              <p>You make an account while booking.</p>
            </div>
            <Link
              to="/book"
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-300 px-3.5 font-semibold text-neutral-950 outline-neutral-950 transition-colors hover:border-neutral-950 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Book an appointment
              <ArrowRightIcon className="size-4" />
            </Link>
          </div>
        </div>
      ) : (
        <p className="mt-8 text-sm text-neutral-600">Forgot your password? Ask your clinic admin to reset it for you.</p>
      )}
    </AuthLayout>
  )
}
