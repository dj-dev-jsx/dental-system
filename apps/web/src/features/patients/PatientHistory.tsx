import { actorName, actorRole } from '../audit/actor'
import { errorMessage } from '../../lib/api'
import { formatDate, formatDateTime, SEX_LABELS } from '../../lib/format'
import { usePatientHistory } from './queries'

const ACTIONS: Record<string, string> = {
  PATIENT_CREATED: 'registered the patient',
  PATIENT_VIEWED: 'opened the record',
  PATIENT_UPDATED: 'changed the record',
  PATIENT_ARCHIVED: 'archived the patient',
  PATIENT_RESTORED: 'restored the patient',
  APPOINTMENT_LISTED: 'looked at their appointments',
  CHART_VIEWED: 'opened the dental chart',
  TOOTH_RECORDED: 'recorded a finding on the chart',
  TOOTH_CORRECTED: 'corrected a chart entry',
  PATIENT_ACCOUNT_LINKED: 'linked an online booking account to the record',
  PATIENT_ACCOUNT_UNLINKED: 'unlinked the online booking account',
}

const FIELDS: Record<string, string> = {
  firstName: 'First name',
  middleName: 'Middle name',
  lastName: 'Last name',
  suffix: 'Suffix',
  birthDate: 'Birth date',
  sex: 'Sex',
  phone: 'Mobile or phone',
  email: 'Email',
  address: 'Address',
  emergencyContactName: 'Emergency contact',
  emergencyContactPhone: 'Emergency contact’s phone',
  privacyConsentAt: 'Privacy consent',
}

type Changes = Record<string, { from: string | null; to: string | null }>

function readable(field: string, value: string | null) {
  if (value === null) return 'empty'
  if (field === 'birthDate') return formatDate(value)
  if (field === 'privacyConsentAt') return `given ${formatDateTime(value)}`
  if (field === 'sex' && (value === 'FEMALE' || value === 'MALE')) return SEX_LABELS[value]
  return `“${value}”`
}

/** Who opened or changed this record, and what changed. The API shows this to admins only. */
export function PatientHistory({ patientId }: { patientId: string }) {
  const { data, isPending, isError, error } = usePatientHistory(patientId, true)

  return (
    <section>
      <h2 className="text-lg font-semibold">History</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Everyone who opened or changed this record. Only admins can see this.
      </p>
      {isPending ? (
        <div className="mt-4 h-24 rounded bg-neutral-100" aria-busy="true" />
      ) : isError ? (
        <p className="mt-4 text-sm" role="alert">{errorMessage(error)}</p>
      ) : (
        <ol className="mt-4 border-t border-neutral-950">
          {data.items.map((entry) => {
            const changes = (entry.metadata as { changes?: Changes } | null)?.changes
            return (
              <li key={entry.id} className="grid gap-1 border-b border-neutral-200 py-3 text-sm sm:grid-cols-[11rem_1fr] sm:gap-6">
                <time dateTime={entry.createdAt} className="text-neutral-500">
                  {formatDateTime(entry.createdAt)}
                </time>
                <div>
                  <p>
                    <span className="font-semibold">
                      {actorName(entry.actor)}
                    </span>
                    <span className="text-neutral-500"> ({actorRole(entry.actor)})</span>{' '}
                    {ACTIONS[entry.action] ?? entry.action}
                  </p>
                  {changes && (
                    <ul className="mt-1 text-neutral-700">
                      {Object.entries(changes).map(([field, { from, to }]) => (
                        <li key={field}>
                          {FIELDS[field] ?? field}: {readable(field, from)} to {readable(field, to)}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
      {data && data.total > data.items.length && (
        <p className="mt-3 text-sm text-neutral-500">Showing the latest {data.items.length} of {data.total}.</p>
      )}
    </section>
  )
}
