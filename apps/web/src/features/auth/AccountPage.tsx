import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { CheckIcon } from '../../components/icons'
import { Page, PageHeader } from '../../components/Page'
import { Pill } from '../../components/Table'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ROLE_LABELS, useStaffUser } from './authStore'
import { ChangePasswordForm } from './ChangePasswordForm'
import { RecentSignIns } from './RecentSignIns'

/** The signed-in person's own account: who they are, a way to change their password, and recent sign-ins. */
export default function AccountPage() {
  useDocumentTitle('Account')
  const user = useStaffUser()
  const [changed, setChanged] = useState(false)
  const queryClient = useQueryClient()

  return (
    <Page narrow>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {user.firstName} {user.lastName}
            <Pill tone="outline">{ROLE_LABELS[user.role]}</Pill>
          </span>
        }
        description="Your name and role are set by your clinic admin."
      />

      <dl className="mt-6 grid gap-x-8 gap-y-3 border-t border-neutral-950 pt-4 text-sm sm:grid-cols-[repeat(3,auto)] sm:justify-start">
        <div>
          <dt className="text-neutral-600">Email</dt>
          <dd className="mt-0.5 break-all font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-neutral-600">Role</dt>
          <dd className="mt-0.5 font-medium">{ROLE_LABELS[user.role]}</dd>
        </div>
        <div>
          <dt className="text-neutral-600">Clinic</dt>
          <dd className="mt-0.5 font-medium">{user.clinicName}</dd>
        </div>
      </dl>

      <section className="mt-12" aria-labelledby="password-heading">
        <h2 id="password-heading" className="text-lg font-semibold">
          Change password
        </h2>
        <div className="mt-3 border-t border-neutral-950 pt-5">
          <div className="max-w-sm">
            <ChangePasswordForm onChanged={() => {
                setChanged(true)
                // The change is itself a line in the recent list.
                void queryClient.invalidateQueries({ queryKey: ['my-activity'] })
              }} />
          </div>
          <div aria-live="polite">
            {changed && (
              <p className="mt-5 flex items-center gap-2 text-sm font-medium">
                <CheckIcon className="size-4 shrink-0" />
                Your password was changed. Other devices were signed out.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="mt-12">
        <RecentSignIns />
      </div>
    </Page>
  )
}
