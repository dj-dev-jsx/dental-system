import { Link, useSearchParams } from 'react-router'
import { buttonOutline } from '../../components/buttons'
import { PlusIcon } from '../../components/icons'
import { DetailEmpty } from '../../components/SplitView'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { readListParams, useWorkspaceLink } from './listParams'

/** The right side of the patients workspace before anyone is picked. Kept quiet on purpose. */
export default function NoPatientSelected() {
  const [params] = useSearchParams()
  const { archived } = readListParams(params)
  const link = useWorkspaceLink()
  // Set here rather than by the list, so an open record's own title wins.
  useDocumentTitle(archived ? 'Archived patients' : 'Patients')
  return (
    <DetailEmpty
      title="No patient open"
      text="Pick someone from the list to see their record here. Search finds a patient by name or mobile number."
      action={
        <Link to={link('/app/patients/new')} className={`${buttonOutline} h-9 px-4 text-sm`}>
          <PlusIcon className="size-4" /> Register patient
        </Link>
      }
    />
  )
}
