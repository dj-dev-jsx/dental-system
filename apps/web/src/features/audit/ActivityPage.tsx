import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { compactInputClass } from '../../components/forms'
import { api, errorMessage } from '../../lib/api'
import { formatDateTime } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { ROLE_LABELS } from '../auth/authStore'
import type { AuditEntry, Page } from '../patients/types'

// What each line of the log says, after the person's name.
const ACTIONS: Record<string, string> = {
  LOGIN_SUCCEEDED: 'signed in',
  LOGIN_FAILED: 'failed to sign in',
  LOGOUT: 'signed out',
  PATIENT_CREATED: 'registered a patient',
  PATIENT_LISTED: 'listed or searched patients',
  PATIENT_VIEWED: 'opened a patient’s record',
  PATIENT_UPDATED: 'changed a patient’s record',
  PATIENT_ARCHIVED: 'archived a patient',
  PATIENT_RESTORED: 'restored a patient',
  APPOINTMENT_CREATED: 'booked an appointment',
  APPOINTMENT_LISTED: 'looked at appointments',
  APPOINTMENT_VIEWED: 'opened an appointment',
  APPOINTMENT_UPDATED: 'changed an appointment',
  APPOINTMENT_CONFIRMED: 'confirmed an appointment',
  APPOINTMENT_DECLINED: 'declined a request',
  APPOINTMENT_CANCELLED: 'cancelled an appointment',
  CHART_VIEWED: 'opened a dental chart',
  TOOTH_RECORDED: 'recorded a finding on a chart',
  TOOTH_CORRECTED: 'corrected a chart entry',
}

const FAILURE_REASONS: Record<string, string> = {
  WRONG_PASSWORD: 'wrong password',
  ACCOUNT_LOCKED: 'account locked',
  ACCOUNT_DEACTIVATED: 'account deactivated',
}

/** Where the line's record lives, when it's about one record. */
function recordLink(entry: AuditEntry) {
  if (!entry.entityId) return null
  // Looking at appointments is logged against the patient whose appointments they were.
  if (entry.action.startsWith('PATIENT_') || entry.action === 'APPOINTMENT_LISTED') {
    return { to: `/app/patients/${entry.entityId}`, label: 'Patient' }
  }
  if (entry.action === 'CHART_VIEWED' || entry.action.startsWith('TOOTH_')) {
    return { to: `/app/patients/${entry.entityId}/chart`, label: 'Chart' }
  }
  if (entry.action.startsWith('APPOINTMENT_')) return { to: `/app/appointments/${entry.entityId}`, label: 'Appointment' }
  return null
}

function detail(entry: AuditEntry) {
  const metadata = entry.metadata as { reason?: string; changes?: Record<string, unknown> } | null
  if (entry.action === 'LOGIN_FAILED' && metadata?.reason) return FAILURE_REASONS[metadata.reason] ?? null
  if (metadata?.changes) {
    const count = Object.keys(metadata.changes).length
    return count === 1 ? '1 detail changed' : `${count} details changed`
  }
  return null
}

const LIMIT = 50

/**
 * Who did what, newest first: every sign-in, every record opened or changed. Admins only,
 * because the log itself holds patient details. It can't be edited, even from here.
 */
export default function ActivityPage() {
  useDocumentTitle('Activity log')
  const [params, setParams] = useSearchParams()
  const page = Math.max(1, Number(params.get('page')) || 1)
  const action = params.get('action') ?? ''

  const query = new URLSearchParams({ page: String(page), limit: String(LIMIT) })
  if (action) query.set('action', action)
  const log = useQuery({
    queryKey: ['audit', page, action],
    queryFn: () => api<Page<AuditEntry>>(`/audit-logs?${query}`),
    placeholderData: keepPreviousData,
  })

  function update(changes: Record<string, string | null>) {
    setParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(changes)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    })
  }

  const first = log.data && log.data.total > 0 ? (page - 1) * LIMIT + 1 : 0
  const last = log.data ? Math.min(page * LIMIT, log.data.total) : 0

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em]">Activity log</h1>
          <p className="mt-1 max-w-2xl text-neutral-600">Every sign-in, and every patient record and appointment opened or changed. Nobody can edit or delete these lines.</p>
        </div>
        <div>
          <label htmlFor="activity-action" className="sr-only">
            Show
          </label>
          <select id="activity-action" value={action} onChange={(event) => update({ action: event.target.value || null, page: null })} className={compactInputClass}>
            <option value="">All activity</option>
            {Object.entries(ACTIONS).map(([value, label]) => (
              <option key={value} value={value}>
                {label[0].toUpperCase() + label.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {log.isError ? (
        <ErrorBox className="mt-8">{errorMessage(log.error)}</ErrorBox>
      ) : log.isPending ? (
        <div className="mt-8 border-t border-neutral-950" aria-busy="true" aria-label="Loading the activity log">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="flex gap-8 border-b border-neutral-200 py-3.5">
              <div className="h-4 w-36 rounded bg-neutral-100" />
              <div className="h-4 w-72 rounded bg-neutral-100" />
            </div>
          ))}
        </div>
      ) : log.data.items.length === 0 ? (
        <div className="mt-8 border-t border-neutral-950 py-12">
          <p className="text-lg font-semibold">Nothing logged{action ? ' of this kind' : ''} yet</p>
          <p className="mt-1 text-neutral-600">Choose “All activity” to see everything.</p>
        </div>
      ) : (
        <>
          <ol className={`mt-8 border-t border-neutral-950 transition-opacity ${log.isPlaceholderData ? 'opacity-50' : ''}`}>
            {log.data.items.map((entry) => {
              const link = recordLink(entry)
              const extra = detail(entry)
              return (
                <li key={entry.id} className="grid gap-x-6 gap-y-0.5 border-b border-neutral-200 py-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)_auto]">
                  <time dateTime={entry.createdAt} className="text-neutral-500">
                    {formatDateTime(entry.createdAt)}
                  </time>
                  <p>
                    <span className="font-semibold">
                      {entry.actor.firstName} {entry.actor.lastName}
                    </span>
                    <span className="text-neutral-500"> ({ROLE_LABELS[entry.actor.role]})</span> {ACTIONS[entry.action] ?? entry.action}
                    {extra && <span className="text-neutral-500">, {extra}</span>}
                  </p>
                  {link ? (
                    <Link to={link.to} className="font-medium underline underline-offset-3 hover:no-underline">
                      {link.label}
                    </Link>
                  ) : (
                    <span />
                  )}
                </li>
              )
            })}
          </ol>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-neutral-600">
              Showing {first}–{last} of {log.data.total}
            </p>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })} className={`${buttonOutline} h-9 px-3 disabled:cursor-not-allowed`}>
                Newer
              </button>
              <button type="button" disabled={last >= log.data.total} onClick={() => update({ page: String(page + 1) })} className={`${buttonOutline} h-9 px-3 disabled:cursor-not-allowed`}>
                Older
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
