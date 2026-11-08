import { type ReactNode, useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { DetailBack } from '../../components/SplitView'
import { errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { ROLE_LABELS, useStaffUser } from '../auth/authStore'
import { useResetPassword, useStaff, useUnlockStaff, useUpdateStaff } from './queries'
import { EditStaffForm } from './StaffForms'
import { formatLastSignIn, initials, isLocked } from './staffInput'
import { type StaffContext, StatusPills } from './StaffWorkspace'
import type { StaffMember, StaffQuery } from './types'

// Everyone, whatever the list beside it shows, so a person stays open after they leave a filter
// (deactivated while the list shows Active, say). A clinic has only a handful of staff.
const EVERYONE: StaffQuery = { search: '', status: 'all', role: '', sort: 'name', dir: 'asc' }

/** One staff account, beside the list: who they are, then what can be done to the account. */
export default function StaffDetail() {
  const { id = '' } = useParams()
  const context = useOutletContext<StaffContext>()
  const me = useStaffUser()
  const { data, isPending, isError, error, refetch } = useStaff(EVERYONE)
  const member = data?.items.find((item) => item.id === id)

  if (member) return <Member key={member.id} member={member} isSelf={member.id === me.id} context={context} />

  return (
    <div className="px-6 py-6 lg:px-10 lg:py-8">
      <DetailBack to={context.listPath} label="Staff" />
      {isPending ? (
        <div aria-busy="true" aria-label="Loading">
          <div className="flex items-center gap-4">
            <div className="size-16 rounded-full bg-neutral-100" />
            <div className="space-y-2">
              <div className="h-7 w-52 rounded bg-neutral-100" />
              <div className="h-4 w-40 rounded bg-neutral-100" />
            </div>
          </div>
          <div className="mt-10 h-48 max-w-3xl rounded bg-neutral-100" />
        </div>
      ) : isError ? (
        <div className="flex flex-wrap items-center gap-3">
          <ErrorBox className="flex-1">{errorMessage(error)}</ErrorBox>
          <button type="button" onClick={() => void refetch()} className={`${buttonOutline} h-10 px-4 text-sm`}>
            Try again
          </button>
        </div>
      ) : (
        <>
          <h1 className="text-2xl font-bold tracking-[-0.02em]">No such staff account</h1>
          <p className="mt-1 text-neutral-600">It may have been typed wrong. Choose someone from the list.</p>
        </>
      )}
    </div>
  )
}

type Mode = 'edit' | 'reset' | 'deactivate' | null

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-neutral-200 py-3 sm:grid-cols-[9rem_1fr] sm:gap-6">
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  )
}

/** One thing that can be done to the account: what it does on the left, its button on the right, its form below. */
function Action({ title, text, button, children, quiet = false }: { title: string; text: ReactNode; button?: ReactNode; children?: ReactNode; quiet?: boolean }) {
  return (
    <section className={`border-t py-6 ${quiet ? 'mt-8 border-neutral-300' : 'border-neutral-200'}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 className={`font-semibold ${quiet ? 'text-neutral-800' : ''}`}>{title}</h3>
          <p className="mt-0.5 max-w-xl text-sm text-neutral-600">{text}</p>
        </div>
        {button}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </section>
  )
}

/** A question asked inline under its action, rather than in a pop-up (see DESIGN.md). */
function Confirm({ question, confirmLabel, pending, error, onConfirm, onCancel }: { question: string; confirmLabel: string; pending: boolean; error: unknown; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-md bg-neutral-50 p-4">
      {error != null && <ErrorBox>{errorMessage(error)}</ErrorBox>}
      <p className="max-w-xl">{question}</p>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={onConfirm} disabled={pending} autoFocus className={`${buttonOnLight} h-10 px-5 text-sm`}>
          {pending ? 'Working…' : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className={`${buttonOutline} h-10 px-4 text-sm`}>
          Cancel
        </button>
      </div>
    </div>
  )
}

function Member({ member, isSelf, context }: { member: StaffMember; isSelf: boolean; context: StaffContext }) {
  const [mode, setMode] = useState<Mode>(null)
  const [message, setMessage] = useState<string | null>(null)
  const update = useUpdateStaff()
  const reset = useResetPassword()
  const unlock = useUnlockStaff()
  const name = `${member.firstName} ${member.lastName}`
  const locked = isLocked(member)

  function choose(next: Mode) {
    setMode((current) => (current === next ? null : next))
    setMessage(null)
    update.reset()
    reset.reset()
    unlock.reset()
  }

  async function setActive(isActive: boolean) {
    try {
      await update.mutateAsync({ id: member.id, changes: { isActive } })
      setMode(null)
      setMessage(isActive ? `${name} can sign in again.` : `${name} can no longer sign in.`)
    } catch {
      // The reason (such as "leaves no active admin") shows in the question, from update.error.
    }
  }

  async function resetPassword() {
    try {
      const result = await reset.mutateAsync(member.id)
      setMode(null)
      setMessage('Password reset. The temporary password is shown at the top.')
      context.issue(name, member.email, result.temporaryPassword)
    } catch {
      // Shown in the question, from reset.error.
    }
  }

  async function unlockAccount() {
    setMode(null)
    setMessage(null)
    try {
      await unlock.mutateAsync(member.id)
      setMessage(`${name}’s account is unlocked.`)
    } catch {
      // Shown under Unlock, from unlock.error.
    }
  }

  const status = !member.isActive ? 'Deactivated' : locked ? `Locked until ${formatDateTime(member.lockedUntil!)}` : member.mustChangePassword ? 'Active, must set a password' : 'Active'

  return (
    <div className="max-w-3xl px-6 py-6 lg:px-10 lg:py-8">
      <DetailBack to={context.listPath} label="Staff" />
      <header className="flex items-center gap-4">
        <span aria-hidden="true" className={`grid size-16 shrink-0 place-items-center rounded-full bg-neutral-100 text-xl font-semibold text-neutral-700 ${member.isActive ? '' : 'opacity-60'}`}>
          {initials(member)}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-balance">
            {name}
            {isSelf && <span className="font-normal text-neutral-500"> (you)</span>}
          </h1>
          <p className="truncate text-neutral-600">{member.email}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{ROLE_LABELS[member.role]}</span>
            <StatusPills member={member} />
          </p>
        </div>
      </header>

      <div aria-live="polite">{message && <p className="mt-6 rounded-md bg-neutral-100 px-4 py-3 text-sm font-medium">{message}</p>}</div>

      <section aria-labelledby="staff-details" className="mt-8">
        <h2 id="staff-details" className="text-lg font-semibold">
          Details
        </h2>
        <dl className="mt-3 border-t border-neutral-950">
          <Row label="Role">{ROLE_LABELS[member.role]}</Row>
          <Row label="Status">
            <span className={member.isActive ? '' : 'text-neutral-500'}>{status}</span>
          </Row>
          <Row label="Last signed in">
            {member.lastSignInAt ? <span title={formatDateTime(member.lastSignInAt)}>{formatLastSignIn(member.lastSignInAt)}</span> : <span className="text-neutral-500">Never</span>}
          </Row>
          <Row label="Added on">{formatDateTime(member.createdAt)}</Row>
          <Row label="Email">
            <span className="break-all">{member.email}</span>
          </Row>
        </dl>
      </section>

      <section aria-labelledby="staff-manage" className="mt-12">
        <h2 id="staff-manage" className="text-lg font-semibold">
          Manage
        </h2>
        <div className="mt-3 border-t border-neutral-950 [&>section:first-child]:border-t-0">
          <Action
            title="Name and role"
            text={isSelf ? 'You can change your name here. Your role can only be changed by another admin.' : 'Change their name or what they can do.'}
            button={
              mode !== 'edit' && (
                <button type="button" onClick={() => choose('edit')} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
                  Edit details
                </button>
              )
            }
          >
            {mode === 'edit' && (
              <EditStaffForm
                member={member}
                isSelf={isSelf}
                onCancel={() => choose(null)}
                onSaved={(saved) => {
                  setMode(null)
                  setMessage(saved)
                }}
              />
            )}
          </Action>

          {isSelf ? (
            <Action
              title="Password"
              text={
                <>
                  To change your own password, use{' '}
                  <Link to="/app/account" className="font-medium text-neutral-950 underline underline-offset-3 hover:no-underline">
                    Account
                  </Link>
                  .
                </>
              }
            />
          ) : (
            <Action
              title="Reset password"
              text="Their current password stops working. You get a temporary one to give them, and they choose their own when they next sign in."
              button={
                mode !== 'reset' && (
                  <button type="button" onClick={() => choose('reset')} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
                    Reset password…
                  </button>
                )
              }
            >
              {mode === 'reset' && (
                <Confirm
                  question={`Reset the password for ${name}?`}
                  confirmLabel="Reset password"
                  pending={reset.isPending}
                  error={reset.error}
                  onConfirm={() => void resetPassword()}
                  onCancel={() => choose(null)}
                />
              )}
            </Action>
          )}

          {locked && (
            <Action
              title="Unlock"
              text={`Locked after too many wrong passwords, until ${formatDateTime(member.lockedUntil!)}. Unlock to let them try again now.`}
              button={
                <button type="button" onClick={() => void unlockAccount()} disabled={unlock.isPending} className={`${buttonOnLight} h-9 px-3.5 text-sm`}>
                  {unlock.isPending ? 'Unlocking…' : 'Unlock'}
                </button>
              }
            >
              {unlock.isError && <ErrorBox>{errorMessage(unlock.error)}</ErrorBox>}
            </Action>
          )}

          <Action
            quiet
            title={member.isActive ? 'Deactivate account' : 'Reactivate account'}
            text={
              isSelf
                ? 'This is your own account, so you can’t deactivate it. Ask another admin.'
                : member.isActive
                  ? 'They won’t be able to sign in until you reactivate the account. Their name stays on past records.'
                  : 'They can sign in again with their current password.'
            }
            button={
              !isSelf &&
              mode !== 'deactivate' && (
                <button type="button" onClick={() => choose('deactivate')} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
                  {member.isActive ? 'Deactivate…' : 'Reactivate…'}
                </button>
              )
            }
          >
            {mode === 'deactivate' && (
              <Confirm
                question={member.isActive ? `Deactivate ${name}?` : `Reactivate ${name}?`}
                confirmLabel={member.isActive ? 'Deactivate' : 'Reactivate'}
                pending={update.isPending}
                error={update.error}
                onConfirm={() => void setActive(!member.isActive)}
                onCancel={() => choose(null)}
              />
            )}
          </Action>
        </div>
      </section>
    </div>
  )
}
