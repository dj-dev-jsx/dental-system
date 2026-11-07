import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeftIcon } from '../../components/icons'
import { errorMessage } from '../../lib/api'
import { fullName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PatientForm } from './PatientForm'
import { usePatient, useUpdatePatient } from './queries'

export default function EditPatientPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: patient, isPending, isError, error } = usePatient(id)
  const updatePatient = useUpdatePatient(id)
  useDocumentTitle(patient ? `Edit ${fullName(patient)}` : 'Edit patient')

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to={`/app/patients/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> Back to the record
      </Link>
      {isPending ? (
        <div className="mt-4 h-9 w-72 rounded bg-neutral-100" aria-busy="true" />
      ) : isError ? (
        <p className="mt-6" role="alert">{errorMessage(error)}</p>
      ) : patient.archivedAt ? (
        <>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em] text-balance">{fullName(patient)}</h1>
          <p className="mt-4 text-neutral-600">Archived patients can’t be edited. An admin can restore the record first.</p>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em] text-balance">Edit {fullName(patient)}</h1>
          <PatientForm
            patient={patient}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            cancelTo={`/app/patients/${id}`}
            onSubmit={async (input) => {
              await updatePatient.mutateAsync(input)
              navigate(`/app/patients/${id}`, { replace: true })
            }}
          />
        </>
      )}
    </div>
  )
}
