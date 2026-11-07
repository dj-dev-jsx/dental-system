import { type FormEvent, type InputHTMLAttributes, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { inputClass, inputErrorClass, textareaClass, textareaErrorClass } from '../../components/forms'
import { AlertIcon } from '../../components/icons'
import { ApiError, errorMessage } from '../../lib/api'
import { todayInManila } from '../../lib/format'
import type { Patient, PatientInput, Sex } from './types'

// What to say under a field the server refused. The server's own wording is technical,
// except for the birth date rules, which were written for people.
const FIELD_MESSAGES: Record<string, string> = {
  firstName: 'Enter a first name.',
  lastName: 'Enter a last name.',
  middleName: 'Use up to 100 characters.',
  suffix: 'Use up to 20 characters, like Jr. or III.',
  birthDate: 'Enter the birth date.',
  sex: 'Choose female, male or not recorded.',
  phone: 'Enter a phone number, like 0917 123 4567.',
  email: 'Enter an email address, like name@example.com.',
  address: 'Use up to 500 characters.',
  emergencyContactName: 'Use up to 200 characters.',
  emergencyContactPhone: 'Enter a phone number, like 0917 123 4567.',
}

type FieldErrors = Partial<Record<string, string>>

/** The API answers a bad form with messages like "birthDate: Birth date is in the future". */
function fieldErrorsFrom(error: ApiError): FieldErrors {
  const messages = (error.details as { message?: unknown } | undefined)?.message
  const errors: FieldErrors = {}
  for (const message of Array.isArray(messages) ? messages : []) {
    if (typeof message !== 'string') continue
    const [field, ...rest] = message.split(': ')
    const text = rest.join(': ')
    if (!(field in FIELD_MESSAGES) || errors[field]) continue
    errors[field] = field === 'birthDate' && text.startsWith('Birth date') ? `${text}.` : FIELD_MESSAGES[field]
  }
  return errors
}

const OPTIONAL_TEXT = [
  'middleName',
  'suffix',
  'phone',
  'email',
  'address',
  'emergencyContactName',
  'emergencyContactPhone',
] as const

/**
 * Turns the form into what the API expects. When editing, an emptied box is sent as null
 * to clear it; when registering, empty boxes are simply left out.
 */
function buildInput(form: FormData, patient?: Patient): PatientInput {
  const text = (name: string) => String(form.get(name) ?? '').trim()
  const input: PatientInput = {
    firstName: text('firstName'),
    lastName: text('lastName'),
    birthDate: text('birthDate'),
  }
  for (const name of OPTIONAL_TEXT) {
    const value = text(name)
    if (value) input[name] = value
    else if (patient) input[name] = null
  }
  const sex = text('sex')
  if (sex) input.sex = sex as Sex
  else if (patient) input.sex = null
  // Only sent when it changes, so editing a phone number doesn't touch the consent date.
  const consent = form.get('privacyConsent') === 'on'
  if (consent !== Boolean(patient?.privacyConsentAt)) input.privacyConsent = consent
  return input
}

type FieldProps = {
  name: string
  label: string
  error?: string
  multiline?: boolean
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'name' | 'className'>

function Field({ name, label, error, multiline = false, className = '', ...input }: FieldProps) {
  const errorId = `${name}-error`
  const shared = {
    id: name,
    name,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? errorId : undefined,
  }
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={name} className="text-sm font-semibold">
        {label}
      </label>
      {multiline ? (
        <textarea
          {...shared}
          defaultValue={input.defaultValue}
          className={error ? textareaErrorClass : textareaClass}
        />
      ) : (
        <input {...shared} {...input} className={error ? inputErrorClass : inputClass} />
      )}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-sm font-medium">
          <AlertIcon className="size-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-neutral-950 pt-5">
      <legend className="float-left w-full text-lg font-semibold">{title}</legend>
      <div className="clear-both grid gap-5 pt-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  )
}

type Props = {
  /** The record being edited. Leave it out to register a new patient. */
  patient?: Patient
  submitLabel: string
  submittingLabel: string
  cancelTo: string
  onSubmit: (input: PatientInput) => Promise<unknown>
}

export function PatientForm({ patient, submitLabel, submittingLabel, cancelTo, onSubmit }: Props) {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // After a refused save, put the cursor in the first field that needs fixing.
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const input = buildInput(new FormData(event.currentTarget), patient)
    setSubmitting(true)
    setErrors({})
    setFormError(null)
    try {
      await onSubmit(input)
      // On success the page moves on to the patient's record.
    } catch (error) {
      setSubmitting(false)
      const fields = error instanceof ApiError && error.status === 400 ? fieldErrorsFrom(error) : {}
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
        setFormError('Some details need fixing. They’re marked below.')
      } else if (error instanceof ApiError && error.status === 409) {
        setFormError('This patient is archived, so the record can’t be changed. Restore it first.')
      } else {
        setFormError(errorMessage(error))
      }
    }
  }

  return (
    <form ref={formRef} noValidate onSubmit={handleSubmit} className="mt-8 flex flex-col gap-10">
      <p className="text-neutral-600">Only the first and last name and the birth date are required.</p>

      {formError && (
        <p className="flex gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white" role="alert">
          <AlertIcon className="mt-0.5 shrink-0" />
          {formError}
        </p>
      )}

      <Section title="Name">
        <Field name="firstName" label="First name" autoComplete="off" required defaultValue={patient?.firstName} error={errors.firstName} />
        <Field name="middleName" label="Middle name" autoComplete="off" defaultValue={patient?.middleName ?? ''} error={errors.middleName} />
        <Field name="lastName" label="Last name" autoComplete="off" required defaultValue={patient?.lastName} error={errors.lastName} />
        <Field name="suffix" label="Suffix" autoComplete="off" placeholder="Jr., Sr., III" defaultValue={patient?.suffix ?? ''} error={errors.suffix} />
      </Section>

      <Section title="Personal details">
        <Field
          name="birthDate"
          label="Birth date"
          type="date"
          required
          min="1900-01-01"
          max={todayInManila()}
          defaultValue={patient?.birthDate}
          error={errors.birthDate}
        />
        <fieldset aria-describedby={errors.sex ? 'sex-error' : undefined}>
          <legend className="text-sm font-semibold">Sex</legend>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {(
              [
                ['FEMALE', 'Female'],
                ['MALE', 'Male'],
                ['', 'Not recorded'],
              ] as const
            ).map(([value, label]) => (
              <label key={label} className="flex items-center gap-2">
                <input type="radio" name="sex" value={value} defaultChecked={(patient?.sex ?? '') === value} className="size-4" />
                {label}
              </label>
            ))}
          </div>
          {errors.sex && (
            <p id="sex-error" className="mt-1.5 text-sm font-medium">
              {errors.sex}
            </p>
          )}
        </fieldset>
      </Section>

      <Section title="Contact">
        <Field name="phone" label="Mobile or phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={patient?.phone ?? ''} error={errors.phone} />
        <Field name="email" label="Email" type="email" autoComplete="off" spellCheck={false} defaultValue={patient?.email ?? ''} error={errors.email} />
        <Field name="address" label="Address" multiline className="sm:col-span-2" defaultValue={patient?.address ?? ''} error={errors.address} />
      </Section>

      <Section title="Emergency contact">
        <Field name="emergencyContactName" label="Name" autoComplete="off" defaultValue={patient?.emergencyContactName ?? ''} error={errors.emergencyContactName} />
        <Field name="emergencyContactPhone" label="Mobile or phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={patient?.emergencyContactPhone ?? ''} error={errors.emergencyContactPhone} />
      </Section>

      <fieldset className="border-t border-neutral-950 pt-5">
        <legend className="float-left w-full text-lg font-semibold">Privacy</legend>
        <label className="clear-both flex gap-3 pt-4">
          <input type="checkbox" name="privacyConsent" defaultChecked={Boolean(patient?.privacyConsentAt)} className="mt-1 size-4 shrink-0" />
          <span>
            <span className="font-semibold">The patient agreed to the clinic’s privacy notice</span>
            <span className="mt-0.5 block text-sm text-neutral-600">
              Tick this once they’ve read and signed it. The date is recorded automatically.
            </span>
          </span>
        </label>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-200 pt-6">
        <button type="submit" disabled={submitting} className={`${buttonOnLight} h-11 px-6`}>
          {submitting ? submittingLabel : submitLabel}
        </button>
        <Link to={cancelTo} className={`${buttonOutline} h-11 px-5`}>
          Cancel
        </Link>
      </div>
    </form>
  )
}
