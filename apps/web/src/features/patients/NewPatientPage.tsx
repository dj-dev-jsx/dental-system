import { Link, useNavigate } from 'react-router'
import { ArrowLeftIcon } from '../../components/icons'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { PatientForm } from './PatientForm'
import { useCreatePatient } from './queries'

export default function NewPatientPage() {
  useDocumentTitle('Register patient')
  const navigate = useNavigate()
  const createPatient = useCreatePatient()

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
      <Link to="/app/patients" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-950">
        <ArrowLeftIcon className="size-4" /> Patients
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-[-0.02em]">Register patient</h1>
      <PatientForm
        submitLabel="Register patient"
        submittingLabel="Registering…"
        cancelTo="/app/patients"
        onSubmit={async (input) => {
          const patient = await createPatient.mutateAsync(input)
          navigate(`/app/patients/${patient.id}`, { replace: true })
        }}
      />
    </div>
  )
}
