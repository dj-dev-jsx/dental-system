import { type FormEvent, useEffect, useRef, useState } from 'react'
import { buttonOnLight } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, inputClass, inputErrorClass } from '../../components/forms'
import { api, ApiError } from '../../lib/api'

/** The API's rule for a new password (12 to 128 characters). */
const MIN_PASSWORD_LENGTH = 12
const MAX_PASSWORD_LENGTH = 128

type Field = 'currentPassword' | 'newPassword' | 'repeat'
type FieldErrors = Partial<Record<Field, string>>

/** What the server said about a refused change: a sentence, or a list like "newPassword: reason". */
function serverProblem(error: unknown): { fields: FieldErrors; message: string | null } {
  const generic = 'Something went wrong on our side. Try again in a moment.'
  if (!(error instanceof ApiError)) return { fields: {}, message: generic }
  if (error.status === 0 || error.status >= 502) {
    return { fields: {}, message: 'Can’t reach the server. Check this computer’s internet connection, then try again.' }
  }
  if (error.status === 429) return { fields: {}, message: 'Too many tries. Wait a minute, then try again.' }
  if (error.status === 400 || error.status === 409) {
    const raw = (error.details as { message?: unknown } | undefined)?.message
    const messages = (Array.isArray(raw) ? raw : [raw]).filter((m): m is string => typeof m === 'string')
    const fields: FieldErrors = {}
    let sentence: string | null = null
    for (const message of messages) {
      const [field, ...rest] = message.split(': ')
      if (field === 'newPassword' && rest.length > 0) {
        fields.newPassword ??= `Use ${MIN_PASSWORD_LENGTH} to ${MAX_PASSWORD_LENGTH} characters, different from the current password.`
      } else if (field === 'currentPassword' && rest.length > 0) {
        fields.currentPassword ??= 'Enter your current password.'
      } else {
        sentence ??= message
      }
    }
    // A plain sentence like "Your current password is wrong." belongs under the current password.
    if (sentence && /current password/i.test(sentence)) fields.currentPassword ??= sentence
    else if (sentence && Object.keys(fields).length === 0) return { fields, message: sentence }
    if (Object.keys(fields).length > 0) return { fields, message: null }
  }
  return { fields: {}, message: generic }
}

/** A password box with the same Show/Hide button as the sign-in screen. */
function PasswordField({
  id,
  label,
  hint,
  error,
  autoComplete,
  autoFocus,
}: {
  id: Field
  label: string
  hint?: string
  error?: string
  autoComplete: 'current-password' | 'new-password'
  autoFocus?: boolean
}) {
  const [shown, setShown] = useState(false)
  return (
    <FormField id={id} label={label} hint={hint} error={error}>
      <div className="relative">
        <input
          id={id}
          name={id}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          maxLength={200}
          className={`${error ? inputErrorClass : inputClass} pr-16`}
          {...fieldAria(id, error, hint)}
        />
        <button
          type="button"
          onClick={() => setShown((value) => !value)}
          aria-pressed={shown}
          aria-controls={id}
          aria-label={`Show ${label.toLowerCase()}`}
          className="absolute inset-y-1.5 right-1.5 rounded px-2.5 text-sm font-semibold text-neutral-700 outline-neutral-950 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2"
        >
          {shown ? 'Hide' : 'Show'}
        </button>
      </div>
    </FormField>
  )
}

/**
 * Current password, new password twice. Used by the forced change after a first sign-in and by
 * the Account page. Passwords are read from the form when it is sent and never kept in state.
 */
export function ChangePasswordForm({
  onChanged,
  autoFocus = false,
  submitLabel = 'Change password',
}: {
  /** Called once the server accepted the new password. */
  onChanged: () => void | Promise<void>
  autoFocus?: boolean
  submitLabel?: string
}) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // After a refused try, put the cursor in the first box that needs fixing.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const currentPassword = String(form.get('currentPassword') ?? '')
    const newPassword = String(form.get('newPassword') ?? '')
    const repeat = String(form.get('repeat') ?? '')

    // Checks that need no server, so most mistakes are caught instantly.
    const found: FieldErrors = {}
    if (!currentPassword) found.currentPassword = 'Enter your current password.'
    if (newPassword.length < MIN_PASSWORD_LENGTH) found.newPassword = `Use at least ${MIN_PASSWORD_LENGTH} characters.`
    else if (newPassword.length > MAX_PASSWORD_LENGTH) found.newPassword = `Use at most ${MAX_PASSWORD_LENGTH} characters.`
    else if (newPassword === currentPassword) found.newPassword = 'Choose a password different from the current one.'
    if (!found.newPassword && repeat !== newPassword) found.repeat = 'The two new passwords don’t match.'
    setFormError(null)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      setFormError('Some details need fixing. They’re marked below.')
      return
    }

    setSubmitting(true)
    try {
      await api('/auth/change-password', { method: 'POST', json: { currentPassword, newPassword } })
    } catch (error) {
      setSubmitting(false)
      const problem = serverProblem(error)
      setErrors(problem.fields)
      setFormError(problem.message ?? 'Some details need fixing. They’re marked below.')
      return
    }
    formRef.current?.reset()
    setSubmitting(false)
    await onChanged()
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      {formError && <ErrorBox>{formError}</ErrorBox>}
      <PasswordField id="currentPassword" label="Current password" autoComplete="current-password" autoFocus={autoFocus} error={errors.currentPassword} />
      <PasswordField
        id="newPassword"
        label="New password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters. A few words together is easy to remember.`}
        autoComplete="new-password"
        error={errors.newPassword}
      />
      <PasswordField id="repeat" label="Repeat the new password" autoComplete="new-password" error={errors.repeat} />
      <button type="submit" disabled={submitting} className={`${buttonOnLight} mt-1 h-11 self-start px-6`}>
        {submitting ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
