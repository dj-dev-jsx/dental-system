import { type FormEvent, useEffect, useRef, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { FormField } from '../../components/FormField'
import { fieldAria, inputClass, inputErrorClass } from '../../components/forms'
import { ApiError, errorMessage } from '../../lib/api'
import { ROLE_LABELS, type StaffRole } from '../auth/authStore'
import { useCreateStaff, useUpdateStaff } from './queries'
import { ROLE_ABILITIES, type StaffFieldErrors, staffFieldErrors } from './staffInput'
import type { StaffChanges, StaffMember } from './types'

const selectClass = (error?: string) => `${error ? inputErrorClass : inputClass} pr-8 disabled:bg-neutral-100 disabled:text-neutral-600`

type FieldsProps = {
  /** Keeps ids unique when several forms are on the page. */
  idPrefix: string
  defaults?: { firstName: string; lastName: string; role: StaffRole }
  errors: StaffFieldErrors
  /** Locks the role box and says why. */
  roleLockedReason?: string
  /** The add form also asks for the email; editing can't change it. */
  withEmail?: boolean
  roleHint?: string
}

function StaffFields({ idPrefix, defaults, errors, roleLockedReason, withEmail, roleHint }: FieldsProps) {
  const id = (name: string) => `${idPrefix}${name}`
  const [role, setRole] = useState<StaffRole>(defaults?.role ?? 'RECEPTIONIST')
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <FormField id={id('firstName')} label="First name" error={errors.firstName}>
        <input id={id('firstName')} name="firstName" autoComplete="off" autoFocus defaultValue={defaults?.firstName} className={errors.firstName ? inputErrorClass : inputClass} {...fieldAria(id('firstName'), errors.firstName)} />
      </FormField>
      <FormField id={id('lastName')} label="Last name" error={errors.lastName}>
        <input id={id('lastName')} name="lastName" autoComplete="off" defaultValue={defaults?.lastName} className={errors.lastName ? inputErrorClass : inputClass} {...fieldAria(id('lastName'), errors.lastName)} />
      </FormField>
      {withEmail && (
        <FormField id={id('email')} label="Email" hint="They sign in with this address." error={errors.email}>
          <input id={id('email')} name="email" type="email" autoComplete="off" autoCapitalize="none" spellCheck={false} className={errors.email ? inputErrorClass : inputClass} {...fieldAria(id('email'), errors.email, 'hint')} />
        </FormField>
      )}
      <FormField id={id('role')} label="Role" hint={roleLockedReason ?? `${ROLE_ABILITIES[role]}${roleHint ? ` ${roleHint}` : ''}`} error={errors.role} className={withEmail ? '' : 'sm:col-span-2'}>
        <select
          id={id('role')}
          name="role"
          value={role}
          onChange={(event) => setRole(event.target.value as StaffRole)}
          disabled={Boolean(roleLockedReason)}
          className={selectClass(errors.role)}
          {...fieldAria(id('role'), errors.role, 'hint')}
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FormField>
    </div>
  )
}

/** After a refused save, put the cursor in the first box that needs fixing. */
function useFocusFirstInvalid(errors: StaffFieldErrors) {
  const form = useRef<HTMLFormElement>(null)
  useEffect(() => {
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errors])
  return form
}

const text = (form: FormData, name: string) => String(form.get(name) ?? '').trim()

/** The "Add staff" form: opens in the staff workspace's right-hand pane, not in a pop-up. */
export function AddStaffForm({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (result: { id: string; name: string; email: string; password: string }) => void
}) {
  const create = useCreateStaff()
  const [errors, setErrors] = useState<StaffFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const form = useFocusFirstInvalid(errors)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const input = {
      firstName: text(data, 'firstName'),
      lastName: text(data, 'lastName'),
      email: text(data, 'email'),
      role: text(data, 'role') as StaffRole,
    }
    const found: StaffFieldErrors = {}
    if (!input.firstName) found.firstName = 'Enter a first name.'
    if (!input.lastName) found.lastName = 'Enter a last name.'
    if (!/^\S+@\S+\.\S+$/.test(input.email)) found.email = 'Enter an email address, like name@example.com.'
    setErrors(found)
    setFormError(Object.keys(found).length > 0 ? 'Some details need fixing. They’re marked below.' : null)
    if (Object.keys(found).length > 0) return

    try {
      const result = await create.mutateAsync(input)
      onCreated({
        id: result.user.id,
        name: `${result.user.firstName} ${result.user.lastName}`,
        email: result.user.email,
        password: result.temporaryPassword,
      })
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        // The server's sentence ("That email is already used by another account.") goes under the email.
        setErrors({ email: errorMessage(error) })
        setFormError('Some details need fixing. They’re marked below.')
        return
      }
      const fields = staffFieldErrors(error)
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
        setFormError('Some details need fixing. They’re marked below.')
      } else {
        setErrors({})
        setFormError(errorMessage(error))
      }
    }
  }

  return (
    <section aria-labelledby="add-staff-heading">
      <h1 id="add-staff-heading" className="text-2xl font-bold tracking-[-0.02em]">
        Add staff
      </h1>
      <form ref={form} noValidate onSubmit={handleSubmit} className="mt-4 flex flex-col gap-5 border-t border-neutral-950 pt-5">
        {formError && <ErrorBox>{formError}</ErrorBox>}
        <StaffFields
          idPrefix="add-"
          errors={errors}
          withEmail
        />
        <p className="text-sm text-neutral-600">We’ll make a temporary password for you to give them. They choose their own when they first sign in.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={create.isPending} className={`${buttonOnLight} h-11 px-6`}>
            {create.isPending ? 'Adding…' : 'Add staff'}
          </button>
          <button type="button" onClick={onCancel} className={`${buttonOutline} h-11 px-5`}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  )
}

/** Name and role of one person, inside their pane. */
export function EditStaffForm({
  member,
  isSelf,
  onSaved,
  onCancel,
}: {
  member: StaffMember
  isSelf: boolean
  onSaved: (message: string) => void
  onCancel: () => void
}) {
  const update = useUpdateStaff()
  const [errors, setErrors] = useState<StaffFieldErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [nothing, setNothing] = useState(false)
  const form = useFocusFirstInvalid(errors)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const firstName = text(data, 'firstName')
    const lastName = text(data, 'lastName')
    const role = (isSelf ? member.role : text(data, 'role')) as StaffRole

    const found: StaffFieldErrors = {}
    if (!firstName) found.firstName = 'Enter a first name.'
    if (!lastName) found.lastName = 'Enter a last name.'
    setErrors(found)
    setNothing(false)
    setFormError(Object.keys(found).length > 0 ? 'Some details need fixing. They’re marked below.' : null)
    if (Object.keys(found).length > 0) return

    // Only what changed is sent.
    const changes: StaffChanges = {}
    if (firstName !== member.firstName) changes.firstName = firstName
    if (lastName !== member.lastName) changes.lastName = lastName
    if (role !== member.role) changes.role = role
    if (Object.keys(changes).length === 0) {
      setNothing(true)
      return
    }

    try {
      await update.mutateAsync({ id: member.id, changes })
      onSaved(`Saved the changes to ${firstName} ${lastName}.`)
    } catch (error) {
      const fields = staffFieldErrors(error)
      if (Object.keys(fields).length > 0) {
        setErrors(fields)
        setFormError('Some details need fixing. They’re marked below.')
      } else {
        // Includes the server's 409 sentences, such as "leave no active admin".
        setFormError(errorMessage(error))
      }
    }
  }

  return (
    <form ref={form} noValidate onSubmit={handleSubmit} className="flex flex-col gap-5">
      {formError && <ErrorBox>{formError}</ErrorBox>}
      <StaffFields
        idPrefix={`edit-${member.id}-`}
        defaults={member}
        errors={errors}
        roleLockedReason={isSelf ? 'You can’t change your own role. Ask another admin.' : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={update.isPending} className={`${buttonOnLight} h-10 px-5 text-sm`}>
          {update.isPending ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" onClick={onCancel} className={`${buttonOutline} h-10 px-4 text-sm`}>
          Cancel
        </button>
        <p role="status" className="text-sm text-neutral-600">
          {nothing && 'Nothing changed.'}
        </p>
      </div>
    </form>
  )
}
