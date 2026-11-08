import { useLocation, useNavigate } from 'react-router'
import { DetailBack } from '../../components/SplitView'
import { PageHeader } from '../../components/Page'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { DetailPane } from './DetailPane'
import { useWorkspaceLink } from './listParams'
import { PatientForm } from './PatientForm'
import { useCreatePatient } from './queries'

/**
 * Registering a patient, in the right side of the workspace. Once saved, the new record
 * opens in its place (with a "Registered" note and Book first visit), and the list beside it
 * refreshes to include them.
 */
export default function NewPatientPage() {
  useDocumentTitle('Register patient')
  const createPatient = useCreatePatient()
  const navigate = useNavigate()
  const { search } = useLocation()
  const link = useWorkspaceLink()

  return (
    <DetailPane narrow>
      <DetailBack to={link('/app/patients')} label="Patients" />
      <PageHeader title="Register patient" description="Add a new patient to the clinic." />
      <PatientForm
        submitLabel="Register patient"
        submittingLabel="Registering…"
        cancelTo={link('/app/patients')}
        onSubmit={async (input) => {
          const created = await createPatient.mutateAsync(input)
          void navigate(`/app/patients/${created.id}${search}`, { replace: true, state: { registered: true } })
        }}
      />
    </DetailPane>
  )
}
