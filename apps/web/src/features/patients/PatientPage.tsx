import { useState } from 'react'
import { Link, useParams } from 'react-router'
import { buttonOnLight, buttonOutline } from '../../components/buttons'
import { Detail, Details } from '../../components/Details'
import { AlertIcon, ArrowLeftIcon, ToothIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { ageLabel, formatDate, formatDateTime, fullName, SEX_LABELS } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PatientAppointments } from '../appointments/PatientAppointments'
import { useStaffUser } from '../auth/authStore'
import { PatientHistory } from './PatientHistory'
import { usePatient, useSetArchived } from './queries'

export default function PatientPage() {
  const { id = '' } = useParams()
  const user = useStaffUser()
  const isAdmin = user.role === 'ADMIN'
  const { data: patient, isPending, isError, error } = usePatient(id)
  const setArchived = useSetArchived(id)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  useDocumentTitle(patient ? fullName(patient) : 'Patient')

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8" aria-busy="true" aria-label="Loading the record">
        <div className="h-4 w-24 rounded bg-neutral-100" />
        <div className="mt-6 h-9 w-80 max-w-full rounded bg-neutral-100" />
        <div className="mt-10 h-48 rounded bg-neutral-100" />
      </div>
    )
  }
  if (isError) {
    return (
      <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8">
        <Link to="/app/patients" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
          <ArrowLeftIcon className="size-4" /> Patients
        </Link>
        <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Patient not found</h1>
        <p className="mt-2 text-neutral-600">{errorMessage(error)}</p>
      </div>
    )
  }

  const archived = Boolean(patient.archivedAt)

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/app/patients" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> Patients
      </Link>

      {archived && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-md bg-neutral-100 px-4 py-3">
          <p className="text-sm/6">
            <span className="font-semibold">Archived {formatDateTime(patient.archivedAt!)}.</span> The record is kept,
            but the patient no longer appears in the patient list.
          </p>
          {isAdmin && (
            <button type="button" disabled={setArchived.isPending} onClick={() => setArchived.mutate(false)} className={`${buttonOnLight} h-9 px-4 text-sm`}>
              {setArchived.isPending ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-[-0.02em] text-balance">{fullName(patient)}</h1>
          <p className="mt-1 text-neutral-600">
            {ageLabel(patient.birthDate)}
            {patient.sex && ` · ${SEX_LABELS[patient.sex]}`}
          </p>
        </div>
        {!archived && (
          <div className="flex flex-wrap items-center gap-3">
            {confirmingArchive ? (
              <div role="group" aria-label="Confirm archiving" className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium">Archive this patient?</span>
                <button type="button" disabled={setArchived.isPending} onClick={() => setArchived.mutate(true, { onSuccess: () => setConfirmingArchive(false) })} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  {setArchived.isPending ? 'Archiving…' : 'Archive'}
                </button>
                <button type="button" onClick={() => setConfirmingArchive(false)} className={`${buttonOutline} h-9 px-4 text-sm`}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <Link to={`/app/patients/${id}/chart`} className={`${buttonOnLight} h-9 px-4 text-sm`}>
                  <ToothIcon className="size-4" /> Dental chart
                </Link>
                <Link to={`/app/patients/${id}/edit`} className={`${buttonOutline} h-9 px-4 text-sm`}>
                  Edit
                </Link>
                {isAdmin && (
                  <button type="button" onClick={() => setConfirmingArchive(true)} className={`${buttonOutline} h-9 px-4 text-sm`}>
                    Archive
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {setArchived.isError && (
        <p className="mt-4 flex gap-3 rounded-md bg-neutral-950 px-3.5 py-3 text-sm/6 text-white" role="alert">
          <AlertIcon className="mt-0.5 shrink-0" />
          {errorMessage(setArchived.error)}
        </p>
      )}

      <div className="mt-10 grid gap-10">
        <PatientAppointments patientId={id} canBook={!archived} />

        <Details title="Contact">
          <Detail label="Mobile or phone">{patient.phone}</Detail>
          <Detail label="Email">{patient.email}</Detail>
          <Detail label="Address">{patient.address && <span className="whitespace-pre-line">{patient.address}</span>}</Detail>
        </Details>

        <Details title="Emergency contact">
          <Detail label="Name">{patient.emergencyContactName}</Detail>
          <Detail label="Mobile or phone">{patient.emergencyContactPhone}</Detail>
        </Details>

        <Details title="Record">
          <Detail label="Birth date">
            {formatDate(patient.birthDate)} <span className="text-neutral-500">({ageLabel(patient.birthDate)})</span>
          </Detail>
          <Detail label="Sex">{patient.sex && SEX_LABELS[patient.sex]}</Detail>
          <Detail label="Privacy consent">{patient.privacyConsentAt && `Given ${formatDateTime(patient.privacyConsentAt)}`}</Detail>
          <Detail label="Registered">{formatDateTime(patient.createdAt)}</Detail>
          <Detail label="Last changed">{formatDateTime(patient.updatedAt)}</Detail>
        </Details>

        {isAdmin && <PatientHistory patientId={id} />}
      </div>
    </div>
  )
}
