import { type FormEvent, useRef, useState } from 'react'
import { buttonOnLight } from '../../components/buttons'
import { inputClass } from '../../components/forms'
import { AlertIcon, InfoIcon } from '../../components/icons'
import { ApiError } from '../../lib/api'
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

// The boxes stay editable while signing in (only the button is disabled), so after a failed
// try the cursor can go straight back into the password box.


export function LoginScreen({ notice }: { notice?: string }) {
  const signIn = useAuthStore((store) => store.signIn)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSubmitting(true)
    setError(null)
    try {
      await signIn(String(form.get('email')), String(form.get('password')))
      // Nothing to do on success: the app moves on to the chart.
    } catch (caught) {
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
      <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">Sign in</h1>
      <p className="mt-2 text-pretty text-neutral-600">Use the email and password your clinic gave you.</p>

      {notice && (
        <p className="mt-6 flex gap-3 rounded-md bg-neutral-100 px-3.5 py-3 text-sm/6 text-neutral-900" role="status">
          <InfoIcon className="mt-0.5 shrink-0" />
          {notice}
        </p>
      )}

      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-semibold">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            className={inputClass}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-semibold">
            Password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              maxLength={200}
              className={`${inputClass} pr-16`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((shown) => !shown)}
              aria-pressed={showPassword}
              aria-controls="password"
              className="absolute inset-y-1.5 right-1.5 rounded px-2.5 text-sm font-semibold text-neutral-700 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <p className="flex gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white" role="alert">
            <AlertIcon className="mt-0.5 shrink-0" />
            {error}
          </p>
        )}

        <button type="submit" disabled={submitting} className={`${buttonOnLight} mt-1 h-11 px-4`}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}
