import { type ReactNode, useState } from 'react'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { textareaClass } from '../../components/forms'
import { Pill } from '../../components/Table'
import { formatDate, formatDateTime } from '../../lib/format'
import { useWithdrawScan } from './api'
import { scanErrorMessage } from './errors'
import { formatBytes, type Scan } from './types'

/** What is known about the open scan, and (for dentists and admins) the way to withdraw it. */
export function ScanDetails({ patientId, scan, canWithdraw, onMarkTeeth }: { patientId: string; scan: Scan; canWithdraw: boolean; onMarkTeeth?: () => void }) {
  const canMark = canWithdraw && !scan.withdrawn
  return (
    <section aria-label="Scan details" className="px-5 py-5 lg:px-6">
      <h2 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xl font-bold tracking-[-0.02em] break-words">
        {scan.title}
        {scan.withdrawn && <Pill>Withdrawn</Pill>}
      </h2>
      <p className="mt-0.5 text-sm text-neutral-600">Scanned {formatDate(scan.scannedOn)}</p>

      {scan.withdrawn && (
        <div className="mt-4 rounded-md bg-neutral-100 px-3.5 py-3 text-sm/6">
          <p className="font-semibold">Withdrawn{scan.withdrawnAt && ` ${formatDateTime(scan.withdrawnAt)}`}</p>
          {scan.withdrawReason && <p className="mt-0.5 whitespace-pre-line break-words">{scan.withdrawReason}</p>}
          <p className="mt-0.5 text-neutral-600">It is kept for the record, but only admins can still open it.</p>
        </div>
      )}

      {scan.note ? <p className="mt-4 text-sm/6 whitespace-pre-line break-words">{scan.note}</p> : <p className="mt-4 text-sm text-neutral-500">No note.</p>}

      <dl className="mt-4 divide-y divide-neutral-200 border-y border-neutral-200 text-sm">
        <Row label="File">
          <span className="break-all">{scan.fileName}</span>
        </Row>
        <Row label="Format and size">
          {scan.format} · <span className="tabular-nums">{formatBytes(scan.sizeBytes)}</span>
        </Row>
        <Row label="Teeth marked">
          {scan.pinCount > 0 ? (
            <span className="tabular-nums">{scan.pinCount}</span>
          ) : canMark ? (
            'None yet'
          ) : (
            <span className="text-neutral-600">Teeth not marked yet</span>
          )}
        </Row>
        <Row label="Uploaded by">
          {scan.uploadedBy.firstName} {scan.uploadedBy.lastName}, {formatDateTime(scan.createdAt)}
        </Row>
      </dl>

      {canMark && scan.pinCount === 0 && onMarkTeeth && (
        <div className="mt-4 rounded-md bg-neutral-100 px-3.5 py-3">
          <p className="text-sm font-semibold">Mark the teeth on this scan</p>
          <p className="mt-0.5 text-sm/6 text-neutral-600">Place one pin on each tooth, about a minute per arch. Then clicking a tooth on the scan opens its chart.</p>
          <button type="button" onClick={onMarkTeeth} className={`${buttonOnLight} mt-3 h-9 px-4 text-sm`}>
            Mark teeth
          </button>
        </div>
      )}

      {canWithdraw && !scan.withdrawn && <Withdraw patientId={patientId} scan={scan} />}
    </section>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-0.5 py-2.5 sm:grid-cols-[8rem_1fr]">
      <dt className="text-neutral-600">{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

/** Withdrawing hides the scan from everyone but admins. It asks inline, with a reason. */
function Withdraw({ patientId, scan }: { patientId: string; scan: Scan }) {
  const withdraw = useWithdrawScan(patientId, scan.id)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)

  if (!asking) {
    return (
      <div className="mt-4">
        <button type="button" onClick={() => setAsking(true)} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
          Withdraw…
        </button>
        {withdraw.isError && <ErrorBox className="mt-3">{scanErrorMessage(withdraw.error)}</ErrorBox>}
      </div>
    )
  }
  return (
    <form
      className="mt-4 rounded-md bg-neutral-100 p-3.5"
      onSubmit={(event) => {
        event.preventDefault()
        const text = reason.trim()
        if (!text) return setMissing(true)
        withdraw.mutate(text)
      }}
    >
      <p className="text-sm font-semibold">Withdraw this scan?</p>
      <p className="mt-0.5 text-sm/6 text-neutral-600">Use this for a scan taken in error or of the wrong person. It stays in the record, but only admins can open it afterwards.</p>
      <label htmlFor="withdraw-reason" className="mt-3 block text-sm font-semibold">
        Reason
      </label>
      <textarea
        id="withdraw-reason"
        autoFocus
        rows={3}
        maxLength={500}
        value={reason}
        aria-invalid={missing || undefined}
        aria-describedby={missing ? 'withdraw-reason-error' : undefined}
        onChange={(event) => {
          setReason(event.target.value)
          setMissing(false)
        }}
        className={`${textareaClass} mt-1 min-h-20 ${missing ? 'border-2 border-neutral-950' : ''}`}
      />
      {missing && (
        <p id="withdraw-reason-error" className="mt-1 text-sm font-medium">
          Say why this scan is being withdrawn.
        </p>
      )}
      {withdraw.isError && <ErrorBox className="mt-3">{scanErrorMessage(withdraw.error)}</ErrorBox>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={withdraw.isPending} className={`${buttonOnLight} h-9 px-4 text-sm`}>
          {withdraw.isPending ? 'Withdrawing…' : 'Withdraw scan'}
        </button>
        <button type="button" onClick={() => setAsking(false)} className={`${buttonOutline} h-9 px-3.5 text-sm`}>
          Cancel
        </button>
      </div>
    </form>
  )
}
