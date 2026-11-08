import { useNavigate, useParams } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { ErrorBox } from '../../components/ErrorBox'
import { PageHeader } from '../../components/Page'
import { errorMessage } from '../../lib/api'
import { fullName } from '../../lib/format'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { DetailPane } from './DetailPane'
import { useWorkspaceLink } from './listParams'
import { PatientForm } from './PatientForm'
import { usePatient, useUpdatePatient } from './queries'

export default function EditPatientPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { data: patient, isPending, isError, error, refetch } = usePatient(id)
  const updatePatient = useUpdatePatient(id)
  useDocumentTitle(patient ? `Edit ${fullName(patient)}` : 'Edit patient')
  const link = useWorkspaceLink()
  const back = { to: link(`/app/patients/${id}`), label: 'Back to the record' }

  return (
    <DetailPane narrow>
      {isPending ? (
        <div aria-busy="true" aria-label="Loading the record">
          <div className="h-4 w-32 rounded bg-neutral-100" />
          <div className="mt-6 h-9 w-72 rounded bg-neutral-100" />
          <div className="mt-10 h-64 rounded bg-neutral-100" />
        </div>
      ) : isError ? (
        <PageHeader title="Edit patient" back={back}>
          <ErrorBox className="mt-6">{errorMessage(error)}</ErrorBox>
          <button type="button" onClick={() => void refetch()} className={`${buttonOutline} mt-4 h-9 px-4 text-sm`}>
            Try again
          </button>
        </PageHeader>
      ) : patient.archivedAt ? (
        <PageHeader title={fullName(patient)} back={back} description="Archived patients can’t be edited. An admin can restore the record first." />
      ) : (
        <>
          <PageHeader title={`Edit ${fullName(patient)}`} back={back} />
          <PatientForm
            patient={patient}
            submitLabel="Save changes"
            submittingLabel="Saving…"
            cancelTo={back.to}
            onSubmit={async (input) => {
              await updatePatient.mutateAsync(input)
              void navigate(back.to, { replace: true })
            }}
          />
        </>
      )}
    </DetailPane>
  )
}
