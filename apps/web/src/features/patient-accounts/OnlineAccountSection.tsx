import { type ReactNode, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { Pill } from '../../components/Table'
import { formatDate, formatDateTime, manilaDate } from '../../lib/format'
import { RecordSection } from '../patients/RecordSection'
import { errorCode, onlineErrorMessage } from './errors'
import { useUnlinkAccount } from './queries'
import type { OnlineAccount } from './types'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-neutral-600">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  )
}

/**
 * The online booking account tied to this record: who signs in as this patient on the
 * clinic's booking page. Admins can undo a link made by mistake, asked inline.
 */
export function OnlineAccountSection({ patientId, account, canUnlink }: { patientId: string; account: OnlineAccount; canUnlink: boolean }) {
  const unlink = useUnlinkAccount(patientId)
  const [asking, setAsking] = useState(false)

  return (
    <RecordSection
      title="Online account"
      action={
        canUnlink &&
        (asking ? (
          <div role="group" aria-label="Confirm unlinking" className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Unlink? They’ll stop seeing this patient’s appointments online.</span>
            <button
              type="button"
              autoFocus
              disabled={unlink.isPending}
              onClick={() => unlink.mutate(account.id, { onSuccess: () => setAsking(false) })}
              className={`${buttonOnLight} h-8 px-3 text-sm`}
            >
              {unlink.isPending ? 'Unlinking…' : 'Unlink'}
            </button>
            <button type="button" disabled={unlink.isPending} onClick={() => setAsking(false)} className={`${buttonOutline} h-8 px-3 text-sm`}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAsking(true)} className="text-sm font-semibold underline underline-offset-3 hover:text-neutral-700">
            Unlink account…
          </button>
        ))
      }
    >
      {unlink.isError && (
        <ErrorBox className="mt-4">
          {errorCode(unlink.error) === 'NOT_LINKED' ? 'This online account was already unlinked, perhaps by someone else. Reload the record to see it as it is now.' : onlineErrorMessage(unlink.error)}
        </ErrorBox>
      )}
      <dl className="grid gap-x-8 gap-y-4 py-4 @md:grid-cols-2 @4xl:grid-cols-3">
        <Fact label="Signs in as">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="break-all">{account.email}</span>
            {account.emailVerifiedAt ? <Pill tone="muted">Email confirmed</Pill> : <Pill tone="outline">Email not confirmed</Pill>}
          </span>
        </Fact>
        <Fact label="Linked">{account.linkedAt ? formatDateTime(account.linkedAt) : <span className="text-neutral-500">Not recorded</span>}</Fact>
        {account.emailVerifiedAt && <Fact label="Email confirmed">{formatDate(manilaDate(account.emailVerifiedAt))}</Fact>}
      </dl>
      <p className="border-t border-neutral-200 py-3 text-sm text-neutral-600">
        They can ask for appointments on the clinic’s booking page and see this patient’s appointments there. Never the dental chart or the record.
      </p>
    </RecordSection>
  )
}
